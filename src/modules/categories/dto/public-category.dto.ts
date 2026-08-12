import { Category } from '../entities/category.entity';

export class PublicCategoryDto {
  id: string;
  name?: string;
  slug?: string;
  parentId?: string;
  parentName?: string;
  children: PublicCategoryDto[];

  constructor(category: Category) {
    this.id = category.id;
    this.name = category.name;
    this.slug = category.slug;
    if (category.children && category.children.length > 0) {
      this.children = category.children.map(c => new PublicCategoryDto(c));
    } else {
      this.children = [];
    }
    this.parentId = category.parentId;
    if (category.parent) {
      this.parentName = category.parent.name;
    }
  }
}
