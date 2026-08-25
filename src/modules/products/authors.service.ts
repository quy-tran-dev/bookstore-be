import {
  BadRequestException,
  Injectable,
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

@Injectable()
export class AuthorsService extends BaseService<Author> {
  constructor(
    @InjectRepository(Author)
    private readonly authorRepository: Repository<Author>,
    private readonly mediaService: MediaService,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
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

    await super.create(payload, currentUserId);

    return this.findOneAdmin(payload.id);
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
      avatar: data.mediaId ? { id: data.mediaId } : undefined,
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
}
