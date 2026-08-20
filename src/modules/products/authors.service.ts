import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@app/common/base/base.service';
import { Author } from './entities/author.entity';
import { MediaService } from '../media/media.service';
import { SlugUtil } from '@app/common/utils/slug.util';
import { UpdateAuthorDto } from './dto/admin-author.dto';
import { Product } from './entities/product.entity';

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
        'authors',
        slug,
      );
    }

    // 3. Chuẩn bị payload để lưu
    const payload = {
      ...data,
      slug,
      avatar: data.mediaId ? { id: data.mediaId } : null,
    };

    return super.create(payload, currentUserId);
  }

  async update(id: string, data: any, currentUserId?: string): Promise<Author> {
    // Lấy thông tin cũ để biết slug hiện tại
    if (!data.slug && data.name) data.slug = SlugUtil.generate(data.name);
    if (data.slug) await this.validateSlugDuplication(data.slug, id);

    // Nếu có up ảnh mới (hoặc đổi ảnh)
    if (data.mediaId) {
      await this.mediaService.moveMediaToSubfolder(
        data.mediaId,
        'authors',
        data.slug,
      );
    }

    const payload = {
      ...data,
      avatar: data.mediaId ? { id: data.mediaId } : undefined,
    };

    return super.update(id, payload, currentUserId);
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
