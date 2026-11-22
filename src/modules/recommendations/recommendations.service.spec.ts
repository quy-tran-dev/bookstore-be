jest.mock('uuid', () => ({
  v7: () => '019a0000-0000-7000-8000-000000000099',
}));

jest.mock('@nestjs/cache-manager', () => ({
  CACHE_MANAGER: 'CACHE_MANAGER',
}));

jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { NotFoundException } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { Product } from '../products/entities/product.entity';
import { Order } from '../orders/entities/order.entity';
import { AiService } from '../ai/ai.service';

describe('RecommendationsService - Kiểm thử Hệ thống AI Gợi ý sách tương đồng & Cá nhân hóa', () => {
  let service: RecommendationsService;

  const memoryCache = new Map<string, any>();

  const mockCacheManager = {
    get: jest.fn(async (key: string) => memoryCache.get(key)),
    set: jest.fn(async (key: string, val: any) => {
      memoryCache.set(key, val);
    }),
    del: jest.fn(async (key: string) => {
      memoryCache.delete(key);
    }),
  };

  // Tạo vector mẫu 384 chiều
  const createDummyVector = (seedValue: number): number[] =>
    Array.from({ length: 384 }, (_, idx) =>
      Number((Math.sin(seedValue + idx) * 0.1).toFixed(6)),
    );

  const mockQueryBuilder: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
    getRawMany: jest.fn(),
  };

  const mockProductRepository = {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    find: jest.fn(),
  };

  const mockOrderRepository = {
    find: jest.fn(),
  };

  const mockAiService = {
    generateEmbedding: jest.fn(),
    computeCosineSimilarity: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    memoryCache.clear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        {
          provide: getRepositoryToken(Product),
          useValue: mockProductRepository,
        },
        {
          provide: getRepositoryToken(Order),
          useValue: mockOrderRepository,
        },
        {
          provide: AiService,
          useValue: mockAiService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    service = module.get<RecommendationsService>(RecommendationsService);
  });

  it('computeCentroidVector phải tính đúng Vector trọng tâm và chuẩn hóa L2 về Vector đơn vị (Unit Vector)', () => {
    const v1 = [1, 0, 0];
    const v2 = [0, 1, 0];
    const centroid = service.computeCentroidVector([v1, v2]);

    expect(centroid).toHaveLength(3);
    // Trung bình là [0.5, 0.5, 0], chuẩn hóa L2: 0.5 / sqrt(0.5) = 0.707107
    expect(centroid[0]).toBeCloseTo(0.707107, 4);
    expect(centroid[1]).toBeCloseTo(0.707107, 4);
    expect(centroid[2]).toBe(0);

    // Độ dài chuẩn L2 của vector trọng tâm phải xấp xỉ 1.0
    const norm = Math.sqrt(
      centroid.reduce((sum, val) => sum + val * val, 0),
    );
    expect(norm).toBeCloseTo(1.0, 4);
  });

  it('getSimilarBooks phải ném lỗi NotFoundException nếu cuốn sách gốc không tồn tại', async () => {
    mockQueryBuilder.getRawOne.mockResolvedValueOnce(null);

    await expect(
      service.getSimilarBooks('sach-khong-ton-tai', 6, 0.6),
    ).rejects.toThrow(NotFoundException);
  });

  it('getSimilarBooks phải trả về danh sách sách tương đồng thuần ngữ nghĩa AI (SEMANTIC_SIMILARITY) kèm điểm similarityScore và lưu Cache', async () => {
    const vec384 = createDummyVector(1);
    mockQueryBuilder.getRawOne.mockResolvedValueOnce({
      id: 'book-source-1',
      name: 'Clean Code - Mã Sạch',
      slug: 'clean-code-ma-sach',
      short_describe: 'Sách kỹ nghệ phần mềm',
      seo_keywords: 'clean code, lập trình',
      embedding_text: JSON.stringify(vec384),
    });

    mockQueryBuilder.getRawMany.mockResolvedValueOnce([
      { id: 'book-sim-1', similarity_score: '0.8842' },
      { id: 'book-sim-2', similarity_score: '0.7615' },
    ]);

    mockProductRepository.find.mockResolvedValueOnce([
      {
        id: 'book-sim-1',
        name: 'The Pragmatic Programmer',
        slug: 'the-pragmatic-programmer',
        price: 220000,
        finalPrice: 195000,
        shortDescribe: 'Lập trình viên thực dụng',
        stockQuantity: 15,
        soldCount: 40,
        categories: [{ name: 'Kỹ thuật phần mềm' }],
        authors: [{ name: 'Andrew Hunt' }],
      },
      {
        id: 'book-sim-2',
        name: 'Refactoring - Tái Cấu Trúc Mã Nguồn',
        slug: 'refactoring-tai-cau-truc-ma-nguon',
        price: 250000,
        finalPrice: 210000,
        shortDescribe: 'Cải thiện thiết kế mã nguồn hiện có',
        stockQuantity: 8,
        soldCount: 25,
        categories: [{ name: 'Kiến trúc hệ thống' }],
        authors: [{ name: 'Martin Fowler' }],
      },
    ]);

    const res = await service.getSimilarBooks('clean-code-ma-sach', 6, 0.6);

    expect(res.strategy).toBe('SEMANTIC_SIMILARITY');
    expect(res.sourceBook.slug).toBe('clean-code-ma-sach');
    expect(res.totalRecommended).toBe(2);
    expect(res.items[0].name).toBe('The Pragmatic Programmer');
    expect(res.items[0].similarityScore).toBe(0.8842);
    expect(res.items[0].recommendationReason).toContain('88%');
    expect(res.items[1].similarityScore).toBe(0.7615);

    // Gọi lần 2 phải lấy trực tiếp từ Redis Cache mà không truy vấn lại DB
    const cachedRes = await service.getSimilarBooks('clean-code-ma-sach', 6, 0.6);
    expect(cachedRes.totalRecommended).toBe(2);
    expect(mockQueryBuilder.getRawOne).toHaveBeenCalledTimes(1);
  });

  it('getPersonalizedRecommendations phải áp dụng chiến lược COLD_START cho khách vãng lai chưa đăng nhập', async () => {
    mockQueryBuilder.getRawMany.mockResolvedValueOnce([{ id: 'book-hot-1' }]);
    mockProductRepository.find.mockResolvedValueOnce([
      {
        id: 'book-hot-1',
        name: 'Nhà Giả Kim',
        slug: 'nha-gia-kim',
        price: 100000,
        finalPrice: 85000,
        stockQuantity: 50,
        soldCount: 320,
        categories: [{ name: 'Tiểu thuyết' }],
        authors: [{ name: 'Paulo Coelho' }],
      },
    ]);

    const res = await service.getPersonalizedRecommendations(undefined, 4, 0.6);

    expect(res.strategy).toBe('COLD_START');
    expect(res.basedOnBookCount).toBe(0);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe('Nhà Giả Kim');
    expect(res.items[0].similarityScore).toBeNull();
  });

  it('getPersonalizedRecommendations phải tính Vector trọng tâm USER_CENTROID từ lịch sử mua sách của khách đã đăng nhập', async () => {
    mockOrderRepository.find.mockResolvedValueOnce([
      {
        id: 'order-1',
        items: [
          { product: { id: 'purchased-book-1' } },
          { product: { id: 'purchased-book-2' } },
        ],
      },
    ]);

    // Lần gọi getRawMany thứ 1: fetchProductVectorsByIds trả về 2 vector 384 chiều của 2 sách đã mua
    mockQueryBuilder.getRawMany.mockResolvedValueOnce([
      {
        id: 'purchased-book-1',
        embedding_text: JSON.stringify(createDummyVector(2)),
      },
      {
        id: 'purchased-book-2',
        embedding_text: JSON.stringify(createDummyVector(3)),
      },
    ]);

    // Lần gọi getRawMany thứ 2: findBooksByTargetVector trả về sách gợi ý tương đồng với Centroid Vector
    mockQueryBuilder.getRawMany.mockResolvedValueOnce([
      { id: 'recommended-book-99', similarity_score: '0.8410' },
    ]);

    mockProductRepository.find.mockResolvedValueOnce([
      {
        id: 'recommended-book-99',
        name: 'Thiết Kế Hệ Thống Lớn',
        slug: 'thiet-ke-he-thong-lon',
        price: 290000,
        finalPrice: 245000,
        stockQuantity: 12,
        soldCount: 64,
        categories: [{ name: 'Công nghệ' }],
        authors: [{ name: 'Alex Xu' }],
      },
    ]);

    const res = await service.getPersonalizedRecommendations(
      'user-uuid-123',
      6,
      0.6,
    );

    expect(res.strategy).toBe('USER_CENTROID');
    expect(res.basedOnBookCount).toBe(2);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].id).toBe('recommended-book-99');
    expect(res.items[0].similarityScore).toBe(0.841);
    expect(res.items[0].recommendationReason).toContain('84%');
  });

  it('getCartComplementaryBooks phải tính CART_CENTROID từ các sách trong giỏ và gợi ý sách mua kèm phù hợp', async () => {
    mockQueryBuilder.getRawMany
      .mockResolvedValueOnce([
        {
          id: 'cart-book-1',
          embedding_text: JSON.stringify(createDummyVector(5)),
        },
      ])
      .mockResolvedValueOnce([
        { id: 'comp-book-1', similarity_score: '0.7950' },
      ]);

    mockProductRepository.find.mockResolvedValueOnce([
      {
        id: 'comp-book-1',
        name: 'Tư Duy Nhanh Và Chậm',
        slug: 'tu-duy-nhanh-va-cham',
        price: 210000,
        finalPrice: 175000,
        stockQuantity: 20,
        soldCount: 110,
        categories: [{ name: 'Tâm lý học' }],
        authors: [{ name: 'Daniel Kahneman' }],
      },
    ]);

    const res = await service.getCartComplementaryBooks(['cart-book-1'], 4, 0.6);

    expect(res.strategy).toBe('CART_CENTROID');
    expect(res.basedOnBookCount).toBe(1);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe('Tư Duy Nhanh Và Chậm');
    expect(res.items[0].similarityScore).toBe(0.795);
  });
});
