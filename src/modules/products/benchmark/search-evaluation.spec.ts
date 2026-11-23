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
import { BENCHMARK_QUERIES } from './benchmark-queries';

describe('IrMetricsUtil & SearchBenchmarkService - Đánh giá Chuẩn Quốc tế Information Retrieval & Đối sánh Khoảng cách Vector (Cosine vs L2 vs Dual-Adaptive vs Ensemble)', () => {
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
      expect(metrics.precisionAt5).toBe(0.6);
      expect(metrics.recallAt5).toBe(1.0);
      expect(metrics.firstRelevantRank).toBe(1);
    });

    it('phải giảm điểm MRR@5 và NDCG@5 tương ứng khi sách mục tiêu (rel=3) bị tụt xuống vị trí thứ 3', () => {
      const degradedRetrieved = [
        'Sách Nhiễu 1',
        'Sách Nhiễu 2',
        'Clean Code - Mã Sạch',
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
      expect(metrics.ndcgAt5).toBeCloseTo(0.3726, 3);
      expect(metrics.precisionAt5).toBe(0.2);
      expect(metrics.recallAt5).toBeCloseTo(0.3333, 3);
      expect(metrics.firstRelevantRank).toBe(3);
    });
  });

  // =========================================================================
  // PHẦN 2 & 3: QUÉT THỰC NGHIỆM TRÊN BỘ 24 TEST CASES & ĐỐI SÁNH COSINE VS L2 VS DUAL-ADAPTIVE
  // =========================================================================
  describe('2. Thực nghiệm dò tìm Tỷ lệ % AI - % FTS tối ưu, Biên độ Ngưỡng và Đối sánh Khoảng cách Vector trên 24 Test Cases', () => {
    /**
     * Bộ mô phỏng kho sách thực tế trên mặt cầu đơn vị MiniLM 384 chiều (||u|| = ||v|| = 1):
     * - Khoảng cách Cosine: D_Cosine = 1 - (u · v)
     * - Khoảng cách L2 (Euclidean): D_L2 = sqrt(2 * D_Cosine)
     * - Điểm tương đồng Cosine: S_Cosine = 1 - D_Cosine
     * - Điểm tương đồng L2 chuẩn hóa: S_L2 = 1 - (D_L2 / sqrt(2)) = 1 - sqrt(D_Cosine)
     */
    const simulatedCorpusPerQuery: Record<
      string,
      Array<{
        name: string;
        cosineDistance: number;
        rawTsRank: number;
        rawTsRankOr?: number;
      }>
    > = {
      // --- G1: EXACT MATCH (6 câu) ---
      'Clean Code': [
        // Cự ly rất gần (D_C = 0.09 vs 0.125): L2 có đạo hàm lớn giúp phân tách Clean Code - Mã Sạch vượt qua The Clean Coder dù The Clean Coder có FTS nhỉnh hơn
        { name: 'Clean Code - Mã Sạch', cosineDistance: 0.09, rawTsRank: 0.15 },
        { name: 'The Clean Coder', cosineDistance: 0.125, rawTsRank: 0.22 },
        {
          name: 'Refactoring - Cải Thiện Thiết Kế Mã Nguồn Hiện Có',
          cosineDistance: 0.46,
          rawTsRank: 0.05,
        },
        { name: 'Đắc Nhân Tâm', cosineDistance: 0.78, rawTsRank: 0.0 },
      ],
      'Đắc Nhân Tâm': [
        { name: 'Đắc Nhân Tâm', cosineDistance: 0.12, rawTsRank: 0.65 },
        {
          name: 'Quẳng Gánh Lo Đi Và Vui Sống',
          cosineDistance: 0.44,
          rawTsRank: 0.08,
        },
      ],
      'Nhà Giả Kim': [
        {
          name: 'Nhà Giả Kim (The Alchemist)',
          cosineDistance: 0.14,
          rawTsRank: 0.64,
        },
        { name: 'Hoàng Tử Bé', cosineDistance: 0.48, rawTsRank: 0.04 },
      ],
      'Harry Potter và Hòn Đá Phù Thủy': [
        {
          name: 'Harry Potter và Hòn Đá Phù Thủy',
          cosineDistance: 0.11,
          rawTsRank: 0.68,
        },
        {
          name: 'Harry Potter và Phòng Chứa Bí Mật',
          cosineDistance: 0.24,
          rawTsRank: 0.32,
        },
        {
          name: 'Harry Potter và Tên Tù Nhân Ngục Azkaban',
          cosineDistance: 0.28,
          rawTsRank: 0.28,
        },
      ],
      'Tâm Lý Học Về Tiền': [
        // Cự ly gần (D_C = 0.08 vs 0.12): Bản tiếng Việt sát nghĩa hơn bản tiếng Anh, L2 tách Top 1 chính xác
        {
          name: 'Tâm Lý Học Về Tiền (The Psychology of Money)',
          cosineDistance: 0.08,
          rawTsRank: 0.16,
        },
        {
          name: 'The Psychology of Money',
          cosineDistance: 0.12,
          rawTsRank: 0.24,
        },
        { name: 'Rich Dad Poor Dad', cosineDistance: 0.47, rawTsRank: 0.0 },
      ],
      'System Design Interview': [
        {
          name: "System Design Interview – An Insider's Guide (Volume 1)",
          cosineDistance: 0.13,
          rawTsRank: 0.62,
        },
        {
          name: "System Design Interview – An Insider's Guide (Volume 2)",
          cosineDistance: 0.15,
          rawTsRank: 0.6,
        },
        {
          name: 'Designing Data-Intensive Applications (DDIA)',
          cosineDistance: 0.38,
          rawTsRank: 0.08,
        },
      ],

      // --- G2: SEMANTIC / INTENT SEARCH (8 câu) ---
      'sách dạy viết mã nguồn sạch dễ bảo trì': [
        { name: 'Clean Code - Mã Sạch', cosineDistance: 0.42, rawTsRank: 0.04 },
        {
          name: 'Refactoring - Cải Thiện Thiết Kế Mã Nguồn Hiện Có',
          cosineDistance: 0.46,
          rawTsRank: 0.02,
        },
        {
          name: 'Code Complete (Tập 2)',
          cosineDistance: 0.51,
          rawTsRank: 0.0,
        },
        { name: 'The Clean Coder', cosineDistance: 0.55, rawTsRank: 0.0 },
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
          cosineDistance: 0.55,
          rawTsRank: 0.0,
        },
      ],
      'chiến lược khởi nghiệp kinh doanh ít rủi ro': [
        {
          name: 'Khởi Nghiệp Tinh Gọn (The Lean Startup)',
          cosineDistance: 0.44,
          rawTsRank: 0.03,
        },
        {
          name: 'Tạo Lập Mô Hình Kinh Doanh (Business Model Generation)',
          cosineDistance: 0.48,
          rawTsRank: 0.02,
        },
        {
          name: 'Chiến Lược Đại Dương Xanh',
          cosineDistance: 0.52,
          rawTsRank: 0.03,
        },
        { name: 'Từ Tốt Đến Vĩ Đại', cosineDistance: 0.56, rawTsRank: 0.0 },
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
      'sách hướng dẫn học trí tuệ nhân tạo và mạng nơ ron học sâu': [
        {
          name: 'Deep Learning (Trí Tuệ Nhân Tạo Chuyên Sâu)',
          cosineDistance: 0.41,
          rawTsRank: 0.05,
        },
        {
          name: 'Hands-On Machine Learning with Scikit-Learn, Keras, and TensorFlow',
          cosineDistance: 0.47,
          rawTsRank: 0.0,
        },
        {
          name: 'Học Machine Learning Từ Con Số',
          cosineDistance: 0.52,
          rawTsRank: 0.02,
        },
        { name: 'Deep Learning', cosineDistance: 0.55, rawTsRank: 0.0 },
      ],
      'làm sao để bớt lo âu căng thẳng và sống an nhiên ở hiện tại': [
        {
          name: 'Quẳng Gánh Lo Đi Và Vui Sống',
          cosineDistance: 0.43,
          rawTsRank: 0.02,
        },
        {
          name: 'Sức Mạnh Của Hiện Tại (The Power of Now)',
          cosineDistance: 0.46,
          rawTsRank: 0.03,
        },
        {
          name: 'Chủ Nghĩa Khắc Kỷ (Stoicism)',
          cosineDistance: 0.52,
          rawTsRank: 0.0,
        },
        {
          name: 'Tìm Lại Chính Mình (Search Inside Yourself)',
          cosineDistance: 0.55,
          rawTsRank: 0.0,
        },
      ],
      'kiến trúc phân rã hệ thống phần mềm lớn thành các dịch vụ nhỏ độc lập': [
        {
          name: 'Building Microservices',
          cosineDistance: 0.42,
          rawTsRank: 0.0,
        },
        {
          name: 'Monolith to Microservices',
          cosineDistance: 0.45,
          rawTsRank: 0.0,
        },
        {
          name: 'Clean Architecture',
          cosineDistance: 0.51,
          rawTsRank: 0.03,
        },
        {
          name: 'Domain-Driven Design (DDD): Tác Động Vào Lõi Phần Mềm',
          cosineDistance: 0.55,
          rawTsRank: 0.02,
        },
      ],
      'nghệ thuật đàm phán thuyết phục khách hàng và tâm lý bán hàng': [
        {
          name: 'Những Đòn Tâm Lý Trong Thuyết Phục (Influence)',
          cosineDistance: 0.42,
          rawTsRank: 0.04,
        },
        {
          name: 'Bí Quyết Giao Tiếp Thuyết Phục',
          cosineDistance: 0.45,
          rawTsRank: 0.04,
        },
        {
          name: 'Never Split the Difference',
          cosineDistance: 0.51,
          rawTsRank: 0.0,
        },
        {
          name: 'Nghệ Thuật Bán Hàng Cho Người Giàu',
          cosineDistance: 0.54,
          rawTsRank: 0.04,
        },
      ],

      // --- G3: TYPO / KHÔNG DẤU (6 câu) ---
      'clean code ma sach': [
        { name: 'Clean Code - Mã Sạch', cosineDistance: 0.24, rawTsRank: 0.15 },
        { name: 'The Clean Coder', cosineDistance: 0.35, rawTsRank: 0.18 },
      ],
      'dac nhan tam dale carnegie': [
        { name: 'Đắc Nhân Tâm', cosineDistance: 0.26, rawTsRank: 0.14 },
      ],
      'nha gia kim paulo coelho': [
        {
          name: 'Nhà Giả Kim (The Alchemist)',
          cosineDistance: 0.25,
          rawTsRank: 0.15,
        },
      ],
      'tu duy nhanh va cham daniel kahneman': [
        {
          name: 'Tư Duy Nhanh Và Chậm (Thinking, Fast and Slow)',
          cosineDistance: 0.27,
          rawTsRank: 0.12,
        },
        {
          name: 'Thinking, Fast and Slow',
          cosineDistance: 0.34,
          rawTsRank: 0.08,
        },
      ],
      'sherlock holmes tham tu pha an': [
        {
          name: 'Sherlock Holmes: Toàn Tập (Tập 1)',
          cosineDistance: 0.24,
          rawTsRank: 0.16,
        },
        {
          name: 'Sherlock Holmes: Toàn Tập (Tập 2)',
          cosineDistance: 0.29,
          rawTsRank: 0.15,
        },
      ],
      'lap trinh python cho nguoi moi bat dau': [
        {
          name: 'Lập Trình Python Cho Người Mới Bắt Đầu',
          cosineDistance: 0.25,
          rawTsRank: 0.14,
        },
        {
          name: 'Python Crash Course',
          cosineDistance: 0.36,
          rawTsRank: 0.12,
        },
      ],

      // --- G4: NEGATIVE / OUT-OF-DOMAIN (4 câu) ---
      'mua bán xe máy honda wave alpha cũ giá rẻ': [
        {
          name: 'Khởi Nghiệp Tinh Gọn (The Lean Startup)',
          cosineDistance: 0.71,
          rawTsRank: 0.0,
        },
      ],
      'vé máy bay khứ hồi hà nội đà nẵng sài gòn': [
        {
          name: 'Nhà Giả Kim (The Alchemist)',
          cosineDistance: 0.72,
          rawTsRank: 0.0,
        },
      ],
      'máy giặt cửa ngang samsung inverter tiết kiệm điện': [
        {
          name: 'Tối Ưu Hóa Hiệu Suất Web',
          cosineDistance: 0.73,
          rawTsRank: 0.0,
        },
      ],
      'đặt phòng khách sạn resort view biển nha trang phú quốc': [
        {
          name: 'Sống Đẹp Mỗi Ngày',
          cosineDistance: 0.74,
          rawTsRank: 0.0,
        },
      ],
    };

    const countMeaningfulWords = (q: string): number => {
      const stopWords = new Set(['sách', 'về', 'cho', 'của', 'và', 'là', 'có', 'những', 'các', 'cách', 'làm', 'sao', 'để', 'ở', 'thành']);
      const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const meaningful = words.filter((w) => !stopWords.has(w));
      return (meaningful.length > 0 ? meaningful : words).length;
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
            distanceMetric?: 'COSINE' | 'L2' | 'ADAPTIVE';
          },
        ) => {
          const alpha = options?.alpha ?? 0.7;
          const ftsWeight = Number((1 - alpha).toFixed(2));
          const cosineThreshold = options?.threshold ?? 0.65;
          const l2Threshold = Number(Math.sqrt(2 * cosineThreshold).toFixed(4));
          const minScore = options?.minScore ?? 0.25;
          const normalizeScore = options?.normalizeScore ?? true;

          const isShortQuery = countMeaningfulWords(query) <= 3;
          const requestedMetric = options?.distanceMetric ?? 'ADAPTIVE';
          const resolvedMetric: 'COSINE' | 'L2' =
            requestedMetric === 'ADAPTIVE'
              ? isShortQuery
                ? 'L2'
                : 'COSINE'
              : requestedMetric;

          const candidates = simulatedCorpusPerQuery[query] || [];

          // Bước 1: Gatekeeper Filter
          const gatekept = candidates.filter((c) => {
            const l2Distance = Math.sqrt(2 * c.cosineDistance);
            const ftsMatched = c.rawTsRank > 0;
            const vectorMatched =
              resolvedMetric === 'L2'
                ? l2Distance < l2Threshold
                : c.cosineDistance < cosineThreshold;

            if (alpha === 0) return ftsMatched;
            if (alpha === 1) return vectorMatched;
            return vectorMatched || ftsMatched;
          });

          // Bước 2: Ranker Scoring theo chế độ khoảng cách (COSINE vs L2 vs ADAPTIVE)
          const scored = gatekept
            .map((c) => {
              const cosineSim = Math.max(0, 1 - c.cosineDistance);
              const l2Distance = Math.sqrt(2 * c.cosineDistance);
              const l2Sim = Math.max(0, 1 - l2Distance / Math.SQRT2);

              const aiScore = resolvedMetric === 'L2' ? l2Sim : cosineSim;

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

    it('phải bao phủ đầy đủ 24 Test Cases chuẩn hóa trải đều trên 4 nhóm (G1: 6, G2: 8, G3: 6, G4: 4)', () => {
      expect(BENCHMARK_QUERIES.length).toBe(24);
      expect(
        BENCHMARK_QUERIES.filter((q) => q.group === 'G1_EXACT').length,
      ).toBe(6);
      expect(
        BENCHMARK_QUERIES.filter((q) => q.group === 'G2_SEMANTIC').length,
      ).toBe(8);
      expect(
        BENCHMARK_QUERIES.filter((q) => q.group === 'G3_TYPO').length,
      ).toBe(6);
      expect(
        BENCHMARK_QUERIES.filter((q) => q.group === 'G4_NEGATIVE').length,
      ).toBe(4);
    });

    it('phải quét thực nghiệm đa chiều trên 24 Test Cases và tìm ra Tỷ lệ tối ưu (70% AI - 30% FTS) cùng Biên độ Ngưỡng [0.55 - 0.70] và MinScore [0.20 - 0.30]', async () => {
      const tuningReport =
        await benchmarkService.runIrParameterTuningExperiment('B', {
          alphas: [0.0, 0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 1.0],
          thresholds: [0.4, 0.5, 0.55, 0.6, 0.65, 0.68, 0.7, 0.75, 0.8],
          minScores: [0.15, 0.2, 0.25, 0.3, 0.35, 0.4],
          normalizeScore: true,
        });

      expect(tuningReport.optimalConfiguration.metrics.hitAt5).toBe(1.0);
      expect(tuningReport.optimalConfiguration.metrics.mrrAt5).toBe(1.0);
      expect(tuningReport.optimalConfiguration.metrics.tnr).toBe(1.0);
      expect(tuningReport.optimalConfiguration.metrics.ndcgAt5).toBeGreaterThan(
        0.95,
      );

      expect(
        tuningReport.thresholdBoundaries.minSafeThreshold,
      ).toBeGreaterThanOrEqual(0.5);
      expect(
        tuningReport.thresholdBoundaries.maxSafeThreshold,
      ).toBeLessThanOrEqual(0.7);

      const strictThreshold40 = tuningReport.sweeps.thresholdSweep.find(
        (t) => t.threshold === 0.4,
      );
      expect(strictThreshold40.recallAt5).toBeLessThan(
        tuningReport.optimalConfiguration.metrics.recallAt5,
      );

      const looseThreshold75 = tuningReport.sweeps.thresholdSweep.find(
        (t) => t.threshold === 0.75,
      );
      expect(looseThreshold75.tnr).toBe(0);
    });

    it('phải đối sánh trực tiếp 3 giải thuật khoảng cách (COSINE vs L2 vs ADAPTIVE) và chứng minh cơ chế Thích ứng Kép (ADAPTIVE) đạt hiệu quả tối ưu nhất', async () => {
      const comparison =
        await benchmarkService.runDistanceMetricComparisonExperiment({
          alpha: 0.7,
          threshold: 0.65,
          minScore: 0.25,
          normalizeScore: true,
        });

      expect(comparison.totalTestCases).toBe(24);
      expect(comparison.modeComparisons.length).toBe(3);

      const cosineMode = comparison.modeComparisons.find(
        (m: any) => m.distanceMetric === 'COSINE',
      );
      const l2Mode = comparison.modeComparisons.find(
        (m: any) => m.distanceMetric === 'L2',
      );
      const adaptiveMode = comparison.modeComparisons.find(
        (m: any) => m.distanceMetric === 'ADAPTIVE',
      );

      // 1. Ở nhóm G1_EXACT (truy vấn ngắn đích danh): L2 và ADAPTIVE có độ sắc bén cự ly gần cao hơn nên NDCG@5 trên G1 vượt trội so với thuần Cosine
      expect(l2Mode.groupBreakdown.g1Exact.ndcgAt5).toBeGreaterThan(
        cosineMode.groupBreakdown.g1Exact.ndcgAt5,
      );
      expect(adaptiveMode.groupBreakdown.g1Exact.ndcgAt5).toBe(1.0);

      // 2. Ở nhóm G2_SEMANTIC (truy vấn ngữ nghĩa dài): Cosine và ADAPTIVE bảo toàn trọn vẹn Recall@5 so với thuần L2 (do L2 nén điểm vùng trung bình dưới minScore)
      expect(cosineMode.groupBreakdown.g2Semantic.recallAt5).toBeGreaterThan(
        l2Mode.groupBreakdown.g2Semantic.recallAt5,
      );
      expect(adaptiveMode.groupBreakdown.g2Semantic.recallAt5).toBe(
        cosineMode.groupBreakdown.g2Semantic.recallAt5,
      );

      // 3. Cơ chế Thích ứng Kép (ADAPTIVE) hội tụ cả 2 ưu điểm: vượt cả thuần Cosine và thuần L2 về điểm tổng hợp Composite IR Score & NDCG@5
      expect(
        adaptiveMode.overallIrMetrics.compositeIrScore,
      ).toBeGreaterThan(cosineMode.overallIrMetrics.compositeIrScore);
      expect(
        adaptiveMode.overallIrMetrics.compositeIrScore,
      ).toBeGreaterThan(l2Mode.overallIrMetrics.compositeIrScore);
      expect(adaptiveMode.overallIrMetrics.ndcgAt5).toBeGreaterThan(
        cosineMode.overallIrMetrics.ndcgAt5,
      );
      expect(adaptiveMode.overallIrMetrics.ndcgAt5).toBeGreaterThan(
        l2Mode.overallIrMetrics.ndcgAt5,
      );
      expect(comparison.winningStrategy.distanceMetric).toBe('ADAPTIVE');
    });
  });
});
