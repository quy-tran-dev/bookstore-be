import {
  Injectable,
  BadRequestException,
  NotFoundException,
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

@Injectable()
export class ProductsService extends BaseService<Product> {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly mediaService: MediaService,
    private readonly aiService: AiService,
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

    // 2. GỌI HÀM AI DÙNG CHUNG
    const aiData = await this.generateEmbeddingAndSeoKeywords(
      data.name,
      data.bookDetail?.description,
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
      relations: { bookDetail: true, categories: true },
    });

    if (!entity) throw new NotFoundException('Không tìm thấy sản phẩm');

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

    // 2. LOGIC UPDATE AI VECTOR
    const isNameChanged = data.name && data.name !== entity.name;
    const isDescChanged =
      data.bookDetail?.description &&
      data.bookDetail?.description !== entity.bookDetail?.describe;
    const isCategoriesChanged = data.categoryIds !== undefined;

    if (isNameChanged || isDescChanged || isCategoriesChanged) {
      const finalName = data.name || entity.name;
      const finalDesc =
        data.bookDetail?.description || entity.bookDetail?.describe;
      const finalCategoryIds =
        data.categoryIds ||
        (entity.categories ? entity.categories.map((c) => c.id) : []);

      // GỌI LẠI HÀM AI
      const aiData = await this.generateEmbeddingAndSeoKeywords(
        finalName,
        finalDesc,
        finalCategoryIds,
      );
      payload.seoKeywords = aiData.seoKeywords;
      payload.embedding = aiData.embedding;
    }

    // 3. Gộp và lưu
    const updatedEntity = this.productRepository.merge(entity, payload);
    await this.productRepository.save(updatedEntity);

    return this.findOneWithDetails(id);
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
        authors: true,
        bookDetail: true,
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

    // 1. Khởi tạo object điều kiện lọc (Where)
    const whereCondition: any = {};

    if (keyword) {
      whereCondition.name = ILike(`%${keyword}%`);
    }

    if (categoryId) {
      whereCondition.categories = { id: categoryId };
    }

    if (authorId) {
      whereCondition.authors = { id: authorId };
    }

    if (status !== undefined) {
      whereCondition.status = parseInt(status, 10);
    }

    if (isVerified !== undefined) {
      whereCondition.isVerified = isVerified === 'true';
    }

    // 2. Khởi tạo object sắp xếp (Order)
    const orderCondition: any = {};
    if (orderBy) {
      orderCondition[orderBy] = sort || 'DESC';
    } else {
      orderCondition.createdAt = 'DESC';
    }

    // 3. Đẩy vào Service
    return this.findAllPaginated(page, limit, {
      where: whereCondition,
      order: orderCondition,
      relations: {
        categories: true,
        authors: true,
        albums: {
          media: true,
        },
      },
    });
  }

  async searchHybridA(searchQuery: string, limit: number = 10) {
    // 1. Tạo Vector và FTS Query
    const queryVector = await this.aiService.generateEmbedding(searchQuery);
    const formattedVector = `[${queryVector.join(',')}]`;
    const ftsQuery = searchQuery
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map((word) => `${word}:*`)
      .join(' | ');

    // ==========================================
    // BƯỚC 1: TÌM KIẾM AI L2 DISTANCE ĐỂ LẤY TOP 10 IDs
    // ==========================================
    const rawResults = await this.productRepository
      .createQueryBuilder('product')
      .select(['product.id AS id'])
      .addSelect(
        `(0.6 * (1 - (product.embedding <-> :embedding))) + 
         (0.4 * ts_rank(product.document_with_weights, to_tsquery('simple', :ftsQuery)))`,
        'final_score',
      )
      .where('product.status = :status', { status: 1 })
      .andWhere('product.isVerified = :isVerified', { isVerified: true })
      .andWhere('product.deleted_at IS NULL')
      .andWhere(
        new Brackets((qb) => {
          // Ngưỡng 1.2 dành riêng cho L2 Distance
          qb.where('product.embedding <-> :embedding < 1.2').orWhere(
            "product.document_with_weights @@ to_tsquery('simple', :ftsQuery)",
          );
        }),
      )
      .setParameters({ embedding: formattedVector, ftsQuery })
      .orderBy('final_score', 'DESC')
      .limit(limit)
      .getRawMany();

    if (rawResults.length === 0) return [];

    // Trích xuất mảng ID
    const productIds = rawResults.map((r) => r.id);

    // ==========================================
    // BƯỚC 2: KÉO DỮ LIỆU QUAN HỆ (BỎ EMBEDDING)
    // ==========================================
    const products = await this.productRepository.find({
      where: { id: In(productIds) },
      relations: {
        categories: true,
        authors: true,
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
    const formattedProducts = rawResults
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
          authors: p.authors?.map((a) => ({ id: a.id, name: a.name })) || [],
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

  async searchHybridB(searchQuery: string, limit: number = 10) {
    // 1. Tạo Vector và FTS Query
    const queryVector = await this.aiService.generateEmbedding(searchQuery);
    const formattedVector = `[${queryVector.join(',')}]`;
    const ftsQuery = searchQuery
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map((word) => `${word}:*`)
      .join(' | ');

    // ==========================================
    // BƯỚC 1: TÌM KIẾM AI ĐỂ LẤY TOP 10 IDs VÀ ĐIỂM SỐ
    // ==========================================
    const rawResults = await this.productRepository
      .createQueryBuilder('product')
      .select(['product.id AS id'])
      .addSelect(
        `(0.6 * (1 - (product.embedding <=> :embedding))) + 
         (0.4 * ts_rank(product.document_with_weights, to_tsquery('simple', :ftsQuery)))`,
        'final_score',
      )
      .where('product.status = :status', { status: 1 })
      .andWhere('product.isVerified = :isVerified', { isVerified: true })
      .andWhere('product.deleted_at IS NULL')
      .andWhere(
        new Brackets((qb) => {
          qb.where('product.embedding <=> :embedding < 0.6').orWhere(
            "product.document_with_weights @@ to_tsquery('simple', :ftsQuery)",
          );
        }),
      )
      .setParameters({ embedding: formattedVector, ftsQuery })
      .orderBy('final_score', 'DESC')
      .limit(limit)
      .getRawMany();

    if (rawResults.length === 0) return [];

    // Trích xuất mảng ID từ kết quả thô
    const productIds = rawResults.map((r) => r.id);

    // ==========================================
    // BƯỚC 2: KÉO DỮ LIỆU ĐẦY ĐỦ KÈM QUAN HỆ (BỎ EMBEDDING)
    // ==========================================
    const products = await this.productRepository.find({
      where: { id: In(productIds) },
      relations: {
        categories: true,
        authors: true,
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
    const formattedProducts = rawResults
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
          authors: p.authors?.map((a) => ({ id: a.id, name: a.name })) || [],
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
}
