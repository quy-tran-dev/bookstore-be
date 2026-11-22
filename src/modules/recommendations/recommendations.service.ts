import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Product } from '../products/entities/product.entity';
import { Order } from '../orders/entities/order.entity';
import { AiService } from '../ai/ai.service';
import {
  PersonalizedRecommendationResponse,
  RecommendedBookItem,
  SimilarBooksResponse,
} from './interfaces/recommendation.interface';

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  // Thời gian lưu Cache kết quả gợi ý sách tương đồng: 60 phút (tính bằng ms)
  private static readonly SIMILAR_BOOKS_CACHE_TTL_MS = 60 * 60 * 1000;
  // Số chiều chuẩn của Vector MiniLM-L12-v2
  private static readonly VECTOR_DIMENSION = 384;

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly aiService: AiService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * 1. GỢI Ý SÁCH TƯƠNG TỰ THUẦN NGỮ NGHĨA AI (PURE SEMANTIC SIMILARITY - OPTION A)
   * -----------------------------------------------------------------------------
   * Cơ chế chấm điểm & toán học:
   * - Sử dụng toán tử khoảng cách Cosine (`<=>`) của pgvector trên không gian 384 chiều (MiniLM).
   * - Công thức quy đổi điểm tương đồng:
   *     similarityScore = 1 - cosineDistance = 1 - (product.embedding <=> sourceVector)
   * - Không giới hạn trong cùng danh mục (Category) để AI tự do phát hiện các tác phẩm có sự tương đồng
   *   sâu về mặt tư tưởng, chủ đề và ngữ nghĩa.
   * - Áp dụng bộ lọc ngưỡng sàn `minSimilarity` (mặc định: 0.60 tương ứng 60% tương đồng) để loại bỏ nhiễu.
   */
  async getSimilarBooks(
    slugOrId: string,
    limit: number = 6,
    minSimilarity: number = 0.6,
  ): Promise<SimilarBooksResponse> {
    const cleanKey = (slugOrId || '').trim();
    const safeLimit = Math.min(12, Math.max(1, Number(limit || 6)));
    const safeMinSim = Math.min(0.95, Math.max(0.3, Number(minSimilarity ?? 0.6)));

    const cacheKey = `/recommendations/similar/${cleanKey}/l${safeLimit}/m${safeMinSim}`;
    const cached = await this.cacheManager.get<SimilarBooksResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    // Bước 1: Tìm cuốn sách gốc (kèm cột vector embedding dưới dạng chuỗi để tái sử dụng)
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        cleanKey,
      );

    const rawSource = await this.productRepository
      .createQueryBuilder('product')
      .select([
        'product.id AS id',
        'product.name AS name',
        'product.slug AS slug',
        'product.shortDescribe AS short_describe',
        'product.seoKeywords AS seo_keywords',
        'product.embedding::text AS embedding_text',
      ])
      .where(
        isUuid ? 'product.id = :cleanKey' : 'product.slug = :cleanKey',
        { cleanKey },
      )
      .andWhere('product.deleted_at IS NULL')
      .getRawOne();

    if (!rawSource) {
      throw new NotFoundException(
        `Không tìm thấy cuốn sách "${cleanKey}" để phân tích gợi ý tương đồng.`,
      );
    }

    // Bước 2: Trích xuất vector 384 chiều của sách gốc (nếu DB chưa có sẵn thì gọi MiniLM sinh tức thời)
    let sourceVector = this.parsePgVector(rawSource.embedding_text);
    if (sourceVector.length !== RecommendationsService.VECTOR_DIMENSION) {
      const fallbackText = `Tên sách: ${rawSource.name}. Từ khóa: ${rawSource.seo_keywords || ''}. Mô tả: ${rawSource.short_describe || ''}`;
      sourceVector = await this.aiService.generateEmbedding(fallbackText);
    }

    let items: RecommendedBookItem[] = [];
    if (sourceVector.length === RecommendationsService.VECTOR_DIMENSION) {
      items = await this.findBooksByTargetVector(
        sourceVector,
        [rawSource.id],
        safeLimit,
        safeMinSim,
        (score) =>
          `Tương đồng ${Math.round(score * 100)}% về nội dung & ngữ nghĩa với "${rawSource.name}"`,
      );
    }

    // Nếu số lượng sách đạt ngưỡng 0.60 quá ít (hoặc kho sách nhỏ), bổ sung thêm từ Cold-Start Bestseller
    if (items.length === 0) {
      items = await this.getColdStartBooks([rawSource.id], safeLimit);
    }

    const response: SimilarBooksResponse = {
      sourceBook: {
        id: rawSource.id,
        name: rawSource.name,
        slug: rawSource.slug,
      },
      strategy:
        sourceVector.length === RecommendationsService.VECTOR_DIMENSION
          ? 'SEMANTIC_SIMILARITY'
          : 'COLD_START',
      minSimilarityThreshold: safeMinSim,
      totalRecommended: items.length,
      items,
    };

    await this.cacheManager.set(
      cacheKey,
      response,
      RecommendationsService.SIMILAR_BOOKS_CACHE_TTL_MS,
    );

    return response;
  }

  /**
   * 2. GỢI Ý SÁCH CÁ NHÂN HÓA THEO HỒ SƠ ĐỘC GIẢ (USER PROFILE CENTROID VECTOR)
   * -----------------------------------------------------------------------------
   * Cơ chế chấm điểm & toán học:
   * - Nếu khách hàng đã đăng nhập và có lịch sử đặt sách:
   *   1. Thu thập tập vector {V_1, V_2, ..., V_N} của các cuốn sách khách đã mua trong các đơn hàng gần nhất.
   *   2. Tính Vector Trọng Tâm (Centroid Vector) đại diện cho "gu" đọc sách của độc giả:
   *        V_user = Normalize( (1 / N) * Sum(V_i) )
   *   3. Truy vấn pgvector Cosine Distance (<=>) giữa V_user và kho sách, loại trừ toàn bộ các cuốn khách đã mua.
   * - Nếu khách vãng lai (chưa đăng nhập) hoặc tài khoản mới chưa có đơn hàng:
   *   -> Tự động chuyển sang chiến lược Khởi động lạnh (COLD_START: Top sách bán chạy còn hàng).
   */
  async getPersonalizedRecommendations(
    userId?: string,
    limit: number = 8,
    minSimilarity: number = 0.6,
  ): Promise<PersonalizedRecommendationResponse> {
    const safeLimit = Math.min(12, Math.max(1, Number(limit || 8)));
    const safeMinSim = Math.min(0.95, Math.max(0.3, Number(minSimilarity ?? 0.6)));

    if (!userId) {
      const coldItems = await this.getColdStartBooks([], safeLimit);
      return {
        strategy: 'COLD_START',
        basedOnBookCount: 0,
        minSimilarityThreshold: safeMinSim,
        totalRecommended: coldItems.length,
        items: coldItems,
      };
    }

    // Lấy tối đa 10 đơn hàng gần nhất của user để trích xuất danh sách sách đã tương tác
    const recentOrders = await this.orderRepository.find({
      where: { user: { id: userId } },
      relations: { items: { product: true } },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const purchasedProductIds = Array.from(
      new Set(
        recentOrders
          .flatMap((o) => o.items || [])
          .map((item) => item.product?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (purchasedProductIds.length === 0) {
      const coldItems = await this.getColdStartBooks([], safeLimit);
      return {
        strategy: 'COLD_START',
        basedOnBookCount: 0,
        minSimilarityThreshold: safeMinSim,
        totalRecommended: coldItems.length,
        items: coldItems,
      };
    }

    // Lấy danh sách vector của các cuốn sách user đã mua
    const vectors = await this.fetchProductVectorsByIds(purchasedProductIds);
    if (vectors.length === 0) {
      const coldItems = await this.getColdStartBooks(
        purchasedProductIds,
        safeLimit,
      );
      return {
        strategy: 'COLD_START',
        basedOnBookCount: purchasedProductIds.length,
        minSimilarityThreshold: safeMinSim,
        totalRecommended: coldItems.length,
        items: coldItems,
      };
    }

    // Tính Vector trọng tâm hồ sơ sở thích độc giả (User Centroid Vector)
    const centroidVector = this.computeCentroidVector(vectors);

    let items = await this.findBooksByTargetVector(
      centroidVector,
      purchasedProductIds,
      safeLimit,
      safeMinSim,
      (score) =>
        `Phù hợp ${Math.round(score * 100)}% với gu đọc sách từ lịch sử mua hàng của bạn`,
    );

    if (items.length === 0) {
      items = await this.getColdStartBooks(purchasedProductIds, safeLimit);
      return {
        strategy: 'COLD_START',
        basedOnBookCount: purchasedProductIds.length,
        minSimilarityThreshold: safeMinSim,
        totalRecommended: items.length,
        items,
      };
    }

    return {
      strategy: 'USER_CENTROID',
      basedOnBookCount: vectors.length,
      minSimilarityThreshold: safeMinSim,
      totalRecommended: items.length,
      items,
    };
  }

  /**
   * 3. GỢI Ý SÁCH MUA KÈM TRONG GIỎ HÀNG (CART COMPLEMENTARY CROSS-SELLING)
   * -----------------------------------------------------------------------------
   * Tính Vector trọng tâm của các cuốn sách đang có trong giỏ hàng và tìm các cuốn sách
   * có ngữ nghĩa bổ trợ gần nhất (loại trừ những cuốn đã nằm trong giỏ).
   */
  async getCartComplementaryBooks(
    productIds: string[],
    limit: number = 6,
    minSimilarity: number = 0.6,
  ): Promise<PersonalizedRecommendationResponse> {
    const cleanIds = Array.from(
      new Set((productIds || []).map((id) => id.trim()).filter(Boolean)),
    );
    const safeLimit = Math.min(12, Math.max(1, Number(limit || 6)));
    const safeMinSim = Math.min(0.95, Math.max(0.3, Number(minSimilarity ?? 0.6)));

    if (cleanIds.length === 0) {
      const coldItems = await this.getColdStartBooks([], safeLimit);
      return {
        strategy: 'COLD_START',
        basedOnBookCount: 0,
        minSimilarityThreshold: safeMinSim,
        totalRecommended: coldItems.length,
        items: coldItems,
      };
    }

    const vectors = await this.fetchProductVectorsByIds(cleanIds);
    if (vectors.length === 0) {
      const coldItems = await this.getColdStartBooks(cleanIds, safeLimit);
      return {
        strategy: 'COLD_START',
        basedOnBookCount: cleanIds.length,
        minSimilarityThreshold: safeMinSim,
        totalRecommended: coldItems.length,
        items: coldItems,
      };
    }

    const cartCentroid = this.computeCentroidVector(vectors);
    let items = await this.findBooksByTargetVector(
      cartCentroid,
      cleanIds,
      safeLimit,
      safeMinSim,
      (score) =>
        `Đồng điệu ${Math.round(score * 100)}% về chủ đề với các sách trong giỏ hàng của bạn`,
    );

    if (items.length === 0) {
      items = await this.getColdStartBooks(cleanIds, safeLimit);
      return {
        strategy: 'COLD_START',
        basedOnBookCount: cleanIds.length,
        minSimilarityThreshold: safeMinSim,
        totalRecommended: items.length,
        items,
      };
    }

    return {
      strategy: 'CART_CENTROID',
      basedOnBookCount: vectors.length,
      minSimilarityThreshold: safeMinSim,
      totalRecommended: items.length,
      items,
    };
  }

  // ===========================================================================
  // CÁC HÀM TOÁN HỌC VECTOR & TRUY VẤN PGVECTOR NỘI BỘ
  // ===========================================================================

  /**
   * Tính Vector Trọng Tâm (Centroid Vector) từ một tập hợp các Vector 384 chiều,
   * sau đó chuẩn hóa L2 (Unit Vector Normalization) để đảm bảo độ chính xác khi tính Cosine Distance (<=>).
   */
  computeCentroidVector(vectors: number[][]): number[] {
    if (!vectors || vectors.length === 0) return [];
    const dim = vectors[0].length;
    if (dim === 0) return [];

    const centroid = new Array<number>(dim).fill(0);
    for (const vec of vectors) {
      if (vec.length !== dim) continue;
      for (let i = 0; i < dim; i++) {
        centroid[i] += vec[i];
      }
    }

    // Chia trung bình cộng và tính chuẩn L2 (Euclidean Norm)
    let normSq = 0;
    const count = vectors.length;
    for (let i = 0; i < dim; i++) {
      centroid[i] /= count;
      normSq += centroid[i] * centroid[i];
    }

    const norm = Math.sqrt(normSq);
    if (norm === 0) return centroid;

    // Chuẩn hóa về Vector đơn vị (Unit Vector)
    return centroid.map((val) => Number((val / norm).toFixed(6)));
  }

  /**
   * Truy vấn kho sách bằng toán tử Cosine Distance (<=>) của pgvector:
   * - Điều kiện ngưỡng: `1 - (product.embedding <=> :targetVector) >= :minSimilarity`
   *   (tương đương `product.embedding <=> :targetVector <= 1 - :minSimilarity`).
   * - Bảo mật dữ liệu (Data Projection Security): Chỉ select các cột công khai, tuyệt đối KHÔNG lấy cột `cost` (giá vốn).
   */
  private async findBooksByTargetVector(
    targetVector: number[],
    excludeIds: string[],
    limit: number,
    minSimilarity: number,
    reasonBuilder: (similarityScore: number) => string,
  ): Promise<RecommendedBookItem[]> {
    const formattedVector = `[${targetVector.join(',')}]`;
    const maxCosineDistance = Number((1 - minSimilarity).toFixed(4));

    const qb = this.productRepository
      .createQueryBuilder('product')
      .select(['product.id AS id'])
      .addSelect(
        '(1 - (product.embedding <=> :targetVector))',
        'similarity_score',
      )
      .where('product.status = :status', { status: 1 })
      .andWhere('product.isVerified = :isVerified', { isVerified: true })
      .andWhere('product.deleted_at IS NULL')
      .andWhere('product.embedding IS NOT NULL')
      .andWhere('product.embedding <=> :targetVector <= :maxCosineDistance', {
        targetVector: formattedVector,
        maxCosineDistance,
      });

    if (excludeIds && excludeIds.length > 0) {
      qb.andWhere('product.id NOT IN (:...excludeIds)', { excludeIds });
    }

    const rawMatches = await qb
      .orderBy('similarity_score', 'DESC')
      .limit(limit)
      .getRawMany();

    if (rawMatches.length === 0) return [];

    const matchedIds = rawMatches.map((r) => r.id);
    const products = await this.productRepository.find({
      where: { id: In(matchedIds) },
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        finalPrice: true,
        shortDescribe: true,
        stockQuantity: true,
        soldCount: true,
      },
      relations: {
        categories: true,
        authors: true,
        albums: { media: true },
      },
    });

    const items: RecommendedBookItem[] = [];
    for (const raw of rawMatches) {
      const p = products.find((prod) => prod.id === raw.id);
      if (!p) continue;

      const score = Number(
        Math.max(0, Math.min(1, parseFloat(raw.similarity_score))).toFixed(4),
      );
      items.push(this.mapProductToRecommendedItem(p, score, reasonBuilder(score)));
    }

    return items;
  }

  /**
   * Chiến lược Khởi động lạnh (Cold-Start Strategy):
   * Lấy các cuốn sách thịnh hành nhất (sắp xếp theo soldCount giảm dần, ưu tiên sách còn hàng)
   */
  private async getColdStartBooks(
    excludeIds: string[],
    limit: number,
  ): Promise<RecommendedBookItem[]> {
    const qb = this.productRepository
      .createQueryBuilder('product')
      .select(['product.id AS id'])
      .where('product.status = :status', { status: 1 })
      .andWhere('product.isVerified = :isVerified', { isVerified: true })
      .andWhere('product.deleted_at IS NULL');

    if (excludeIds && excludeIds.length > 0) {
      qb.andWhere('product.id NOT IN (:...excludeIds)', { excludeIds });
    }

    const rawTop = await qb
      .orderBy('product.soldCount', 'DESC')
      .addOrderBy('product.stockQuantity', 'DESC')
      .limit(limit)
      .getRawMany();

    if (rawTop.length === 0) return [];

    const topIds = rawTop.map((r) => r.id);
    const products = await this.productRepository.find({
      where: { id: In(topIds) },
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        finalPrice: true,
        shortDescribe: true,
        stockQuantity: true,
        soldCount: true,
      },
      relations: {
        categories: true,
        authors: true,
        albums: { media: true },
      },
    });

    const items: RecommendedBookItem[] = [];
    for (const raw of rawTop) {
      const p = products.find((prod) => prod.id === raw.id);
      if (!p) continue;
      items.push(
        this.mapProductToRecommendedItem(
          p,
          null,
          'Sách thịnh hành được nhiều độc giả yêu thích tại Bookstore',
        ),
      );
    }

    return items;
  }

  /**
   * Truy xuất danh sách Vector 384 chiều của một tập ID sách từ PostgreSQL
   */
  private async fetchProductVectorsByIds(
    productIds: string[],
  ): Promise<number[][]> {
    if (!productIds || productIds.length === 0) return [];

    const rows = await this.productRepository
      .createQueryBuilder('product')
      .select([
        'product.id AS id',
        'product.embedding::text AS embedding_text',
      ])
      .where('product.id IN (:...productIds)', { productIds })
      .andWhere('product.embedding IS NOT NULL')
      .getRawMany();

    return rows
      .map((r) => this.parsePgVector(r.embedding_text))
      .filter((vec) => vec.length === RecommendationsService.VECTOR_DIMENSION);
  }

  /**
   * Chuyển đổi dữ liệu cột `vector` của pgvector (chuỗi "[0.01,-0.02,...]" hoặc mảng số) thành `number[]`
   */
  parsePgVector(rawVector: unknown): number[] {
    if (!rawVector) return [];
    if (Array.isArray(rawVector)) {
      return rawVector.map((n) => Number(n));
    }
    if (typeof rawVector === 'string') {
      try {
        const parsed = JSON.parse(rawVector);
        return Array.isArray(parsed) ? parsed.map((n) => Number(n)) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private mapProductToRecommendedItem(
    p: Product,
    similarityScore: number | null,
    recommendationReason: string,
  ): RecommendedBookItem {
    return {
      id: p.id,
      name: p.name || '',
      slug: p.slug || '',
      price: Number(p.price || 0),
      finalPrice: Number(p.finalPrice || p.price || 0),
      shortDescribe: p.shortDescribe || '',
      stockQuantity: Number(p.stockQuantity || 0),
      soldCount: Number(p.soldCount || 0),
      thumbnailUrl: p.albums?.[0]?.media?.fileUrl || null,
      categories: p.categories?.map((c) => c.name || '').filter(Boolean) || [],
      authors: p.authors?.map((a) => a.name || '').filter(Boolean) || [],
      similarityScore,
      recommendationReason,
    };
  }
}
