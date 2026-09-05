// src/modules/categories/categories.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, IsNull, Repository } from 'typeorm';
import { BaseService } from '@app/common/base/base.service';
import { Category } from './entities/category.entity';
import { SlugUtil } from '@app/common/utils/slug.util';
import { StatusCategory } from '@app/common/enums/status-category.enum';
import { PublicCategoryDto } from './dto/public-category.dto';
import { Product } from '../products/entities/product.entity';

@Injectable()
export class CategoriesService extends BaseService<Category> {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {
    super(categoryRepository);
  }
  // --- TẠO CÂY CHO ADMIN (CÓ FILTER, KHÔNG PHÂN TRANG) ---
  async getAdminTree(options: {
    keyword?: string;
    status?: number;
    isVerified?: boolean;
    orderBy?: string;
    sort?: 'ASC' | 'DESC';
  }) {
    const whereCondition: any = {};

    if (options.keyword) {
      whereCondition.name = ILike(`%${options.keyword}%`);
    }
    if (options.status !== undefined) {
      whereCondition.status = options.status;
    }
    if (options.isVerified !== undefined) {
      whereCondition.isVerified = options.isVerified;
    }

    const orderCondition: any = {};
    if (options.orderBy) {
      orderCondition[options.orderBy] = options.sort || 'DESC';
    } else {
      orderCondition.createdAt = 'DESC';
    }

    // Lấy toàn bộ data thỏa mãn điều kiện lọc
    const allCategories = await this.categoryRepository.find({
      where: whereCondition,
      order: orderCondition,
    });

    const categoryMap = new Map<string, any>();
    const tree: any[] = [];

    // Nạp vào Hash Map
    allCategories.forEach((cat) => {
      // Giữ nguyên toàn bộ trường audit (createdAt, status...) để Admin Table hiển thị
      categoryMap.set(cat.id, { ...cat, children: [] });
    });

    // Móc nối Cha - Con
    allCategories.forEach((cat) => {
      const mappedCat = categoryMap.get(cat.id);

      // Nếu có parentId VÀ parent đó thực sự tồn tại trong danh sách đang lọc
      if (cat.parentId && categoryMap.has(cat.parentId)) {
        categoryMap.get(cat.parentId).children.push(mappedCat);
      } else {
        // Nếu không có Cha, HOẶC Cha đã bị filter mất tiêu -> Cho làm Gốc luôn
        tree.push(mappedCat);
      }
    });

    return {
      tree: tree,
      total: allCategories.length, // Trả về tổng số lượng để FE biết
    };
  }
  async findAdminDetail(id: string): Promise<Category> {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: { parent: true }, // Phải join parent để FE hiển thị Dropdown/Text
    });

    if (!category) throw new NotFoundException('Không tìm thấy danh mục');
    return category;
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

  async softDelete(id: string, currentUserId?: string): Promise<void> {
    await this.checkProductRelation(id);
    await this.reassignChildrenBeforeDelete(id);
    await super.softDelete(id, currentUserId);
  }

  async hardDelete(id: string): Promise<void> {
    await this.checkProductRelation(id);
    await this.reassignChildrenBeforeDelete(id);
    const category = await this.categoryRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!category) throw new NotFoundException('Danh mục không tồn tại');


    await this.categoryRepository.remove(category);
  }

  // Helper xử lý logic nối lại node con
  private async reassignChildrenBeforeDelete(categoryId: string) {
    // Tìm category chuẩn bị xóa kèm theo parent của nó
    const categoryToKill = await this.categoryRepository.findOne({
      where: { id: categoryId },
      relations: { parent: true },
      withDeleted: true,
    });

    if (!categoryToKill) throw new NotFoundException('Danh mục không tồn tại');

    const grandParentId = categoryToKill.parent
      ? categoryToKill.parent.id
      : null;

    // Dùng QueryBuilder update toàn bộ node con:
    // Trỏ parentId của con về ông nội (grandParentId), nếu không có ông nội thì gán NULL (ra root)
    await this.categoryRepository
      .createQueryBuilder()
      .update(Category)
      .set({ parent: grandParentId ? { id: grandParentId } : null } as any)
      .where('parentId = :id', { id: categoryId })
      .execute();
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
        status: StatusCategory.ACTIVE,
      },
      order: { createdAt: 'ASC' },
    });

    const categoryMap = new Map<string, any>();
    const tree: any[] = [];

    allCategories.forEach((cat) => {
      categoryMap.set(cat.id, {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        children: [],
      });
    });

    allCategories.forEach((cat) => {
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
    const category = await this.categoryRepository.findOne({
      where: { slug, isVerified: true, status: StatusCategory.ACTIVE },
      relations: { parent: true },
    });

    if (!category)
      throw new NotFoundException('Không tìm thấy danh mục hoặc đang tạm ẩn');

    const breadcrumbs: Category[] = [];
    let currentId: string | null = category.id;

    while (currentId) {
      const currentCat = await this.categoryRepository.findOne({
        where: { id: currentId },
      });
      if (!currentCat) break;

      breadcrumbs.unshift(currentCat);
      currentId = currentCat.parentId || null;
    }

    // Lấy mảng con trực tiếp
    const directChildren = await this.categoryRepository.find({
      where: {
        parentId: category.id,
        isVerified: true,
        status: StatusCategory.ACTIVE,
      },
      relations: { parent: true },
    });

    category.children = directChildren;

    return {
      detail: new PublicCategoryDto(category), // Lúc này detail đã ngậm đầy đủ children
      children: directChildren.map((child) => new PublicCategoryDto(child)), // Giữ lại mảng rời bên ngoài nếu FE cần xài riêng
      breadcrumbs: breadcrumbs.map((crumb) => new PublicCategoryDto(crumb)),
    };
  }

  private async checkProductRelation(categoryId: string) {
    // Đếm xem có bao nhiêu cuốn sách đang thuộc danh mục này
    const linkedProductsCount = await this.productRepository.count({
      where: { categories: { id: categoryId } },
    });

    if (linkedProductsCount > 0) {
      throw new BadRequestException(
        `Không thể xóa! Danh mục này đang chứa ${linkedProductsCount} sản phẩm. Hãy gỡ hoặc chuyển danh mục cho các sản phẩm đó trước.`,
      );
    }
  }
}
