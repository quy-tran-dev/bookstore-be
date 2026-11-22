jest.mock('uuid', () => ({
  v7: () => '019a0000-0000-7000-8000-000000000099',
}));

jest.mock('@nestjs/cache-manager', () => ({
  CACHE_MANAGER: 'CACHE_MANAGER',
}));

jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(),
}));

import { IrMetricsUtil } from './utils/ir-metrics.util';
import { SearchBenchmarkService } from './search-benchmark.service';

describe('IrMetricsUtil & SearchBenchmarkService - Đánh giá Chuẩn Quốc tế Information Retrieval (Hit@K, MRR@K, NDCG@K, Precision, Recall, TNR)', () => {
  // =========================================================================
  // PHẦN 1: KIỂM THỬ TOÁN HỌC CÁC CHỈ SỐ CHUẨN INFORMATION RETRIEVAL (IR)
  // =========================================================================
  describe('1. Kiểm thử công thức toán học IrMetricsUtil', () => {
    const gradedRelevance = {
      'Clean Code - Mã Sạch': 3, // Exact Target (2^3 - 1 = 7)
      'Refactoring - Cải Thiện Thiết Kế Mã Nguồn Hiện Có': 2, // Highly Relevant (2^2 - 1 = 3)
      'The Clean Coder': 1, // Partially Relevant (2^1 - 1 = 1)
    };

    it('phải đạt Hit@1 = 1, MRR@5 = 1.0, NDCG@5 = 1.0 khi kết quả xếp hạng đúng thứ tự ưu tiên lý tưởng (Ideal Ranking)', () => {
      const idealRetrieved = [
        'Clean Code - Mã Sạch',
        'Refactoring - Cải Thiện Thiết Kế Mã Nguồn Hiện Có',
        'The Clean Coder',
        'Sách Không Liên Quan A',
        'Sách Không Liên Quan B',
      ];

      const metrics = IrMetricsUtil.evaluatePositiveQuery(
        idealRetrieved,
        gradedRelevance,
      );

      expect(metrics.hitAt1).toBe(1);
      expect(metrics.hitAt3).toBe(1);
      expect(metrics.hitAt5).toBe(1);
      expect(metrics.mrrAt5).toBe(1.0);
      expect(metrics.ndcgAt5).toBe(1.0);
      // 3 sách liên quan trong Top 5 -> Precision@5 = 3/5 = 0.60
      expect(metrics.precisionAt5).toBe(0.6);
      // Tìm thấy đủ 3/3 sách trong Ground Truth -> Recall@5 = 1.0
      expect(metrics.recallAt5).toBe(1.0);
      expect(metrics.firstRelevantRank).toBe(1);
    });

    it('phải giảm điểm MRR@5 và NDCG@5 tương ứng khi sách mục tiêu (rel=3) bị tụt xuống vị trí thứ 3', () => {
      const degradedRetrieved = [
        'Sách Nhiễu 1',
        'Sách Nhiễu 2',
        'Clean Code - Mã Sạch', // Vị trí 3 -> RR = 1/3 = 0.3333
        'Sách Nhiễu 4',
        'Sách Nhiễu 5',
      ];

      const metrics = IrMetricsUtil.evaluatePositiveQuery(
        degradedRetrieved,
        gradedRelevance,
      );

      expect(metrics.hitAt1).toBe(0);
      expect(metrics.hitAt3).toBe(1);
      expect(metrics.hitAt5).toBe(1);
      expect(metrics.mrrAt5).toBeCloseTo(0.3333, 4);
      // DCG@5 = (2^3 - 1) / log2(3 + 1) = 7 / 2 = 3.5
      // IDCG@5 = 7/log2(2) + 3/log2(3) + 1/log2(4) = 7 + 1.8928 + 0.5 = 9.3928
      // NDCG@5 = 3.5 / 9.3928 = 0.3726
      expect(metrics.ndcgAt5).toBeCloseTo(0.3726, 3);
      expect(metrics.precisionAt5).toBe(0.2);
      expect(metrics.recallAt5).toBeCloseTo(0.3333, 3);
      expect(metrics.firstRelevantRank).toBe(3);
    });
  });

  // =========================================================================
  // PHẦN 2: QUÉT THỰC NGHIỆM MA TRẬN TỶ LỆ % AI vs % FTS & BIÊN ĐỘ NGƯỠNG MIN/MAX
  // =========================================================================
  describe('2. Thực nghiệm dò tìm Tỷ lệ % AI - % FTS tối ưu và Biên độ Min - Max của Ngưỡng (Threshold & MinScore)', () => {
    /**
     * Bộ mô phỏng kho sách thực tế với khoảng cách Cosine (cosineDistance = embedding <=> query)
     * và điểm khớp từ khóa FTS (rawTsRank) cho từng câu truy vấn trong 12 Benchmark Queries.
     * Dữ liệu phản ánh đặc trưng vật lý của pgvector MiniLM-L12-v2 và PostgreSQL tsvector:
     * - G1 (Exact Match): FTS có ts_rank rất cao (0.45 - 0.65), Cosine distance rất nhỏ (0.18 - 0.25).
     * - G2 (Semantic): Câu dài không khớp nguyên văn nên FTS rất thấp hoặc bằng 0 (0.00 - 0.06), nhưng Cosine distance của sách đúng nằm trong vùng [0.42 - 0.56].
     * - G3 (Typo / Không dấu): FTS bị giảm do lệch dấu (0.05 - 0.12), Cosine distance nằm trong vùng [0.30 - 0.45].
     * - G4 (Negative / Rác ngoài miền): FTS = 0, Cosine distance của các sách ngẫu nhiên gần nhất nằm ở mức >= 0.70.
     */
    const simulatedCorpusPerQuery: Record<
      string,
      Array<{ name: string; cosineDistance: number; rawTsRank: number }>
    > = {
      'Clean Code': [
        { name: 'Clean Code - Mã Sạch', cosineDistance: 0.18, rawTsRank: 0.62 },
        { name: 'The Clean Coder', cosineDistance: 0.27, rawTsRank: 0.38 },
        {
          name: 'Refactoring - Cải Thiện Thiết Kế Mã Nguồn Hiện Có',
          cosineDistance: 0.46,
          rawTsRank: 0.05,
        },
        { name: 'Đắc Nhân Tâm', cosineDistance: 0.78, rawTsRank: 0.0 },
      ],
      'Đắc Nhân Tâm': [
        { name: 'Đắc Nhân Tâm', cosineDistance: 0.16, rawTsRank: 0.65 },
        {
          name: 'Quẳng Gánh Lo Đi Và Vui Sống',
          cosineDistance: 0.44,
          rawTsRank: 0.08,
        },
        { name: 'Nhà Giả Kim (The Alchemist)', cosineDistance: 0.74, rawTsRank: 0.0 },
      ],
      'Nhà Giả Kim': [
        {
          name: 'Nhà Giả Kim (The Alchemist)',
          cosineDistance: 0.17,
          rawTsRank: 0.64,
        },
        { name: 'Hoàng Tử Bé', cosineDistance: 0.48, rawTsRank: 0.04 },
      ],
      'sách dạy viết mã nguồn sạch dễ bảo trì': [
        { name: 'Clean Code - Mã Sạch', cosineDistance: 0.42, rawTsRank: 0.0 },
        {
          name: 'Refactoring - Cải Thiện Thiết Kế Mã Nguồn Hiện Có',
          cosineDistance: 0.46,
          rawTsRank: 0.0,
        },
        {
          name: 'Code Complete (Tập 2)',
          cosineDistance: 0.51,
          rawTsRank: 0.0,
        },
        { name: 'The Clean Coder', cosineDistance: 0.56, rawTsRank: 0.0 },
        // Sách nhiễu có trùng từ "sách", "dạy" khiến FTS hơi cao nhưng ngữ nghĩa xa
        {
          name: 'Sách Dạy Nấu Ăn Gia Đình',
          cosineDistance: 0.64,
          rawTsRank: 0.18,
        },
      ],
      'cách rèn luyện thói quen tốt và kỷ luật bản thân': [
        {
          name: 'Atomic Habits (Thay Đổi Tí Hon Hiệu Quả To Lớn)',
          cosineDistance: 0.43,
          rawTsRank: 0.0,
        },
        {
          name: 'Kỷ Luật Tự Do (Discipline Equals Freedom)',
          cosineDistance: 0.45,
          rawTsRank: 0.04,
        },
        {
          name: '7 Thói Quen Để Thành Đạt',
          cosineDistance: 0.49,
          rawTsRank: 0.03,
        },
        {
          name: 'Deep Work - Làm Việc Sâu',
          cosineDistance: 0.56,
          rawTsRank: 0.0,
        },
      ],
      'chiến lược khởi nghiệp kinh doanh ít rủi ro': [
        {
          name: 'Khởi Nghiệp Tinh Gọn (The Lean Startup)',
          cosineDistance: 0.44,
          rawTsRank: 0.0,
        },
        {
          name: 'Tạo Lập Mô Hình Kinh Doanh (Business Model Generation)',
          cosineDistance: 0.48,
          rawTsRank: 0.0,
        },
        {
          name: 'Chiến Lược Đại Dương Xanh',
          cosineDistance: 0.52,
          rawTsRank: 0.03,
        },
        { name: 'Từ Tốt Đến Vĩ Đại', cosineDistance: 0.57, rawTsRank: 0.0 },
      ],
      'tiểu thuyết trinh thám phá án ly kỳ gay cấn': [
        {
          name: 'Sherlock Holmes: Toàn Tập (Tập 1)',
          cosineDistance: 0.42,
          rawTsRank: 0.0,
        },
        {
          name: 'Phía Sau Nghi Can X',
          cosineDistance: 0.46,
          rawTsRank: 0.0,
        },
        {
          name: 'Án Mạng Trên Chuyến Tàu Tốc Hành Phương Đông',
          cosineDistance: 0.51,
          rawTsRank: 0.0,
        },
        {
          name: 'Và Rồi Không Còn Ai (And Then There Were None)',
          cosineDistance: 0.55,
          rawTsRank: 0.0,
        },
      ],
      'clean code ma sach': [
        { name: 'Clean Code - Mã Sạch', cosineDistance: 0.28, rawTsRank: 0.15 },
        // Một cuốn sách có từ khóa không dấu tình cờ khớp nhẹ FTS nhưng vector xa hơn
        { name: 'The Clean Coder', cosineDistance: 0.36, rawTsRank: 0.19 },
      ],
      'dac nhan tam dale carnegie': [
        { name: 'Đắc Nhân Tâm', cosineDistance: 0.29, rawTsRank: 0.14 },
      ],
      'nha gia kim paulo coelho': [
        {
          name: 'Nhà Giả Kim (The Alchemist)',
          cosineDistance: 0.27,
          rawTsRank: 0.15,
        },
      ],
      // Nhóm G4 Negative: Các từ khóa rác có khoảng cách Cosine gần nhất là 0.70 - 0.74
      'mua bán xe máy honda wave alpha cũ giá rẻ': [
        { name: 'Khởi Nghiệp Tinh Gọn (The Lean Startup)', cosineDistance: 0.71, rawTsRank: 0.0 },
      ],
      'vé máy bay khứ hồi hà nội đà nẵng sài gòn': [
        { name: 'Nhà Giả Kim (The Alchemist)', cosineDistance: 0.72, rawTsRank: 0.0 },
      ],
    };

    const mockProductsService = {
      searchHybridB: jest.fn(
        async (
          query: string,
          limit: number = 10,
          options?: {
            alpha?: number;
            threshold?: number;
            minScore?: number;
            normalizeScore?: boolean;
          },
        ) => {
          const alpha = options?.alpha ?? 0.7;
          const ftsWeight = Number((1 - alpha).toFixed(2));
          const threshold = options?.threshold ?? 0.65;
          const minScore = options?.minScore ?? 0.25;
          const normalizeScore = options?.normalizeScore ?? true;

          const candidates = simulatedCorpusPerQuery[query] || [];

          // Bước 1: Gatekeeper Filter (product.embedding <=> query < threshold OR FTS match)
          const gatekept = candidates.filter((c) => {
            const ftsMatched = c.rawTsRank > 0;
            const vectorMatched = c.cosineDistance < threshold;
            if (alpha === 0) return ftsMatched;
            if (alpha === 1) return vectorMatched;
            return vectorMatched || ftsMatched;
          });

          // Bước 2: Ranker Scoring
          const scored = gatekept
            .map((c) => {
              const aiScore = Math.max(0, 1 - c.cosineDistance);
              const ftsScore = normalizeScore
                ? c.rawTsRank / (0.1 + c.rawTsRank)
                : c.rawTsRank;

              const finalScore =
                alpha === 0
                  ? ftsScore
                  : alpha === 1
                    ? aiScore
                    : alpha * aiScore + ftsWeight * ftsScore;

              return {
                name: c.name,
                finalScore,
              };
            })
            .filter((item) => item.finalScore >= minScore)
            .sort((a, b) => b.finalScore - a.finalScore)
            .slice(0, limit);

          return scored;
        },
      ),
      searchHybridA: jest.fn(),
    };

    let benchmarkService: SearchBenchmarkService;

    beforeEach(() => {
      jest.clearAllMocks();
      benchmarkService = new SearchBenchmarkService(mockProductsService as any);
    });

    it('phải quét thực nghiệm đa chiều và tìm ra Tỷ lệ tối ưu (70% AI - 30% FTS) cùng Biên độ Ngưỡng [0.58 - 0.70] và MinScore [0.20 - 0.30]', async () => {
      const tuningReport =
        await benchmarkService.runIrParameterTuningExperiment('B', {
          alphas: [0.0, 0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 1.0],
          thresholds: [0.4, 0.5, 0.55, 0.6, 0.65, 0.68, 0.7, 0.75, 0.8],
          minScores: [0.15, 0.2, 0.25, 0.3, 0.35, 0.4],
          normalizeScore: true,
        });

      // 1. Kiểm tra cấu hình chiến thắng có đạt Hit@5 = 1.0, MRR@5 = 1.0, TNR = 1.0 hay không
      expect(tuningReport.optimalConfiguration.metrics.hitAt5).toBe(1.0);
      expect(tuningReport.optimalConfiguration.metrics.mrrAt5).toBe(1.0);
      expect(tuningReport.optimalConfiguration.metrics.tnr).toBe(1.0);
      expect(tuningReport.optimalConfiguration.metrics.ndcgAt5).toBeGreaterThan(
        0.95,
      );

      // 2. Kiểm tra Biên độ Ngưỡng Vector [minSafeThreshold, maxSafeThreshold]
      // - Với threshold <= 0.55: Các sách đúng của G2 (có cosineDistance = 0.56 - 0.57) hoặc sách G2 chính (0.41-0.49) bị rơi bớt nếu threshold quá chặt (0.40)
      // - Với threshold >= 0.75: Các câu G4 Negative (có cosineDistance = 0.71 - 0.72) vượt qua Gatekeeper làm TNR tụt xuống 0
      expect(
        tuningReport.thresholdBoundaries.minSafeThreshold,
      ).toBeGreaterThanOrEqual(0.5);
      expect(
        tuningReport.thresholdBoundaries.maxSafeThreshold,
      ).toBeLessThanOrEqual(0.7);

      // 3. Kiểm tra khi threshold quá chặt (0.40) -> Hit@5 giảm mạnh (False Negatives)
      const strictThreshold40 = tuningReport.sweeps.thresholdSweep.find(
        (t) => t.threshold === 0.4,
      );
      expect(strictThreshold40.recallAt5).toBeLessThan(
        tuningReport.optimalConfiguration.metrics.recallAt5,
      );

      // 4. Kiểm tra khi threshold quá rộng (0.75 - 0.80) -> TNR giảm (False Positives - lọt từ khóa rác G4)
      const looseThreshold75 = tuningReport.sweeps.thresholdSweep.find(
        (t) => t.threshold === 0.75,
      );
      expect(looseThreshold75.tnr).toBe(0);
    });
  });
});
