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
import { INestApplicationContext } from '@nestjs/common';

export interface SeedCategoriesOptions {
  extraCategories?: Array<{ name: string; level: number; parent?: string }>;
}

export interface SeedAuthorsOptions {
  extraAuthors?: Array<{ name: string; describe?: string }>;
}

export interface SeedBooksOptions {
  fresh?: boolean;
  extraBooks?: Array<{
    name: string;
    price: number;
    categories: string[];
    authors: string[];
    description: string;
  }>;
}

/**
 * 1. SEED CATEGORIES (IDEMPOTENT / INCREMENTAL)
 * Chỉ thêm mới các danh mục chưa tồn tại (so khớp theo slug), giữ nguyên toàn bộ danh mục cũ.
 */
export const seedCategories = async (
  dataSource: DataSource,
  options?: SeedCategoriesOptions,
) => {
  console.log('\n🛡️ [SAFE INCREMENTAL] Đang kiểm tra và bổ sung Categories...');
  const categoryRepo = dataSource.getRepository(Category);

  const existingCategories = await categoryRepo.find({
    select: { id: true, name: true, slug: true },
    withDeleted: true,
  });

  const categoryMap = new Map<string, string>();
  for (const cat of existingCategories) {
    if (cat.slug) {
      categoryMap.set(cat.slug, cat.id);
    }
  }

  const catData = [...categories, ...(options?.extraCategories || [])];
  let createdCount = 0;
  let skippedCount = 0;

  // Bước 1: Xử lý Danh mục Cấp 1
  for (const cat of catData.filter((c: any) => c.level === 1)) {
    if (!cat.name) continue;
    const catName = cat.name as string;
    const slugC = SlugUtil.generate(catName);

    if (categoryMap.has(slugC)) {
      skippedCount++;
      continue;
    }

    const newCat = categoryRepo.create({
      name: catName,
      slug: slugC,
      isVerified: true,
      status: StatusCategory.ACTIVE,
    });

    const saved = await categoryRepo.save(newCat);
    const savedId = Array.isArray(saved) ? saved[0].id : saved.id;
    categoryMap.set(slugC, savedId);
    createdCount++;
    console.log(` ✅ Đã thêm Danh mục Cấp 1 mới: "${catName}"`);
  }

  // Bước 2: Xử lý Danh mục Cấp 2
  for (const cat of catData.filter((c: any) => c.level === 2)) {
    if (!cat.name) continue;
    const catName = cat.name as string;
    const slugC = SlugUtil.generate(catName);

    if (categoryMap.has(slugC)) {
      skippedCount++;
      continue;
    }

    const parentName = cat.parent as string;
    const parentId = parentName
      ? categoryMap.get(SlugUtil.generate(parentName))
      : undefined;

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
    createdCount++;
    console.log(` ✅ Đã thêm Danh mục Cấp 2 mới: "${catName}"`);
  }

  console.log(
    ` Hoàn tất Seed Categories: Thêm mới ${createdCount}, Bỏ qua ${skippedCount} (Tổng trong DB: ${categoryMap.size}).`,
  );

  return {
    categoryMap,
    createdCount,
    skippedCount,
    totalInDatabase: categoryMap.size,
  };
};

/**
 * 2. SEED AUTHORS (IDEMPOTENT / INCREMENTAL)
 * Chỉ thêm mới các tác giả chưa tồn tại (so khớp theo slug), tuyệt đối không xóa tác giả cũ.
 */
export const seedAuthors = async (
  dataSource: DataSource,
  options?: SeedAuthorsOptions,
) => {
  console.log('\n🛡️ [SAFE INCREMENTAL] Đang kiểm tra và bổ sung Authors...');
  const authorRepo = dataSource.getRepository(Author);

  const existingAuthors = await authorRepo.find({
    select: { id: true, name: true, slug: true },
    withDeleted: true,
  });

  const authorMap = new Map<string, string>();
  for (const auth of existingAuthors) {
    const slugKey = auth.slug || SlugUtil.generate(auth.name);
    authorMap.set(slugKey, auth.id);
  }

  const authorData = [...authors, ...(options?.extraAuthors || [])];
  let createdCount = 0;
  let skippedCount = 0;

  for (const author of authorData) {
    if (!author.name) continue;
    const authorName = author.name as string;
    const slugA = SlugUtil.generate(authorName);

    if (authorMap.has(slugA)) {
      skippedCount++;
      continue;
    }

    const newAuthor = authorRepo.create({
      name: authorName,
      slug: slugA,
      describe: (author.describe as string) || `Tác giả ${authorName}`,
    });

    const saved = await authorRepo.save(newAuthor);
    const savedId = Array.isArray(saved) ? saved[0].id : saved.id;
    authorMap.set(slugA, savedId);
    createdCount++;
    console.log(` ✅ Đã thêm Tác giả mới: "${authorName}"`);
  }

  console.log(
    ` Hoàn tất Seed Authors: Thêm mới ${createdCount}, Bỏ qua ${skippedCount} (Tổng trong DB: ${authorMap.size}).`,
  );

  return {
    authorMap,
    createdCount,
    skippedCount,
    totalInDatabase: authorMap.size,
  };
};

/**
 * 3. SEED BOOKS / PRODUCTS (IDEMPOTENT / INCREMENTAL)
 * - Không xóa dữ liệu sách cũ trừ khi có cờ `fresh: true`.
 * - Nếu sách đã có trong DB (so khớp theo slug): Bỏ qua ngay lập tức (0ms), không gọi AI sinh lại Vector Embedding.
 * - Chỉ tạo Vector Embedding và lưu DB cho các đầu sách MỚI được bổ sung.
 */
export const seedProducts = async (
  dataSource: DataSource,
  app?: INestApplicationContext,
  options?: SeedBooksOptions,
) => {
  const productRepo = dataSource.getRepository(Product);
  const productsService = app ? app.get(ProductsService) : null;
  const isFresh = options?.fresh === true;

  if (isFresh) {
    console.log(
      '\n⚠️ [FRESH MODE] Đang xóa trắng Categories, Authors & Products...',
    );
    await dataSource.query(
      `TRUNCATE TABLE "authors", "products", "book_details", "categories", "product_categories", "book_authors", "product_albums", "medias" CASCADE`,
    );
  } else {
    console.log(
      '\n🛡️ [SAFE INCREMENTAL] Đang chạy Seeder Sách gia tăng (Giữ nguyên sách cũ & Vector Embedding đã có)...',
    );
  }

  // Đảm bảo Categories và Authors đã được đồng bộ và lấy Map<slug, id>
  const { categoryMap } = await seedCategories(dataSource);
  const { authorMap } = await seedAuthors(dataSource);

  // Nạp toàn bộ slug sách đã tồn tại trong DB để bỏ qua tức thì (0ms)
  const existingProducts = await productRepo.find({
    select: { id: true, slug: true, name: true },
    withDeleted: true,
  });
  const existingProductSlugs = new Set<string>(
    existingProducts
      .map((p) => p.slug || SlugUtil.generate(p.name))
      .filter(Boolean),
  );

  const productData = [...products, ...(options?.extraBooks || [])];
  let createdCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < productData.length; i++) {
    const prod = productData[i];
    if (!prod?.name) continue;

    const productSlug = SlugUtil.generate(prod.name);
    if (existingProductSlugs.has(productSlug)) {
      skippedCount++;
      continue;
    }

    const categoryIds = (prod.categories || [])
      .map((cName: string) => categoryMap.get(SlugUtil.generate(cName)))
      .filter(Boolean);

    const authorIds = (prod.authors || [])
      .map((aName: string) => authorMap.get(SlugUtil.generate(aName)))
      .filter(Boolean);

    const costPrice = Math.floor(prod.price * 0.6);
    const discountPrice = Math.floor(prod.price * 0.85);

    const payload: any = {
      name: prod.name,
      slug: productSlug,
      shortDescribe: prod.description,
      cost: costPrice,
      price: prod.price,
      finalPrice: discountPrice,
      stockQuantity: Math.floor(Math.random() * 200) + 10,
      soldCount: Math.floor(Math.random() * 1000),
      isVerified: true,
      status: StatusProduct.ACTIVE,
      categories: categoryIds.map((id) => ({ id })),
      authors: authorIds.map((id) => ({ id })),
      bookDetail: {
        title: prod.name,
        describe: `${prod.description} Tác phẩm được đánh giá cực kỳ cao.`,
        publisher: 'NXB Tổng Hợp',
        publishYear: 2020 + Math.floor(Math.random() * 6),
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
      payload.seoKeywords = aiData.seoKeywords;
      payload.embedding = aiData.embedding;
    }

    await productRepo.save(productRepo.create(payload));
    existingProductSlugs.add(productSlug);
    createdCount++;

    console.log(
      ` ✅ Đã thêm sách mới & tạo Vector [${i + 1}/${productData.length}]: "${prod.name}"`,
    );
  }

  console.log(
    ` Hoàn tất Seed Books: Thêm mới ${createdCount} sách, Bỏ qua ${skippedCount} sách đã tồn tại (Tổng trong DB: ${existingProductSlugs.size}).`,
  );

  return {
    createdCount,
    skippedCount,
    totalInDatabase: existingProductSlugs.size,
  };
};

export const seedBooks = seedProducts;
