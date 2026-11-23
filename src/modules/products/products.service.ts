import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, ILike, In, Repository } from 'typeorm';
import { BaseService } from '@app/common/base/base.service';
import { Product } from './entities/product.entity';
import { SlugUtil } from '@app/common/utils/slug.util';
import { AlbumFormatUtil } from '@app/common/utils/album-format.util';
import { MediaService } from '../media/media.service';
import { AiService } from '../ai/ai.service';
import { Category } from '../categories/entities/category.entity';
import { MediaFolder } from '@app/common/enums/media-folder.enum';
import { StatusProduct } from '@app/common/enums/status-product.enum';
import { StatusReview } from '@app/common/enums/status-review.enum';
import { ProductAlbum } from './entities/product-album.entity';
import { SectionSanitizeUtil } from './utils/section-sanitize.util';
import { SectionDiffUtil } from './utils/section-diff.util';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { v7 as uuidv7 } from 'uuid';
@Injectable()
export class ProductsService extends BaseService<Product> {
  private readonly logger = new Logger(ProductsService.name);
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly mediaService: MediaService,
    private readonly aiService: AiService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    super(productRepository);
  }

  // --- HELPER CHUẨN HÓA DỮ LIỆU ---
  private formatRelationData(data: any) {
    const formattedData = { ...data };

    if (data.categoryIds) {
      formattedData.categories = data.categoryIds.map((id: string) => ({ id }));
      delete formattedData.categoryIds;
    }

    if (data.authorIds) {
      formattedData.authors = data.authorIds.map((id: string) => ({ id }));
      delete formattedData.authorIds;
    }
    if (data.albums && Array.isArray(data.albums)) {
      const mappedAlbums = data.albums.map((item) => ({
        displayOrder: item.displayOrder !== undefined ? item.displayOrder : 0,
        media: { id: item.mediaId },
      }));

      formattedData.albums = AlbumFormatUtil.formatAlbumsOrder(mappedAlbums);
    }

    return formattedData;
  }

  async create(data: any, currentUserId?: string): Promise<Product> {
    if (!data.slug && data.name) data.slug = SlugUtil.generate(data.name);
    if (data.slug) await this.validateSlugDuplication(data.slug);

    // 1. TỐI ƯU: Lọc danh sách ID ảnh và move hàng loạt
    if (data.albums && Array.isArray(data.albums)) {
      const mediaIds = data.albums
        .map((album) => album.mediaId)
        .filter(Boolean); // Lọc bỏ các giá trị undefined/null

      if (mediaIds.length > 0) {
        await this.mediaService.moveMediaGroupToSubfolder(
          mediaIds,
          MediaFolder.PRODUCTS,
          data.slug,
        );
      }
    }

    const payload = this.formatRelationData(data);

    // Chuẩn hóa và lọc mã độc (XSS/Script) cho bookDetail & sections trước khi lưu
    if (payload.bookDetail) {
      if (
        payload.bookDetail.sections &&
        Array.isArray(payload.bookDetail.sections)
      ) {
        payload.bookDetail.sections = SectionSanitizeUtil.sanitizeSections(
          payload.bookDetail.sections,
        );
      }
      if (typeof payload.bookDetail.describe === 'string') {
        payload.bookDetail.describe = SectionSanitizeUtil.sanitizeText(
          payload.bookDetail.describe,
        );
      }
      if (currentUserId) {
        payload.bookDetail.lastModifiedBy = currentUserId;
      }
      delete payload.bookDetail.expectedVersion;
    }

    if (payload.albums && Array.isArray(payload.albums)) {
      payload.albums = payload.albums.map((item: any) => {
        const albumEntity = new ProductAlbum();
        albumEntity.id = uuidv7();
        albumEntity.displayOrder = item.displayOrder;
        albumEntity.media = item.media;
        return albumEntity;
      });
    }

    // 2. GỌI HÀM AI DÙNG CHUNG (Dùng shortDescribe ngắn gọn thay vì describe chi tiết)
    const aiData = await this.generateEmbeddingAndSeoKeywords(
      data.name,
      data.shortDescribe,
      data.categoryIds,
    );
    payload.seoKeywords = aiData.seoKeywords;
    payload.embedding = aiData.embedding;

    // 3. Lưu DB
    const newProduct = await super.create(payload, currentUserId);

    return this.findOneWithDetails(newProduct.id);
  }

  async update(
    id: string,
    data: any,
    currentUserId?: string,
  ): Promise<Product> {
    if (data.name && !data.slug) data.slug = SlugUtil.generate(data.name);
    if (data.slug) await this.validateSlugDuplication(data.slug, id);

    const payload = this.formatRelationData(data);

    const entity = await this.productRepository.findOne({
      where: { id },
      relations: {
        bookDetail: true,
        categories: true,
        authors: true,
        albums: { media: true },
      },
    });

    if (!entity) throw new NotFoundException('Không tìm thấy sản phẩm');

    // KIỂM TRA XUNG ĐỘT PHIÊN BẢN (Optimistic Concurrency Control) CHO BOOK DETAIL / SECTIONS
    if (
      data.bookDetail &&
      data.bookDetail.expectedVersion !== undefined &&
      entity.bookDetail &&
      entity.bookDetail.version !== data.bookDetail.expectedVersion
    ) {
      const diffResult = SectionDiffUtil.computeDiff(
        entity.bookDetail.sections || [],
        data.bookDetail.sections || [],
        {
          currentVersion: entity.bookDetail.version ?? 1,
          expectedVersion: data.bookDetail.expectedVersion,
          lastModifiedBy: entity.bookDetail.lastModifiedBy,
          lastModifiedAt: entity.bookDetail.updatedAt,
        },
      );

      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message:
          'Dữ liệu đã được người khác chỉnh sửa trước đó. Vui lòng đối chiếu các thay đổi để tránh ghi đè mất thông tin.',
        conflictData: diffResult,
      });
    }

    // Lọc mã độc (XSS/Script) cho bookDetail & sections trước khi lưu
    if (payload.bookDetail) {
      if (
        payload.bookDetail.sections &&
        Array.isArray(payload.bookDetail.sections)
      ) {
        payload.bookDetail.sections = SectionSanitizeUtil.sanitizeSections(
          payload.bookDetail.sections,
        );
      }
      if (typeof payload.bookDetail.describe === 'string') {
        payload.bookDetail.describe = SectionSanitizeUtil.sanitizeText(
          payload.bookDetail.describe,
        );
      }
      if (currentUserId) {
        payload.bookDetail.lastModifiedBy = currentUserId;
      }
      delete payload.bookDetail.expectedVersion;
    }

    // 1. TỐI ƯU UPDATE: Nếu có cập nhật album thì move hàng loạt ảnh mới luôn
    if (data.albums && Array.isArray(data.albums)) {
      const mediaIds = data.albums
        .map((album) => album.mediaId)
        .filter(Boolean);

      if (mediaIds.length > 0) {
        const folderSlug = data.slug || entity.slug; // Dùng slug mới nếu có đổi tên, không thì dùng slug cũ
        await this.mediaService.moveMediaGroupToSubfolder(
          mediaIds,
          MediaFolder.PRODUCTS,
          folderSlug,
        );
      }
    }

    if (currentUserId) payload.updateBy = currentUserId;

    // 2. LOGIC UPDATE AI VECTOR (Dựa trên name, shortDescribe và categoryIds)
    const isNameChanged = data.name && data.name !== entity.name;
    const isShortDescChanged =
      data.shortDescribe !== undefined &&
      data.shortDescribe !== entity.shortDescribe;
    const isCategoriesChanged = data.categoryIds !== undefined;

    if (isNameChanged || isShortDescChanged || isCategoriesChanged) {
      const finalName = data.name || entity.name;
      const finalShortDesc =
        data.shortDescribe !== undefined
          ? data.shortDescribe
          : entity.shortDescribe;
      const finalCategoryIds =
        data.categoryIds ||
        (entity.categories ? entity.categories.map((c) => c.id) : []);

      // GỌI LẠI HÀM AI
      const aiData = await this.generateEmbeddingAndSeoKeywords(
        finalName,
        finalShortDesc,
        finalCategoryIds,
      );
      payload.seoKeywords = aiData.seoKeywords;
      payload.embedding = aiData.embedding;
    }

    // 3. Gộp và lưu
    if (payload.bookDetail && entity.bookDetail) {
      payload.bookDetail = Object.assign(
        entity.bookDetail,
        payload.bookDetail,
      );
    }

    if (payload.albums && Array.isArray(payload.albums)) {
      const existingAlbums = entity.albums || [];
      payload.albums = payload.albums.map((newAlbum: any) => {
        // Tìm xem ảnh này đã tồn tại trong DB chưa (dựa vào mediaId)
        const existingAlbum = existingAlbums.find(
          (oldAlbum) => oldAlbum.media?.id === newAlbum.media?.id,
        );

        const albumEntity = new ProductAlbum();
        albumEntity.id = existingAlbum ? existingAlbum.id : uuidv7();
        albumEntity.displayOrder = newAlbum.displayOrder;
        albumEntity.media = newAlbum.media;
        return albumEntity;
      });
    }

    Object.assign(entity, payload);
    await this.productRepository.save(entity);
    const savedProduct = await this.findOneWithDetails(id);
    
    // Gọi hàm xóa Cache chạy ngầm (không cần await để tránh làm chậm luồng trả về cho Admin)
    this.clearProductCache(savedProduct);
    return savedProduct;
  }

  async hardDelete(id: string): Promise<void> {
    // 1. Tìm sản phẩm kèm tất cả quan hệ
    const product = await this.productRepository.findOne({
      where: { id },
      relations: {
        albums: { media: true }, // Nạp mảng ảnh để lấy ID
        bookDetail: true, // Nạp detail để TypeORM dọn dẹp
      },
      withDeleted: true,
    });

    if (!product) throw new NotFoundException('Sản phẩm không tồn tại');

    // 2. Gom toàn bộ ID ảnh của sản phẩm này vào 1 mảng
    const mediaIds =
      product.albums
        ?.filter((album) => album.media)
        .map((album) => album.media?.id) || [];

    // 3. Xóa sản phẩm khỏi DB.
    // LƯU Ý: Vì dùng .remove(), TypeORM sẽ tự động xóa các record trong book_details và product_albums nhờ Cascade.
    await this.productRepository.remove(product);
    this.clearProductCache(product);
    // 4. Chạy vòng lặp chém bay các file vật lý khỏi ổ cứng
    // Dùng Promise.all để xóa nhiều file cùng lúc cho nhanh
    if (mediaIds.length > 0) {
      await Promise.all(
        mediaIds.map(
          (mediaId) => mediaId && this.mediaService.hardDelete(mediaId),
        ),
      );
    }
  }

  // Helper lấy full data trả về
  async findOneWithDetails(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: {
        bookDetail: true,
        categories: true,
        authors: true,
        albums: {
          media: true,
        },
        reviews: {
          user: { userDetail: true },
        },
      },
    });
    if (!product) throw new NotFoundException('Truy xuất dữ liệu thất bại');
    return product;
  }

  async getPublicProductDetail(slug: string) {
    const product = await this.productRepository.findOne({
      where: { slug, isVerified: true, status: 1 },
      relations: {
        albums: { media: true }, // Load mảng albums kèm info ảnh
        categories: true,
        authors: { avatar: true },
        bookDetail: true,
        reviews: {
          user: { userDetail: true },
        },
      },
    });

    if (!product)
      throw new NotFoundException('Sản phẩm không tồn tại hoặc đã ẩn');
    return product; // Bạn có thể map qua PublicProductDto nếu muốn giấu thông tin audit
  }

  private async validateSlugDuplication(slug: string, excludeId?: string) {
    const existing = await this.productRepository.findOne({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException({
        message: 'Tên hoặc Slug đã tồn tại.',
        duplicateSlug: slug,
      });
    }
  }

  async generateEmbeddingAndSeoKeywords(
    name: string,
    description: string = '',
    categoryIds: string[] = [],
  ): Promise<{ seoKeywords: string; embedding: any }> {
    let categoryNamesString = '';

    // 1. Lấy tên danh mục để mồi cho AI
    if (categoryIds && categoryIds.length > 0) {
      const categories = await this.categoryRepository.findBy({
        id: In(categoryIds),
      });
      categoryNamesString = categories.map((c) => c.name).join(', ');
    }

    // 2. Sinh SEO Keywords
    let seoKeywords = '';
    if (description) {
      seoKeywords = await this.aiService.generateSeoKeywords(
        name,
        description,
        categoryNamesString,
      );
    }

    // 3. Nhúng Vector
    const textToEmbed = `Danh mục: ${categoryNamesString}. Tên sách: ${name}. Từ khóa: ${seoKeywords}`;
    const embedding = await this.aiService.generateEmbedding(textToEmbed);

    return { seoKeywords, embedding };
  }

  async fetchProductsWithQuery(
    page: number,
    limit: number,
    filters: {
      keyword?: string;
      categoryId?: string;
      authorId?: string;
      status?: string;
      isVerified?: string;
      orderBy?: string;
      sort?: 'ASC' | 'DESC';
    },
  ) {
    const { keyword, categoryId, authorId, status, isVerified, orderBy, sort } =
      filters;

    // Chuẩn hóa phân trang
    page = Math.max(1, page);
    limit = Math.max(1, limit);
    const skip = (page - 1) * limit;

    // Khởi tạo QueryBuilder
    const queryBuilder = this.repo
      .createQueryBuilder('product')
      // Lấy data quan hệ trả về cho Client (Giữ nguyên toàn bộ danh sách)
      .leftJoinAndSelect('product.categories', 'categories')
      .leftJoinAndSelect('product.authors', 'authors')
      .leftJoinAndSelect('product.albums', 'albums')
      .leftJoinAndSelect('albums.media', 'media');

    // 1. Lọc theo Keyword (Dùng ILIKE để không phân biệt hoa thường)
    if (keyword) {
      queryBuilder.andWhere('product.name ILIKE :keyword', {
        keyword: `%${keyword}%`,
      });
    }

    // 2. Lọc theo các trường cơ bản
    if (status !== undefined) {
      queryBuilder.andWhere('product.status = :status', {
        status: parseInt(status, 10),
      });
    }

    if (isVerified !== undefined) {
      queryBuilder.andWhere('product.isVerified = :isVerified', {
        isVerified: isVerified === 'true',
      });
    }

    if (categoryId) {
      queryBuilder.innerJoin(
        'product.categories',
        'filterCategory',
        'filterCategory.id = :categoryId',
        { categoryId },
      );
    }

    if (authorId) {
      queryBuilder.innerJoin(
        'product.authors',
        'filterAuthor',
        'filterAuthor.id = :authorId',
        { authorId },
      );
    }

    // 4. Khởi tạo object sắp xếp (Order)
    if (orderBy) {
      // Bắt buộc phải có tiền tố "product." để tránh lỗi trùng tên cột
      queryBuilder.orderBy(`product.${orderBy}`, sort || 'DESC');
    } else {
      queryBuilder.orderBy('product.createdAt', 'DESC');
    }

    // 5. Phân trang & Thực thi (Vượt qua BaseService)
    queryBuilder.skip(skip).take(limit);

    // getManyAndCount giải quyết triệt để lỗi phân trang sai số lượng khi có JOIN
    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data: data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneBy(whereCondition: any = {}, relations?: any) {
    const product = await this.repo.findOne({
      where: whereCondition,
      relations,
    });
    if (!product)
      throw new NotFoundException(
        'Không tìm thấy sản phẩm này hoặc đã ngừng kinh doanh.',
      );
    return product;
  }

  async getProductsForCart(productIds: string[]) {
    if (!productIds || productIds.length === 0) {
      return { validProducts: [], unavailableIds: [] };
    }

    const validProducts = await this.repo.find({
      where: {
        id: In(productIds),
        status: StatusProduct.ACTIVE,
        isVerified: true,
        // TypeORM mặc định bỏ qua các record đã bị soft-delete (deletedAt != null)
      },
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        finalPrice: true,
        stockQuantity: true,
        soldCount: true,
      },
      relations: {
        albums: { media: true },
      },
    });

    // Gom ID của các sản phẩm hợp lệ
    const validIds = validProducts.map((p) => p.id);

    // Lọc ra các ID mà FE gửi lên nhưng không có trong validIds (bị xóa, ẩn, v.v.)
    const unavailableIds = productIds.filter((id) => !validIds.includes(id));

    return {
      validProducts: validProducts
        ? validProducts.map((p) => this.mapProductToPublicResponse(p))
        : [],
      unavailableIds: unavailableIds,
    };
  }

  // Danh sách stop words tiếng Việt phổ biến thường gây nhiễu cho Full-Text Search
  private static readonly VIETNAMESE_STOP_WORDS = new Set([
    'mua',
    'bán',
    'giá',
    'cũ',
    'rẻ',
    'cho',
    'của',
    'và',
    'ở',
    'tại',
    'các',
    'những',
    'được',
    'bởi',
    'với',
    'là',
    'có',
    'trong',
    'về',
    'đến',
    'từ',
    'theo',
    'như',
    'đã',
    'sẽ',
    'đang',
    'nào',
    'gì',
    'ai',
    'sách',
    'cuốn',
    'quyển',
    'bộ',
    'tập',
    'tìm',
    'kiếm',
    'hay',
    'nhất',
  ]);

  /**
  /**
   * Trích xuất danh sách từ có nghĩa sau khi đã loại bỏ ký tự đặc biệt và stop words tiếng Việt
   */
  public extractMeaningfulWords(searchQuery: string): string[] {
    const sanitized = searchQuery
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ');

    const words = sanitized.split(' ').filter(Boolean);
    if (words.length === 0) return [];

    const meaningfulWords = words.filter(
      (w) => !ProductsService.VIETNAMESE_STOP_WORDS.has(w),
    );

    return meaningfulWords.length > 0 ? meaningfulWords : words;
  }

  /**
   * Chuẩn hóa từ khóa FTS:
   * 1. Loại bỏ ký tự đặc biệt nguy hiểm cho to_tsquery
   * 2. Lọc bỏ stop words tiếng Việt
   * 3. Toán tử FTS thích ứng: Dùng & (AND) cho truy vấn ngắn (<= 3 từ) và | (OR) cho truy vấn dài (> 3 từ)
   */
  private buildCleanFtsQuery(
    searchQuery: string,
    useOr: boolean = false,
  ): string {
    const targetWords = this.extractMeaningfulWords(searchQuery);
    if (targetWords.length === 0) return 'empty:*';

    // Toán tử FTS thích ứng (Adaptive FTS Operator):
    // - Nếu truy vấn ngắn (<= 3 từ có nghĩa, thường là tên sách cụ thể như "Clean Code", "Đắc Nhân Tâm"): dùng '&' (AND) để khớp chặt mặt chữ.
    // - Nếu truy vấn dài (> 3 từ có nghĩa, câu hỏi diễn giải ngữ nghĩa): tự động dùng '|' (OR) để FTS vẫn cộng điểm thưởng cho các sách khớp một phần từ khóa quan trọng.
    const adaptiveOr = useOr || targetWords.length > 3;
    const operator = adaptiveOr ? ' | ' : ' & ';

    return targetWords.map((word) => `${word}:*`).join(operator);
  }

  async searchHybridA(
    searchQuery: string,
    limit: number = 10,
    options?: {
      alpha?: number;
      threshold?: number;
      minScore?: number;
      normalizeScore?: boolean;
      useOrOperator?: boolean;
    },
  ) {
    const alpha = options?.alpha !== undefined ? Number(options.alpha) : 0.7;
    const ftsWeight = Number((1 - alpha).toFixed(2));
    const rawThreshold =
      options?.threshold !== undefined ? Number(options.threshold) : 1.15;
    // Quy đổi tự động nếu truyền ngưỡng thang Cosine (<= 0.85) sang thang L2: D_L2 = sqrt(2 * D_Cosine)
    const threshold =
      rawThreshold <= 0.85
        ? Number(Math.sqrt(2 * rawThreshold).toFixed(4))
        : rawThreshold;
    const minScore =
      options?.minScore !== undefined ? Number(options.minScore) : 0.25;
    const normalizeScore = options?.normalizeScore ?? true;

    // 1. Tạo Vector và FTS Query
    const queryVector = await this.aiService.generateEmbedding(searchQuery);
    const hasValidVector = Array.isArray(queryVector) && queryVector.length > 0;
    const formattedVector = hasValidVector ? `[${queryVector.join(',')}]` : null;
    const ftsQuery = this.buildCleanFtsQuery(
      searchQuery,
      options?.useOrOperator ?? false,
    );

    // Chuẩn hóa điểm L2 trên mặt cầu đơn vị MiniLM (D_L2 thuộc [0, 2], vùng tương đồng dương thuộc [0, sqrt(2) ≈ 1.4142])
    const aiExpr = hasValidVector
      ? normalizeScore
        ? `COALESCE(GREATEST(0, 1 - ((product.embedding <-> :embedding) / 1.41421356)), 0)`
        : `COALESCE(GREATEST(0, 1 - (product.embedding <-> :embedding)), 0)`
      : `0`;

    const ftsExpr = normalizeScore
      ? `(ts_rank(product.document_with_weights, to_tsquery('simple', :ftsQuery)) / (0.1 + ts_rank(product.document_with_weights, to_tsquery('simple', :ftsQuery))))`
      : `ts_rank(product.document_with_weights, to_tsquery('simple', :ftsQuery))`;

    // ==========================================
    // BƯỚC 1: TÌM KIẾM AI L2 DISTANCE ĐỂ LẤY TOP 10 IDs
    // ==========================================
    const selectExpr =
      alpha === 0 || !hasValidVector
        ? `${ftsExpr}`
        : alpha === 1
          ? `${aiExpr}`
          : `(${alpha} * ${aiExpr}) + (${ftsWeight} * ${ftsExpr})`;

    const rawResults = await this.productRepository
      .createQueryBuilder('product')
      .select(['product.id AS id'])
      .addSelect(selectExpr, 'final_score')
      .where('product.status = :status', { status: 1 })
      .andWhere('product.isVerified = :isVerified', { isVerified: true })
      .andWhere('product.deleted_at IS NULL')
      .andWhere(
        new Brackets((qb) => {
          if (alpha === 0 || !hasValidVector) {
            // 100% FTS
            qb.where(
              "product.document_with_weights @@ to_tsquery('simple', :ftsQuery)",
            );
          } else if (alpha === 1) {
            // 100% Vector AI
            qb.where(
              'product.embedding IS NOT NULL AND product.embedding <-> :embedding < :threshold',
            );
          } else {
            // Hybrid kết hợp
            qb.where(
              '(product.embedding IS NOT NULL AND product.embedding <-> :embedding < :threshold)',
            ).orWhere(
              "product.document_with_weights @@ to_tsquery('simple', :ftsQuery)",
            );
          }
        }),
      )
      .setParameters({ embedding: formattedVector, ftsQuery, threshold })
      .orderBy('final_score', 'DESC')
      .limit(limit)
      .getRawMany();

    // Lọc theo ngưỡng điểm tối thiểu (minScore)
    let filteredResults = rawResults;
    if (minScore !== undefined) {
      filteredResults = filteredResults.filter(
        (r) => parseFloat(r.final_score) >= minScore,
      );
    }

    if (filteredResults.length === 0) return [];

    // Trích xuất mảng ID
    const productIds = filteredResults.map((r) => r.id);

    // ==========================================
    // BƯỚC 2: KÉO DỮ LIỆU QUAN HỆ (BỎ EMBEDDING)
    // ==========================================
    const products = await this.productRepository.find({
      where: { id: In(productIds) },
      relations: {
        categories: true,
        authors: { avatar: true },
        albums: { media: true },
        bookDetail: true,
      },
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
    });

    // ==========================================
    // BƯỚC 3: MAPPING THÀNH DTO ẢO
    // ==========================================
    const formattedProducts = filteredResults
      .map((raw) => {
        const p = products.find((prod) => prod.id === raw.id);
        if (!p) return null;

        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          price: p.price,
          finalPrice: p.finalPrice,
          shortDescribe: p.shortDescribe,
          stockQuantity: p.stockQuantity,
          soldCount: p.soldCount,
          categories:
            p.categories?.map((c) => ({ id: c.id, name: c.name })) || [],
          authors:
            p.authors?.map((a) => ({
              id: a.id,
              name: a.name,
              slug: a.slug,
              describe: a.describe,
              avatarUrl: a.avatar?.fileUrl,
            })) || [],
          albums:
            p.albums
              ?.map((al) => ({
                id: al.id,
                url: al.media?.fileUrl,
                displayOrder: al.displayOrder,
              }))
              .sort(
                (a, b) => Number(b.displayOrder) - Number(a.displayOrder),
              ) || [],
          searchScore: parseFloat(raw.final_score).toFixed(4),
        };
      })
      .filter(Boolean);

    return formattedProducts;
  }

  /**
   * THUẬT TOÁN TÌM KIẾM LAI CHÍNH THỨC (DUAL-ADAPTIVE HYBRID SEARCH B: VECTOR + FULL-TEXT SEARCH)
   * ----------------------------------------------------------------------------------------------
   * Thông số tối ưu từ thực nghiệm Information Retrieval (NDCG@5, MRR@5, Hit@K, TNR):
   * - Tỷ lệ lai tối ưu: Alpha = 0.70 (70% Vector AI MiniLM - 30% Full-Text Search)
   * - Biên độ ngưỡng khoảng cách Cosine (threshold): [0.55 - 0.68], điểm tối ưu = 0.65 (tương đương L2 ≈ 1.1402)
   * - Biên độ điểm sàn (minScore): [0.20 - 0.30], điểm tối ưu = 0.25
   * - Cơ chế Thích ứng Kép (Dual-Adaptive Mechanism - distanceMetric = 'ADAPTIVE' | 'COSINE' | 'L2'):
   *   1. Truy vấn ngắn (<= 3 từ có nghĩa - tìm đích danh tên sách/tác giả):
   *      + FTS dùng toán tử '&' (AND) lọc chặt mặt chữ.
   *      + Vector dùng độ đo L2 (<->) có đạo hàm cự ly gần d(S_L2)/d(D_C) = 1/(2*sqrt(D_C)) > 1 (khi D_C < 0.25),
   *        giúp khuếch đại biên độ phân tách (discriminative margin) đẩy sách mục tiêu lên Top 1.
   *   2. Truy vấn dài (> 3 từ có nghĩa - mô tả nhu cầu/ngữ cảnh tự nhiên):
   *      + FTS dùng toán tử '|' (OR) mở rộng độ phủ từ khóa.
   *      + Vector dùng độ đo Cosine (<=>) giữ độ suy giảm tuyến tính S_Cosine = 1 - D_C ở vùng trung bình [0.40 - 0.60],
   *        tránh hiện tượng nén điểm lồi của căn bậc hai L2 làm rớt sách ngữ nghĩa qua ngưỡng minScore.
   */
  async searchHybridB(
    searchQuery: string,
    limit: number = 10,
    options?: {
      alpha?: number;
      threshold?: number;
      minScore?: number;
      normalizeScore?: boolean;
      useOrOperator?: boolean;
      distanceMetric?: 'COSINE' | 'L2' | 'ADAPTIVE';
    },
  ) {
    const alpha = options?.alpha !== undefined ? Number(options.alpha) : 0.7;
    const ftsWeight = Number((1 - alpha).toFixed(2));
    const rawThreshold =
      options?.threshold !== undefined ? Number(options.threshold) : 0.65;
    // Quy đổi tương đương toán học giữa ngưỡng Cosine và L2 trên mặt cầu đơn vị: D_L2 = sqrt(2 * D_Cosine)
    const cosineThreshold =
      rawThreshold > 0.85
        ? Number(((rawThreshold * rawThreshold) / 2).toFixed(4))
        : rawThreshold;
    const l2Threshold =
      rawThreshold > 0.85
        ? rawThreshold
        : Number(Math.sqrt(2 * cosineThreshold).toFixed(4));

    const minScore =
      options?.minScore !== undefined ? Number(options.minScore) : 0.25;
    // Mặc định bật chuẩn hóa bão hòa FTS (normalizeScore = true) để điểm FTS [0, 1) đồng nhất thang đo với điểm Vector Similarity [0, 1]
    const normalizeScore = options?.normalizeScore ?? true;

    // 1. Phân tích đặc tính câu truy vấn (số từ có nghĩa sau khi lọc stop words)
    const meaningfulWords = this.extractMeaningfulWords(searchQuery);
    const isShortQuery = meaningfulWords.length <= 3;

    // Xác định chế độ đo khoảng cách Vector (COSINE | L2 | ADAPTIVE)
    // Chỉ sử dụng duy nhất 1 toán tử khoảng cách cho mỗi câu truy vấn để tối ưu hiệu năng quét pgvector
    const requestedMetric = options?.distanceMetric ?? 'ADAPTIVE';
    const resolvedMetric: 'COSINE' | 'L2' =
      requestedMetric === 'ADAPTIVE'
        ? isShortQuery
          ? 'L2'
          : 'COSINE'
        : requestedMetric;

    // 2. Tạo Vector 384 chiều và FTS Query (đã lọc stop words & chọn toán tử thích ứng theo độ dài câu)
    const queryVector = await this.aiService.generateEmbedding(searchQuery);
    const hasValidVector = Array.isArray(queryVector) && queryVector.length > 0;
    const formattedVector = hasValidVector ? `[${queryVector.join(',')}]` : null;
    const ftsQuery = this.buildCleanFtsQuery(
      searchQuery,
      options?.useOrOperator ?? false,
    );

    // Biểu thức điểm Vector AI theo chế độ khoảng cách (dùng COALESCE bảo vệ NULL vector)
    const cosineSimSql = `GREATEST(0, 1 - (product.embedding <=> :embedding))`;
    const l2SimSql = `GREATEST(0, 1 - ((product.embedding <-> :embedding) / 1.41421356))`;

    let aiExpr = `0`;
    let vectorGatekeeperCond = `product.embedding IS NOT NULL AND product.embedding <=> :embedding < :cosineThreshold`;

    if (hasValidVector) {
      if (resolvedMetric === 'COSINE') {
        aiExpr = `COALESCE(${cosineSimSql}, 0)`;
        vectorGatekeeperCond = `product.embedding IS NOT NULL AND product.embedding <=> :embedding < :cosineThreshold`;
      } else {
        aiExpr = `COALESCE(${l2SimSql}, 0)`;
        vectorGatekeeperCond = `product.embedding IS NOT NULL AND product.embedding <-> :embedding < :l2Threshold`;
      }
    }

    const ftsExpr = normalizeScore
      ? `(ts_rank(product.document_with_weights, to_tsquery('simple', :ftsQuery)) / (0.1 + ts_rank(product.document_with_weights, to_tsquery('simple', :ftsQuery))))`
      : `ts_rank(product.document_with_weights, to_tsquery('simple', :ftsQuery))`;

    // ==========================================
    // BƯỚC 1: TÌM KIẾM AI ĐỂ LẤY TOP IDs VÀ ĐIỂM SỐ
    // ==========================================
    const selectExpr =
      alpha === 0 || !hasValidVector
        ? `${ftsExpr}`
        : alpha === 1
          ? `${aiExpr}`
          : `(${alpha} * ${aiExpr}) + (${ftsWeight} * ${ftsExpr})`;

    const rawResults = await this.productRepository
      .createQueryBuilder('product')
      .select(['product.id AS id'])
      .addSelect(selectExpr, 'final_score')
      .where('product.status = :status', { status: 1 })
      .andWhere('product.isVerified = :isVerified', { isVerified: true })
      .andWhere('product.deleted_at IS NULL')
      .andWhere(
        new Brackets((qb) => {
          if (alpha === 0 || !hasValidVector) {
            // 100% FTS
            qb.where(
              "product.document_with_weights @@ to_tsquery('simple', :ftsQuery)",
            );
          } else if (alpha === 1) {
            // 100% Vector AI
            qb.where(vectorGatekeeperCond);
          } else {
            // Hybrid kết hợp (Gatekeeper: vượt qua cổng Vector < threshold HOẶC khớp từ khóa FTS)
            qb.where(`(${vectorGatekeeperCond})`).orWhere(
              "product.document_with_weights @@ to_tsquery('simple', :ftsQuery)",
            );
          }
        }),
      )
      .setParameters({
        embedding: formattedVector,
        ftsQuery,
        cosineThreshold,
        l2Threshold,
      })
      .orderBy('final_score', 'DESC')
      .limit(limit)
      .getRawMany();

    // Lọc theo ngưỡng điểm tối thiểu (minScore)
    let filteredResults = rawResults;
    if (minScore !== undefined) {
      filteredResults = filteredResults.filter(
        (r) => parseFloat(r.final_score) >= minScore,
      );
    }

    if (filteredResults.length === 0) return [];

    // Trích xuất mảng ID từ kết quả thô
    const productIds = filteredResults.map((r) => r.id);

    // ==========================================
    // BƯỚC 2: KÉO DỮ LIỆU ĐẦY ĐỦ KÈM QUAN HỆ (BỎ EMBEDDING)
    // ==========================================
    const products = await this.productRepository.find({
      where: { id: In(productIds) },
      relations: {
        categories: true,
        authors: { avatar: true },
        albums: { media: true }, // Kéo media từ albums
        bookDetail: true,
      },
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
    });

    // ==========================================
    // BƯỚC 3: MAPPING THÀNH DTO ẢO CHO FRONTEND
    // ==========================================
    // Phải map lại vì lệnh .find() của TypeORM không giữ đúng thứ tự orderBy điểm số của Bước 1
    const formattedProducts = filteredResults
      .map((raw) => {
        const p = products.find((prod) => prod.id === raw.id);
        if (!p) return null;

        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          price: p.price,
          finalPrice: p.finalPrice,
          shortDescribe: p.shortDescribe,
          stockQuantity: p.stockQuantity,
          soldCount: p.soldCount,
          // Ép dữ liệu relations gọn gàng lại cho FE dễ dùng
          categories:
            p.categories?.map((c) => ({ id: c.id, name: c.name })) || [],
          authors:
            p.authors?.map((a) => ({
              id: a.id,
              name: a.name,
              slug: a.slug,
              describe: a.describe,
              avatarUrl: a.avatar?.fileUrl,
            })) || [],
          // Lấy danh sách ảnh và đẩy ảnh isDefault lên đầu tiên
          albums:
            p.albums
              ?.map((al) => ({
                id: al.id,
                url: al.media?.fileUrl,
                displayOrder: al.displayOrder,
              }))
              .sort(
                (a, b) => Number(b.displayOrder) - Number(a.displayOrder),
              ) || [],
          // Kèm theo điểm số để log xem AI chấm điểm thế nào
          searchScore: parseFloat(raw.final_score).toFixed(4),
        };
      })
      .filter(Boolean); // Lọc bỏ null

    return formattedProducts;
  }

  // ==========================================
  // HÀM BỔ TRỢ: XÓA CACHE SẢN PHẨM
  // ==========================================
  private async clearProductCache(product: Product) {
    try {
      await Promise.all([
        this.cacheManager.del(`/apis/v1/products/${product.slug}`),
        this.cacheManager.del(`/apis/v1/products/id/${product.id}`),
      ]);
      // Bắn log ở Service để sau này debug dễ dàng
      this.logger.log(`Đã xóa cache cho sản phẩm: ${product.id}`);
    } catch (error) {
      this.logger.error(`Lỗi khi xóa cache sản phẩm ${product.id}:`, error);
    }
  }

  public mapProductToPublicResponse(product: Product) {
    if (!product) return null;

    // Bộ lọc map-public: chỉ lấy review có status là APPROVED và chưa bị xóa mềm
    const approvedReviews =
      product.reviews?.filter(
        (r) => r.status === StatusReview.APPROVED && !r.deletedAt,
      ) || [];

    const totalReviews = approvedReviews.length;
    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sumRating = 0;

    for (const r of approvedReviews) {
      const star = Math.min(5, Math.max(1, Math.round(Number(r.rating))));
      breakdown[star as 1 | 2 | 3 | 4 | 5] =
        (breakdown[star as 1 | 2 | 3 | 4 | 5] || 0) + 1;
      sumRating += Number(r.rating);
    }

    const averageRating =
      totalReviews > 0 ? Number((sumRating / totalReviews).toFixed(1)) : 0;

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      shortDescribe: product.shortDescribe,
      price: product.price,
      finalPrice: product.finalPrice,
      stockQuantity: product.stockQuantity,
      soldCount: product.soldCount,
      createdAt: product.createdAt,

      categories:
        product.categories?.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
        })) || [],

      authors:
        product.authors?.map((a) => ({
          id: a.id,
          name: a.name,
          slug: a.slug,
          describe: a.describe,
          avatarUrl: a.avatar?.fileUrl || null,
        })) || [],

      albums:
        product.albums
          ?.map((al) => ({
            displayOrder: al.displayOrder,
            imageUrl: al.media?.fileUrl || null,
            altText: al.media?.altText || null,
          }))
          .sort((a, b) => Number(a.displayOrder) - Number(b.displayOrder)) ||
        [],

      bookDetail: product.bookDetail
        ? {
            title: product.bookDetail.title,
            describe: product.bookDetail.describe,
            sections: product.bookDetail.sections || [],
            publisher: product.bookDetail.publisher,
            publishYear: product.bookDetail.publishYear,
            language: product.bookDetail.language,
            format: product.bookDetail.format,
            pageCount: product.bookDetail.pageCount,
          }
        : null,

      reviews: approvedReviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title || null,
        comment: r.comment,
        isPurchased: r.isPurchased,
        adminReply: r.adminReply || null,
        adminReplyAt: r.adminReplyAt || null,
        createdAt: r.createdAt,
        user: {
          id: r.user?.id,
          fullName:
            r.user?.userDetail?.fullName ||
            (r.user?.email ? r.user.email.split('@')[0] : 'Khách hàng'),
          avatarUrl: r.user?.userDetail?.avatarUrl || null,
        },
      })),

      ratingStats: {
        averageRating,
        totalReviews,
        breakdown,
      },
    };
  }
}
