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

export const seedProducts = async (
  dataSource: DataSource,
  app?: INestApplicationContext,
) => {
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

  // Tạo Cấp 1
  for (const cat of catData.filter((c: any) => c.level === 1)) {
    if (!cat.name) continue;

    const catName = cat.name as string;
    const slugC = SlugUtil.generate(catName);

    const newCat = categoryRepo.create({
      name: catName,
      slug: slugC,
      isVerified: true,
      status: StatusCategory.ACTIVE,
    });

    const saved = await categoryRepo.save(newCat);
    const savedId = Array.isArray(saved) ? saved[0].id : saved.id;

    // SỬA LỖI: Lưu Map bằng SLUG để đồng bộ với cách gọi ở dưới
    categoryMap.set(slugC, savedId);
  }

  // Tạo Cấp 2
  for (const cat of catData.filter((c: any) => c.level === 2)) {
    if (!cat.name) continue;

    const catName = cat.name as string;
    const parentName = cat.parent as string;
    // Truy xuất parent cũng phải dùng Slug
    const parentId = parentName
      ? categoryMap.get(SlugUtil.generate(parentName))
      : undefined;
    const slugC = SlugUtil.generate(catName);

    const newCat = categoryRepo.create({
      name: catName,
      slug: slugC,
      parent: parentId ? { id: parentId } : undefined,
      isVerified: true,
      status: StatusCategory.ACTIVE,
    });

    const saved = await categoryRepo.save(newCat);
    const savedId = Array.isArray(saved) ? saved[0].id : saved.id;
    categoryMap.set(slugC, savedId);
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
    const slugA = SlugUtil.generate(authorName);
    const newAuthor = authorRepo.create({
      name: authorName,
      slug: slugA,
      describe: author.describe as string,
    });

    const saved = await authorRepo.save(newAuthor);
    const savedId = Array.isArray(saved) ? saved[0].id : saved.id;
    authorMap.set(slugA, savedId);
  }
  // ==========================================
  // 3. SEED PRODUCTS
  // ==========================================
  console.log(
    'Đang tạo Products (Đang trích xuất từ khóa và tạo Vector, vui lòng đợi)...',
  );
  const productData = products;

  for (let i = 0; i < productData.length; i++) {
    const prod = productData[i];

    const categoryIds = prod.categories
      .map((cName: string) => categoryMap.get(SlugUtil.generate(cName)))
      .filter(Boolean);

    const authorIds = prod.authors
      .map((aName: string) => authorMap.get(SlugUtil.generate(aName)))
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

      // SỬA LỖI Ở ĐÂY: Biến mảng string ID thành mảng Object { id: string }
      categories: categoryIds.map((id) => ({ id })),
      authors: authorIds.map((id) => ({ id })),

      bookDetail: {
        title: prod.name,
        describe: `${prod.description} Tác phẩm được đánh giá cực kỳ cao.`,
        publisher: 'NXB Tổng Hợp',
        publishYear: 2020 + Math.floor(Math.random() * 5),
        language: 'Tiếng Việt',
        format: Math.random() > 0.5 ? 'Bìa mềm' : 'Bìa cứng',
        pageCount: Math.floor(Math.random() * 300) + 150,
      },
    };

    if (productsService) {
      const aiData = await productsService.generateEmbeddingAndSeoKeywords(
        prod.name,
        prod.description,
        categoryIds as string[],
      );
      (payload as any).seoKeywords = aiData.seoKeywords;
      (payload as any).embedding = aiData.embedding;
    }

    await productRepo.save(productRepo.create(payload as any));
    console.log(
      ` Đã xử lý xong [${i + 1}/${productData.length}]: ${prod.name}`,
    );
  }

  console.log('Seed toàn bộ dữ liệu thật thành công!');
};
