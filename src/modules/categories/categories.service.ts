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
import { StatusCategory } from '@app/common/enums/status-category.enum';

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

  // --- LẤY MENU TREE CHO PUBLIC ---
  async getPublicTree(): Promise<any[]> {
    // Kẹp điều kiện isVerified: true và status: 1 ngay tại đây
    const allCategories = await this.categoryRepository.find({
      where: { 
        isVerified: true, 
        status: 1 
      },
      order: { createdAt: 'ASC' }
    });

    const categoryMap = new Map<string, any>();
    const tree: any[] = [];

    allCategories.forEach(cat => {
      categoryMap.set(cat.id, { 
        id: cat.id, name: cat.name, slug: cat.slug, imgUrl: cat.imgUrl, children: [] 
      });
    });

    allCategories.forEach(cat => {
      const mappedCat = categoryMap.get(cat.id);
      if (cat.parentId) {
        // Lưu ý: Nếu Danh mục Cha bị ẩn, hệ thống sẽ bỏ qua luôn các Danh mục Con
        const parent = categoryMap.get(cat.parentId);
        if (parent) parent.children.push(mappedCat);
      } else {
        tree.push(mappedCat);
      }
    });

    return tree;
  }

  // --- LẤY CHI TIẾT & BREADCRUMBS ---
  async getCategoryWithBreadcrumbs(slug: string) {
    // Phải đảm bảo danh mục đang xem cũng phải thỏa mãn điều kiện Public
    const category = await this.categoryRepository.findOne({ 
      where: { 
        slug,
        isVerified: true,
        status: StatusCategory.ACTIVE
      } 
    });
    
    if (!category) throw new NotFoundException('Không tìm thấy danh mục hoặc danh mục đang tạm ẩn');

    const breadcrumbs: Category[] = [];
    let currentId: string | null = category.id;

    while (currentId) {
      const currentCat = await this.categoryRepository.findOne({ where: { id: currentId } });
      if (!currentCat) break;
      
      breadcrumbs.unshift(currentCat);
      currentId = currentCat.parentId || null; 
    }

    // Chỉ lấy các danh mục con cũng đang Active
    const directChildren = await this.categoryRepository.find({ 
      where: { 
        parentId: category.id,
        isVerified: true,
        status: StatusCategory.ACTIVE
      } 
    });

    return {
      detail: category,
      children: directChildren,
      breadcrumbs,
    };
  }
}
