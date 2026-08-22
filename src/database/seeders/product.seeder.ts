import { DataSource } from 'typeorm';
import { Product } from '../../modules/products/entities/product.entity';
import { Author } from '../../modules/products/entities/author.entity';
import { Category } from '../../modules/categories/entities/category.entity';
import { StatusCategory } from '@app/common/enums/status-category.enum';
import { StatusProduct } from '@app/common/enums/status-product.enum';

import { categories } from './data/categories.json';
import { authors } from './data/auhtors.json';
import { products } from './data/products.json';
import { SlugUtil } from '@app/common/utils/slug.util';
import { ProductsService } from '@app/modules/products/products.service';
import { INestApplication, INestApplicationContext } from '@nestjs/common';

export const seedProducts = async (dataSource: DataSource, app?: INestApplicationContext) => {
  console.log('\n Đang reset Products & Authors...');

  const productRepo = dataSource.getRepository(Product);
  const authorRepo = dataSource.getRepository(Author);
  const categoryRepo = dataSource.getRepository(Category);

  const productsService = app ? app.get(ProductsService) : null;
  // 1. Reset sạch sẽ dữ liệu
  await dataSource.query(
    `TRUNCATE TABLE "authors", "products", "book_details", "categories", "product_categories", "book_authors", "product_albums", "medias" CASCADE`,
  );

  console.log('\n Đang tạo seed Categories, Products & Authors...');

  // ==========================================
  // 1. SEED CATEGORIES
  // ==========================================
  console.log(' Đang tạo Categories...');
  const catData = categories;
  const categoryMap = new Map<string, string>();

  // Tạo Cấp 1 trước
  for (const cat of catData.filter((c: any) => c.level === 1)) {
    if (!cat.name) continue;
    
    // Ép kiểu rõ ràng để TypeScript không cằn nhằn
    const catName = cat.name as string;
    
    const newCat = categoryRepo.create({
      name: catName,
      slug: SlugUtil.generate(catName),
      isVerified: true,
      status: StatusCategory.ACTIVE,
    });
    
    const saved = await categoryRepo.save(newCat);
    // Đảm bảo lấy đúng ID (phòng hờ trường hợp trả về mảng)
    const savedId = Array.isArray(saved) ? saved[0].id : saved.id;
    categoryMap.set(catName, savedId);
  }

  // Tạo Cấp 2
  for (const cat of catData.filter((c: any) => c.level === 2)) {
    if (!cat.name) continue;
    
    const catName = cat.name as string;
    const parentName = cat.parent as string;
    const parentId = parentName ? categoryMap.get(parentName) : undefined;
    
    const newCat = categoryRepo.create({
      name: catName,
      slug: SlugUtil.generate(catName),
      // Dùng undefined thay vì null để khớp với kiểu DeepPartial của TypeORM
      parent: parentId ? { id: parentId } : undefined,
      isVerified: true,
      status: StatusCategory.ACTIVE,
    });

    const saved = await categoryRepo.save(newCat);
    const savedId = Array.isArray(saved) ? saved[0].id : saved.id;
    categoryMap.set(catName, savedId);
  }

  // ==========================================
  // 2. SEED AUTHORS
  // ==========================================
  console.log('Đang tạo Authors...');
  const authorData = authors;
  const authorMap = new Map<string, string>();

  for (const author of authorData) {
    if (!author.name) continue;
    
    const authorName = author.name as string;
    
    const newAuthor = authorRepo.create({
      name: authorName,
      slug: SlugUtil.generate(authorName),
      describe: author.describe as string,
    });

    const saved = await authorRepo.save(newAuthor);
    const savedId = Array.isArray(saved) ? saved[0].id : saved.id;
    authorMap.set(authorName, savedId);
  }
  // ==========================================
  // 3. SEED PRODUCTS (GỌI AI TẠO VECTOR & TÍNH TOÁN GIÁ)
  // ==========================================
  console.log(
    'Đang tạo Products (Đang trích xuất từ khóa và tạo Vector, vui lòng đợi)...',
  );
  const productData = products;

  for (let i = 0; i < productData.length; i++) {
    const prod = productData[i];

    // Map tên ra ID
    const categoryIds = prod.categories
      .map((cName: string) => categoryMap.get(cName))
      .filter(Boolean);
    const authorIds = prod.authors
      .map((aName: string) => authorMap.get(aName))
      .filter(Boolean);

    const costPrice = Math.floor(prod.price * 0.6);
    const discountPrice = Math.floor(prod.price * 0.85);

    const payload = {
      name: prod.name,
      slug: SlugUtil.generate(prod.name),
      shortDescribe: prod.description,
      cost: costPrice,
      price: prod.price,
      finalPrice: discountPrice,
      stockQuantity: Math.floor(Math.random() * 200) + 10,
      soldCount: Math.floor(Math.random() * 1000),
      isVerified: true,
      status: StatusProduct.ACTIVE,
      categoryIds, // Đã map ID ở trên
      authorIds,
      bookDetail: {
        // ...
      }
    };

    // CHỈ MƯỢN HÀM AI TỪ SERVICE (Bypass logic Create của Service)
    if (productsService) {
      const aiData = await productsService.generateEmbeddingAndSeoKeywords(
        prod.name,
        prod.description,
        categoryIds as string[],
      );
      (payload as any).seoKeywords = aiData.seoKeywords;
      (payload as any).embedding = aiData.embedding;
    }

    // Lưu thẳng bằng Repo
    await productRepo.save(productRepo.create(payload as any));
    console.log(
      ` Đã xử lý xong [${i + 1}/${productData.length}]: ${prod.name}`,
    );
  }

  console.log('  Seed toàn bộ dữ liệu thật thành công!');
};
