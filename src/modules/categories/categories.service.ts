// src/modules/categories/categories.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { BaseService } from '@app/common/base/base.service';
import { Category } from './entities/category.entity';
import { SlugUtil } from '@app/common/utils/slug.util';

@Injectable()
export class CategoriesService extends BaseService<Category> {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {
    super(categoryRepository);
  }

  // --- LOGIC GHI ĐÈ CREATE / UPDATE ---
  async create(
    data: Partial<Category>,
    currentUserId?: string,
  ): Promise<Category> {
    if (!data.slug && data.name) data.slug = SlugUtil.generate(data.name);
    if (data.slug) await this.validateSlugDuplication(data.slug);
    if (data.parentId) await this.validateParentExists(data.parentId);

    // 1. Gọi base để lưu vào DB
    const newCategory = await super.create(data, currentUserId);

    // 2. Fetch lại kèm thông tin Parent
    const result = await this.categoryRepository.findOne({
      where: { id: newCategory.id },
      relations: { parent: true },
    });

    // 3. Đảm bảo dữ liệu không bao giờ null để chiều lòng TypeScript
    if (!result) {
      throw new NotFoundException(
        'Đã tạo thành công nhưng lỗi khi truy xuất dữ liệu trả về',
      );
    }

    return result;
  }

  async update(
    id: string,
    data: Partial<Category>,
    currentUserId?: string,
  ): Promise<Category> {
    if (data.name && !data.slug) data.slug = SlugUtil.generate(data.name);
    if (data.slug) await this.validateSlugDuplication(data.slug, id);
    if (data.parentId) {
      if (data.parentId === id)
        throw new BadRequestException(
          'Danh mục không thể làm cha của chính nó',
        );
      await this.validateParentExists(data.parentId);
      await this.checkCircularDependency(id, data.parentId);
    }

    // 1. Gọi base để update
    await super.update(id, data, currentUserId);

    // 2. Fetch lại kèm thông tin Parent
    const result = await this.categoryRepository.findOne({
      where: { id },
      relations: { parent: true },
    });

    if (!result) {
      throw new NotFoundException('Lỗi khi truy xuất dữ liệu sau cập nhật');
    }

    return result;
  }

  // --- LOGIC KIỂM TRA BỔ TRỢ ---
  private async validateSlugDuplication(slug: string, excludeId?: string) {
    const existing = await this.categoryRepository.findOne({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException({
        message: 'Tên hoặc Slug đã tồn tại.',
        duplicateSlug: slug,
      });
    }
  }

  private async validateParentExists(parentId: string) {
    const parent = await this.categoryRepository.findOne({
      where: { id: parentId },
    });
    if (!parent) throw new BadRequestException('Danh mục cha không tồn tại');
  }

  // Thuật toán bám ngược lên gốc để tìm xem ID hiện tại có đang nằm trong chuỗi cha hay không
  private async checkCircularDependency(
    categoryId: string,
    newParentId: string,
  ) {
    let currentParent = await this.categoryRepository.findOne({
      where: { id: newParentId },
    });
    while (currentParent) {
      if (currentParent.id === categoryId) {
        throw new BadRequestException(
          'Lỗi vòng lặp: Không thể gán danh mục cha là một danh mục con thuộc nhánh hiện tại',
        );
      }
      if (!currentParent.parentId) break;
      currentParent = await this.categoryRepository.findOne({
        where: { id: currentParent.parentId },
      });
    }
  }

  // --- LOGIC HIỂN THỊ PUBLIC ---

  // Lấy toàn bộ cây thư mục (Dành cho Menu Public)
  async getPublicTree(): Promise<Category[]> {
    // TypeORM có hỗ trợ find trees, nhưng cách chủ động này giúp kiểm soát sâu hơn
    return this.categoryRepository.find({
      where: { parentId: IsNull() },
      relations: {
        children: {
          children: true, // Lấy sâu xuống 1 tầng nữa
        },
      },
    });
  }

  // Lấy chi tiết Category kèm Breadcrumbs (Mảng các danh mục từ Gốc -> Hiện tại)
  async getCategoryWithBreadcrumbs(slug: string) {
    const category = await this.categoryRepository.findOne({
      where: { slug },
      relations: {
        children: true,
      },
    });
    if (!category) throw new NotFoundException('Không tìm thấy danh mục');

    const breadcrumbs: Category[] = [];
    let current: Category | null = category;

    // Bám ngược lên gốc để tạo breadcrumbs
    while (current) {
      breadcrumbs.unshift(current); // Đẩy vào đầu mảng để xếp từ Gốc -> Con
      if (!current.parentId) break;
      current = await this.categoryRepository.findOne({
        where: { id: current.parentId },
      });
    }

    return {
      detail: category,
      breadcrumbs,
    };
  }
}
