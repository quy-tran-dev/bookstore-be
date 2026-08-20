import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { BaseService } from '@app/common/base/base.service';
import { Product } from './entities/product.entity';
import { SlugUtil } from '@app/common/utils/slug.util';
import { AlbumFormatUtil } from '@app/common/utils/album-format.util';
import { MediaService } from '../media/media.service';
import { AiService } from '../ai/ai.service';
import { Category } from '../categories/entities/category.entity';

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

    // 1. Move files vật lý
    if (data.albums && Array.isArray(data.albums)) {
      for (const album of data.albums) {
        if (album.mediaId) {
          await this.mediaService.moveMediaToSubfolder(
            album.mediaId,
            'products',
            data.slug,
          );
        }
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

    // 3. Lưu DB (Xóa dòng gọi embedding 2 lần đi nhé)
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
      relations: { bookDetail: true, categories: true }, // Kéo categories cũ lên
    });

    if (!entity) throw new NotFoundException('Không tìm thấy sản phẩm');

    if (currentUserId) payload.updateBy = currentUserId;

    // LOGIC UPDATE AI VECTOR: Chỉ chạy lại AI nếu Tên, Mô tả hoặc Danh mục bị thay đổi
    const isNameChanged = data.name && data.name !== entity.name;
    const isDescChanged =
      data.bookDetail?.description &&
      data.bookDetail?.description !== entity.bookDetail?.describe;
    const isCategoriesChanged = data.categoryIds !== undefined; // Có truyền categoryIds mới lên

    if (isNameChanged || isDescChanged || isCategoriesChanged) {
      // Ưu tiên lấy dữ liệu mới, nếu không có thì dùng dữ liệu cũ đang lưu trong DB
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

    // Gộp và lưu
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

  async searchHybridA(searchQuery: string, limit: number = 10) {
    // 1. Tạo Vector từ câu hỏi
    const queryVector = await this.aiService.generateEmbedding(searchQuery);
    const formattedVector = `[${queryVector.join(',')}]`; // Biến chuẩn để truyền vào query

    // 2. Format câu hỏi cho FTS (Nới lỏng bằng OR: |)
    const normalizedQuery = searchQuery.trim().replace(/\s+/g, ' ');
    const ftsQuery = normalizedQuery
      .split(' ')
      .map((word) => `${word}:*`)
      .join(' | ');

    // 3. Truy vấn DB (L2 Distance)
    const products = await this.productRepository
      .createQueryBuilder('product')
      .select([
        'product.id AS product_id',
        'product.name AS product_name',
        'product.price AS product_price',
        'product.slug AS product_slug',
      ])
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
          qb.where('product.embedding <-> :embedding < 1.2').orWhere(
            "product.document_with_weights @@ to_tsquery('simple', :ftsQuery)",
          );
        }),
      )
      .setParameters({
        embedding: formattedVector, // 👈 Đã fix lỗi tên biến tại đây
        ftsQuery: ftsQuery,
      })
      .orderBy('final_score', 'DESC')
      .limit(limit)
      .getRawMany();

    return products;
  }

  async searchHybridB(searchQuery: string, limit: number = 10) {
    // 1. Tạo Vector từ câu hỏi
    const queryVector = await this.aiService.generateEmbedding(searchQuery);
    const formattedVector = `[${queryVector.join(',')}]`; // Biến chuẩn để truyền vào query

    // 2. Format câu hỏi cho FTS (Nới lỏng bằng OR: |)
    const normalizedQuery = searchQuery.trim().replace(/\s+/g, ' ');
    const ftsQuery = normalizedQuery
      .split(' ')
      .map((word) => `${word}:*`)
      .join(' | ');

    // 3. Truy vấn DB (Cosine Distance)
    const products = await this.productRepository
      .createQueryBuilder('product')
      .select([
        'product.id AS product_id',
        'product.name AS product_name',
        'product.price AS product_price',
        'product.slug AS product_slug',
      ])
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
      .setParameters({
        embedding: formattedVector, // 👈 Đã fix lỗi tên biến tại đây
        ftsQuery: ftsQuery,
      })
      .orderBy('final_score', 'DESC')
      .limit(limit)
      .getRawMany();

    return products;
  }
}
