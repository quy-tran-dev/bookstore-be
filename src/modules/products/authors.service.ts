import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@app/common/base/base.service';
import { Author } from './entities/author.entity';
import { MediaService } from '../media/media.service';
import { SlugUtil } from '@app/common/utils/slug.util';
import { UpdateAuthorDto } from './dto/admin-author.dto';
import { Product } from './entities/product.entity';
import { MediaFolder } from '@app/common/enums/media-folder.enum';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
@Injectable()
export class AuthorsService extends BaseService<Author> {
  private readonly logger = new Logger(AuthorsService.name);
  constructor(
    @InjectRepository(Author)
    private readonly authorRepository: Repository<Author>,
    private readonly mediaService: MediaService,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    super(authorRepository);
  }

  async create(data: any, currentUserId?: string): Promise<Author> {
    // 1. Tạo slug từ tên tác giả (VD: "To Huyen Dong" -> "to-huyen-dong")
    const slug = SlugUtil.generate(data.name);

    if (!data.slug && data.name) data.slug = SlugUtil.generate(data.name);
    if (data.slug) await this.validateSlugDuplication(data.slug);

    // 2. Chuyển file ảnh vật lý vào đúng thư mục
    if (data.mediaId) {
      // Sẽ move ảnh vào folder: /uploads/authors/to-huyen-dong
      await this.mediaService.moveMediaToSubfolder(
        data.mediaId,
        MediaFolder.AUTHORS,
        slug,
      );
    }

    // 3. Chuẩn bị payload để lưu
    const payload = {
      ...data,
      slug,
      avatar: data.mediaId ? { id: data.mediaId } : null,
    };

    const newAuthor = await super.create(payload, currentUserId);  

    const result = await this.findOneAdmin(newAuthor.id)
     try {
      (this.cacheManager.del(`/categories`),
        this.logger.log(`Đã xóa cache khi mới tạo danh mục mới: ${result.id}`));
    } catch (error) {
      this.logger.error(
        `Lỗi xóa cache danh mục khi mới tạo danh mục mới ${result.id}:`,
        error,
      );
    }

    return result;
  }

  async update(id: string, data: any, currentUserId?: string): Promise<Author> {
    // 1. Xử lý logic slug và media như cũ
    if (!data.slug && data.name) {
      data.slug = SlugUtil.generate(data.name);
    }
    if (data.slug) {
      await this.validateSlugDuplication(data.slug, id);
    }

    if (data.mediaId) {
      await this.mediaService.moveMediaToSubfolder(
        data.mediaId,
        MediaFolder.AUTHORS,
        data.slug,
      );
    }

    const payload = {
      ...data,
      avatar: data.mediaId ? { id: data.mediaId } : null,
    };

    // 2. Gọi hàm update của base service (hoặc repository)
    await super.update(id, payload, currentUserId);

    return this.findOneAdmin(id);
  }

  async findOneAdmin(id: string): Promise<Author> {
    const author = await this.authorRepository.findOne({
      where: { id },
      relations: { avatar: true },
    });
    if (!author) throw new NotFoundException('Tác giả không tồn tại');
    return author;
  }

  async softDelete(id: string, currentUserId?: string): Promise<void> {
    await this.checkProductRelation(id);
    await super.softDelete(id, currentUserId);
  }

  async hardDelete(id: string): Promise<void> {
    await this.checkProductRelation(id);

    const author = await this.authorRepository.findOne({
      where: { id },
      relations: { avatar: true },
      withDeleted: true,
    });

    if (!author) throw new NotFoundException('Tác giả không tồn tại');

    const avatarMediaId = author.avatar?.id;

    await this.authorRepository.remove(author);

    if (avatarMediaId) {
      await this.mediaService.hardDelete(avatarMediaId);
    }
  }

  private async checkProductRelation(authorId: string) {
    const linkedProductsCount = await this.productRepository.count({
      where: { authors: { id: authorId } },
    });

    if (linkedProductsCount > 0) {
      throw new BadRequestException(
        `Không thể xóa! Tác giả này đang có ${linkedProductsCount} cuốn sách trên hệ thống.`,
      );
    }
  }

  private async validateSlugDuplication(slug: string, excludeId?: string) {
    const existing = await this.authorRepository.findOne({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException({
        message: 'Tên hoặc Slug đã tồn tại.',
        duplicateSlug: slug,
      });
    }
  }

  async findOneBy(whereCondition: any = {}): Promise<Author> {

    const author = await this.authorRepository.findOne({
      where: whereCondition,
      relations: { avatar: true },
    });
    if (!author) throw new NotFoundException('Tác giả không tồn tại');
    return author;
  }

  private async clearAuthorCache(author: Author) {
    try {
      await Promise.all([
        this.cacheManager.del(`/apis/v1/authors/${author.slug}`),
        this.cacheManager.del(`/apis/v1/authors/id/${author.id}`),
        this.cacheManager.del(`/apis/v1/authors`), 
      ]);
      this.logger.log(`Đã xóa cache cho tác giả: ${author.id}`);
    } catch (error) {
      this.logger.error(`Lỗi xóa cache tác giả ${author.id}:`, error);
    }
  }
}
