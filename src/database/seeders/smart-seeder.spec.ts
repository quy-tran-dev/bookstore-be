jest.mock('uuid', () => ({
  v7: () => '019a0000-0000-7000-8000-000000000100',
}));

jest.mock('@nestjs/cache-manager', () => ({
  CACHE_MANAGER: 'CACHE_MANAGER',
  CacheInterceptor: class {},
  CacheTTL: () => () => {},
}));

jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(),
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn(async () => 'hashed_password_123456'),
}));

import { parseSeederCliArgs } from './run-seeder';
import { seedUsers } from './user.seeder';
import {
  seedAuthors,
  seedProducts,
} from './product.seeder';
import { seedOrders } from './order.seeder';
import { SlugUtil } from '@app/common/utils/slug.util';
import { users } from './data/users.json';
import { authors } from './data/auhtors.json';
import { products } from './data/products.json';

describe('Smart & Incremental Seeder Suite - Cơ chế nạp gia tăng an toàn (Không xóa dữ liệu cũ)', () => {
  // =========================================================================
  // 1. KIỂM THỬ BỘ PHÂN TÍCH CỜ DÒNG LỆNH (CLI ARGUMENTS PARSER)
  // =========================================================================
  describe('1. Kiểm thử parseSeederCliArgs', () => {
    it('phải mặc định chạy ở chế độ Safe Incremental (fresh = false, target = all, count = 180, months = 6)', () => {
      const parsed = parseSeederCliArgs([]);
      expect(parsed.fresh).toBe(false);
      expect(parsed.targets).toEqual(['all']);
      expect(parsed.count).toBe(180);
      expect(parsed.months).toBe(6);
      expect(parsed.runMigrations).toBe(false);
    });

    it('phải phân tích chính xác các cờ --target=authors,books, --count=90, --months=3, --migrate', () => {
      const parsed = parseSeederCliArgs([
        '--target=authors,books',
        '--count=90',
        '--months=3',
        '--migrate',
      ]);
      expect(parsed.fresh).toBe(false);
      expect(parsed.targets).toEqual(['authors', 'books']);
      expect(parsed.count).toBe(90);
      expect(parsed.months).toBe(3);
      expect(parsed.runMigrations).toBe(true);
    });

    it('chỉ bật chế độ xóa trắng (fresh = true) khi truyền rõ cờ --fresh hoặc -f', () => {
      expect(parseSeederCliArgs(['--fresh']).fresh).toBe(true);
      expect(parseSeederCliArgs(['-f']).fresh).toBe(true);
    });
  });

  // =========================================================================
  // 2. KIỂM THỬ SEED USERS & SEED AUTHORS GIA TĂNG (KHÔNG TRUNCATE)
  // =========================================================================
  describe('2. Kiểm thử seedUsers và seedAuthors theo cơ chế Idempotent / Incremental', () => {
    it('seedUsers không được gọi TRUNCATE và phải bỏ qua các email đã tồn tại trong DB', async () => {
      const savedUsers: any[] = [];
      const mockUserRepo = {
        find: jest.fn(async () => [
          { id: 'u1', email: users[0].email },
          { id: 'u2', email: users[1].email },
        ]),
        create: jest.fn((data) => data),
        save: jest.fn(async (data) => {
          savedUsers.push(data);
          return data;
        }),
      };

      const mockDataSource: any = {
        query: jest.fn(),
        getRepository: jest.fn(() => mockUserRepo),
      };

      const res = await seedUsers(mockDataSource, {
        fresh: false,
        extraUsers: [
          {
            email: 'new.reader@bookstore.com',
            role: 'CUSTOMER',
            isVerified: true,
            userDetail: { fullName: 'Độc Giả Mới' },
          },
        ],
      });

      expect(mockDataSource.query).not.toHaveBeenCalled();
      expect(res.skippedCount).toBe(2);
      expect(res.createdCount).toBe(users.length - 2 + 1);
      expect(
        savedUsers.some((u) => u.email === 'new.reader@bookstore.com'),
      ).toBe(true);
    });

    it('seedAuthors không xóa tác giả cũ và cho phép thêm tác giả bổ sung mới', async () => {
      const existingAuthorsInDb = authors.map((a, idx) => ({
        id: `auth-${idx}`,
        name: a.name,
        slug: SlugUtil.generate(a.name),
      }));

      const savedAuthors: any[] = [];
      const mockAuthorRepo = {
        find: jest.fn(async () => existingAuthorsInDb),
        create: jest.fn((data) => data),
        save: jest.fn(async (data) => {
          const item = { ...data, id: `new-auth-${savedAuthors.length + 1}` };
          savedAuthors.push(item);
          return item;
        }),
      };

      const mockDataSource: any = {
        query: jest.fn(),
        getRepository: jest.fn(() => mockAuthorRepo),
      };

      const res = await seedAuthors(mockDataSource, {
        extraAuthors: [
          {
            name: 'Nguyễn Nhật Ánh (Bổ Sung)',
            describe: 'Nhà văn viết cho tuổi mới lớn',
          },
        ],
      });

      expect(mockDataSource.query).not.toHaveBeenCalled();
      expect(res.skippedCount).toBe(authors.length);
      expect(res.createdCount).toBe(1);
      expect(savedAuthors[0].name).toBe('Nguyễn Nhật Ánh (Bổ Sung)');
    });
  });

  // =========================================================================
  // 3. KIỂM THỬ SEED PRODUCTS: BỎ QUA SÁCH CŨ (KHÔNG TẠO LẠI EMBEDDING) & CHỈ TẠO VECTOR CHO SÁCH MỚI
  // =========================================================================
  describe('3. Kiểm thử seedProducts (Incremental Book Seeding - Không tính lại Vector cho sách đã có)', () => {
    it('phải bỏ qua toàn bộ sách đã có slug trong DB (0 lần gọi AI cho sách cũ) và chỉ sinh Vector Embedding cho đầu sách mới', async () => {
      const existingProductsInDb = products.map((p, idx) => ({
        id: `prod-${idx}`,
        name: p.name,
        slug: SlugUtil.generate(p.name),
      }));

      const savedProducts: any[] = [];
      const mockProductRepo = {
        find: jest.fn(async () => existingProductsInDb),
        create: jest.fn((data) => data),
        save: jest.fn(async (data) => {
          savedProducts.push(data);
          return data;
        }),
      };

      const mockCategoryRepo = {
        find: jest.fn(async () => [
          {
            id: 'cat-1',
            name: 'Lập Trình & CNTT',
            slug: SlugUtil.generate('Lập Trình & CNTT'),
          },
        ]),
        create: jest.fn((d) => d),
        save: jest.fn(async (d) => ({ ...d, id: 'cat-new' })),
      };

      const mockAuthorRepo = {
        find: jest.fn(async () => [
          {
            id: 'auth-1',
            name: 'Robert C. Martin',
            slug: SlugUtil.generate('Robert C. Martin'),
          },
        ]),
        create: jest.fn((d) => d),
        save: jest.fn(async (d) => ({ ...d, id: 'auth-new' })),
      };

      const mockDataSource: any = {
        query: jest.fn(),
        getRepository: jest.fn((entity: any) => {
          if (entity.name === 'Product') return mockProductRepo;
          if (entity.name === 'Category') return mockCategoryRepo;
          if (entity.name === 'Author') return mockAuthorRepo;
          return mockProductRepo;
        }),
      };

      const mockGenerateEmbedding = jest.fn(async () => ({
        seoKeywords: 'microservices, kien truc phan tan',
        embedding: new Array(384).fill(0.01),
      }));

      const mockApp: any = {
        get: jest.fn(() => ({
          generateEmbeddingAndSeoKeywords: mockGenerateEmbedding,
        })),
      };

      const res = await seedProducts(mockDataSource, mockApp, {
        fresh: false,
        extraBooks: [
          {
            name: 'Kiến Trúc Hệ Thống Phân Tán Hiện Đại 2027',
            price: 450000,
            categories: ['Lập Trình & CNTT'],
            authors: ['Robert C. Martin'],
            description:
              'Sách chuyên sâu về thiết kế hệ thống phân tán chịu lỗi cao.',
          },
        ],
      });

      expect(mockDataSource.query).not.toHaveBeenCalled();
      expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
      expect(res.createdCount).toBe(1);
      expect(res.skippedCount).toBeGreaterThanOrEqual(100);
      expect(savedProducts[0].name).toBe(
        'Kiến Trúc Hệ Thống Phân Tán Hiện Đại 2027',
      );
      expect(savedProducts[0].embedding.length).toBe(384);
    });
  });

  // =========================================================================
  // 4. KIỂM THỬ SEED ORDERS: BỔ SUNG NGẪU NHIÊN 6 THÁNG ĐƠN HÀNG (APPEND MODE)
  // =========================================================================
  describe('4. Kiểm thử seedOrders (Bổ sung ngẫu nhiên 6 tháng đơn hàng không xóa đơn cũ)', () => {
    it('phải sinh thêm đúng số lượng đơn hàng ngẫu nhiên trong khung 6 tháng mà không gọi TRUNCATE và không tạo trùng mã đơn hàng cũ', async () => {
      const savedOrderBatches: any[] = [];
      const savedPaymentBatches: any[] = [];
      const savedReviewBatches: any[] = [];

      const mockUserRepo = {
        find: jest.fn(async () => [
          { id: 'cust-1', email: 'c1@bookstore.com', role: 'CUSTOMER' },
          { id: 'cust-2', email: 'c2@bookstore.com', role: 'CUSTOMER' },
        ]),
      };

      const mockProductRepo = {
        find: jest.fn(async () => [
          {
            id: 'book-1',
            name: 'Clean Code - Mã Sạch',
            slug: 'clean-code-ma-sach',
            price: 350000,
            finalPrice: 297500,
          },
          {
            id: 'book-2',
            name: 'Đắc Nhân Tâm',
            slug: 'dac-nhan-tam',
            price: 120000,
            finalPrice: 102000,
          },
        ]),
      };

      const mockOrderRepo = {
        find: jest.fn(async () => [
          { id: 'old-ord-1', code: 'ORD-OLD-001' },
          { id: 'old-ord-2', code: 'ORD-OLD-002' },
        ]),
        save: jest.fn(async (batch: any[]) => {
          savedOrderBatches.push(...batch);
          return batch;
        }),
      };

      const mockPaymentRepo = {
        save: jest.fn(async (batch: any[]) => {
          savedPaymentBatches.push(...batch);
          return batch;
        }),
      };

      const mockReviewRepo = {
        find: jest.fn(async () => []),
        save: jest.fn(async (batch: any[]) => {
          savedReviewBatches.push(...batch);
          return batch;
        }),
      };

      const mockDataSource: any = {
        query: jest.fn(),
        getRepository: jest.fn((entity: any) => {
          if (entity.name === 'User') return mockUserRepo;
          if (entity.name === 'Product') return mockProductRepo;
          if (entity.name === 'Order') return mockOrderRepo;
          if (entity.name === 'Payment') return mockPaymentRepo;
          if (entity.name === 'Review') return mockReviewRepo;
          return mockOrderRepo;
        }),
      };

      const res = await seedOrders(mockDataSource, {
        fresh: false,
        count: 30,
        months: 6,
      });

      expect(mockDataSource.query).not.toHaveBeenCalled();
      expect(res.ordersCreated).toBe(30);
      expect(res.totalOrdersInDatabase).toBe(32);
      expect(savedOrderBatches.length).toBe(30);

      const nowMs = Date.now();
      const sixMonthsMs = 185 * 24 * 60 * 60 * 1000;
      for (const ord of savedOrderBatches) {
        const diffMs = nowMs - ord.createdAt.getTime();
        expect(diffMs).toBeGreaterThanOrEqual(0);
        expect(diffMs).toBeLessThanOrEqual(sixMonthsMs);
      }
    });
  });
});
