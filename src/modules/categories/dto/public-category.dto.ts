import { Category } from '../entities/category.entity';

export class CategoryTreeResponse {
  id: string;
  name?: string;
  slug?: string;
  children: CategoryTreeResponse[];
  
  constructor(category: Category) {
    this.id = category.id;
    this.name = category.name;
    this.slug = category.slug;
    this.children = category.children ? category.children.map(c => new CategoryTreeResponse(c)) : [];
  }
}