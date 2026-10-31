jest.mock('uuid', () => ({
  v7: () => '019a0000-0000-7000-8000-000000000001',
}));

jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { SeoAuditService } from './seo-audit.service';
import { SeoAudit } from './entities/seo-audit.entity';
import { Product } from '../products/entities/product.entity';
import { AiService } from '../ai/ai.service';

describe('SeoAuditService - Kiểm thử hệ thống chấm điểm SEO 6 tiêu chí (Thang 100 điểm)', () => {
  let service: SeoAuditService;

  const mockSeoAuditRepository = {
    create: jest.fn((dto) => ({ ...dto, createdAt: new Date() })),
    save: jest.fn(async (entity) => entity),
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockProductRepository = {
    findOne: jest.fn(),
  };

  const mockAiService = {
    generateEmbedding: jest.fn(async () => [0.5, 0.5, 0.5]),
    computeCosineSimilarity: jest.fn(() => 0.72),
    generateSeoAuditAdvice: jest.fn(async (weakPoints: string[]) =>
      weakPoints.map((w) => `[Gợi ý AI] ${w}`),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeoAuditService,
        {
          provide: getRepositoryToken(SeoAudit),
          useValue: mockSeoAuditRepository,
        },
        {
          provide: getRepositoryToken(Product),
          useValue: mockProductRepository,
        },
        {
          provide: AiService,
          useValue: mockAiService,
        },
      ],
    }).compile();

    service = module.get<SeoAuditService>(SeoAuditService);
  });

  it('phải đạt điểm EXCELLENT (100/100) khi bài viết đáp ứng tối ưu cả 6 tiêu chí SEO', async () => {
    // Tạo 3 đoạn văn cân đối (~100 từ mỗi đoạn, tổng ~300 từ) và xuất hiện từ khóa "Clean Code" 3 lần (~2.0% mật độ từ khóa)
    const buildParagraph = (stepStart: number) =>
      Array.from(
        { length: 4 },
        (_, idx) =>
          `Kiến trúc phần mềm hiện đại đòi hỏi quy trình kiểm thử tự động và thiết kế mô đun rõ ràng ở bước ${stepStart + idx}.`,
      ).join(' ');

    const result = await service.analyzeDraft({
      title: 'Clean Code - Nghệ Thuật Viết Mã Sạch Cho Kỹ Sư Phần Mềm Việt', // 60 ký tự (nằm trong 40 - 65)
      shortDescribe:
        'Cuốn sách Clean Code cung cấp quy tắc viết mã nguồn dễ đọc, dễ bảo trì và nâng cao tư duy thiết kế hệ thống phần mềm chuyên nghiệp cho lập trình viên.', // 151 ký tự (nằm trong 120 - 160)
      focusKeyword: 'Clean Code',
      albumImages: [
        {
          url: '/uploads/products/clean-code.jpg',
          altText: 'Bìa trước cuốn sách Clean Code bản tiếng Việt',
        },
      ],
      sections: [
        {
          id: 'h-1',
          type: 'heading',
          heading: { level: 2, text: 'Giới thiệu tổng quan về Clean Code' },
        },
        {
          id: 'p-1',
          type: 'paragraph',
          content: `Triết lý Clean Code giúp lập trình viên xây dựng thói quen đặt tên biến tường minh và tổ chức hàm ngắn gọn. ${buildParagraph(1)}`,
        },
        {
          id: 'h-2',
          type: 'heading',
          heading: { level: 3, text: 'Giá trị thực tiễn cho đội ngũ kỹ thuật' },
        },
        {
          id: 'p-2',
          type: 'paragraph',
          content: `Khi áp dụng Clean Code vào dự án thực tế, chi phí bảo trì giảm đáng kể. ${buildParagraph(5)}`,
        },
        {
          id: 'p-3',
          type: 'paragraph',
          content: `Đội ngũ phát triển phần mềm có thể chủ động mở rộng tính năng an toàn và bền vững. ${buildParagraph(9)}`,
        },
        {
          id: 'img-1',
          type: 'image',
          image: {
            url: '/uploads/products/clean-code-detail.jpg',
            altText: 'Mục lục chi tiết của sách Clean Code',
          },
        },
      ],
      includeAiAdvice: false,
    });

    expect(result.totalScore).toBe(100);
    expect(result.grade).toBe('EXCELLENT');
    expect(result.checklist.titleAndKeyword.score).toBe(20);
    expect(result.checklist.metaDescription.score).toBe(15);
    expect(result.checklist.sectionStructure.score).toBe(20);
    expect(result.checklist.keywordDistribution.score).toBe(15);
    expect(result.checklist.mediaOptimization.score).toBe(15);
    expect(result.checklist.semanticRelevance.score).toBe(15);
    expect(result.sectionFeedbacks).toHaveLength(0);
  });

  it('phải phát hiện lỗi thiếu altText theo đúng blockId, cảnh báo dùng nhiều H1 và nội dung quá ngắn (POOR)', async () => {
    mockAiService.computeCosineSimilarity.mockReturnValueOnce(0.3);

    const result = await service.analyzeDraft({
      title: 'Sách Mới', // Quá ngắn (< 25 ký tự) và không chứa focusKeyword
      shortDescribe: 'Mô tả quá ngắn.', // < 80 ký tự
      focusKeyword: 'Lập trình hướng đối tượng',
      albumImages: [],
      sections: [
        {
          id: 'h1-a',
          type: 'heading',
          heading: { level: 1, text: 'Tiêu đề H1 thứ nhất' },
        },
        {
          id: 'h1-b',
          type: 'heading',
          heading: { level: 1, text: 'Tiêu đề H1 thứ hai' },
        },
        {
          id: 'img-missing-alt',
          type: 'image',
          image: {
            url: '/uploads/products/oop.jpg',
            altText: '',
          },
        },
      ],
      includeAiAdvice: true,
    });

    expect(result.grade).toBe('POOR');
    expect(result.checklist.titleAndKeyword.status).toBe('FAILED');
    expect(result.checklist.metaDescription.status).toBe('FAILED');
    expect(result.checklist.semanticRelevance.score).toBe(0);

    // Phải gắn đúng cảnh báo thiếu altText vào blockId 'img-missing-alt'
    const imageFeedback = result.sectionFeedbacks.find(
      (f) => f.blockId === 'img-missing-alt',
    );
    expect(imageFeedback).toBeDefined();
    expect(imageFeedback?.field).toBe('image');

    // Phải cảnh báo việc lạm dụng nhiều thẻ H1 trong bài viết
    const h1Feedbacks = result.sectionFeedbacks.filter(
      (f) => f.blockId === 'h1-a' || f.blockId === 'h1-b',
    );
    expect(h1Feedbacks).toHaveLength(2);
    expect(mockAiService.generateSeoAuditAdvice).toHaveBeenCalled();
  });

  it('auditProductById phải chấm điểm sản phẩm và lưu bản ghi vào bảng seo_audits', async () => {
    mockProductRepository.findOne.mockResolvedValueOnce({
      id: 'prod-uuid-1',
      name: 'Thiết Kế Hệ Thống Phân Tán Hiện Đại Cho Kỹ Sư Backend',
      shortDescribe:
        'Hướng dẫn toàn diện về Thiết Kế Hệ Thống Phân Tán quy mô lớn, cân bằng tải, bộ nhớ đệm và cơ sở dữ liệu cho kỹ sư phần mềm chuyên nghiệp.',
      seoKeywords: 'Thiết Kế Hệ Thống Phân Tán, System Design, Backend',
      bookDetail: {
        version: 4,
        sections: [
          {
            id: 'sec-1',
            type: 'heading',
            heading: { level: 2, text: 'Tổng quan Thiết Kế Hệ Thống Phân Tán' },
          },
          {
            id: 'sec-2',
            type: 'paragraph',
            content: 'Nội dung giới thiệu về Thiết Kế Hệ Thống Phân Tán.',
          },
        ],
      },
      albums: [
        {
          media: {
            fileUrl: '/uploads/products/sys.jpg',
            altText: 'Bìa sách Thiết Kế Hệ Thống Phân Tán',
          },
        },
      ],
    });

    const audit = await service.auditProductById(
      'prod-uuid-1',
      { includeAiAdvice: false },
      'admin-uuid-1',
    );

    expect(audit.productId).toBe('prod-uuid-1');
    expect(audit.auditedVersion).toBe(4);
    expect(audit.focusKeyword).toBe('Thiết Kế Hệ Thống Phân Tán');
    expect(mockSeoAuditRepository.create).toHaveBeenCalled();
    expect(mockSeoAuditRepository.save).toHaveBeenCalled();
  });

  it('auditProductById phải ném NotFoundException nếu sản phẩm không tồn tại', async () => {
    mockProductRepository.findOne.mockResolvedValueOnce(null);

    await expect(service.auditProductById('non-existent-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});
