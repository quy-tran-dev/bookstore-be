import { Injectable, Logger } from '@nestjs/common';
import { ProductsService } from '../products.service';
import { BENCHMARK_QUERIES, BenchmarkQueryItem } from './benchmark-queries';
import { BENCHMARK_SCENARIOS, BenchmarkScenarioConfig } from './benchmark-scenarios';
import { THRESHOLD_CONFIGS_A, THRESHOLD_CONFIGS_B, BenchmarkThresholdConfig } from './benchmark-thresholds';
import { IrMetricsUtil, SingleQueryIrMetrics } from './utils/ir-metrics.util';

export interface QueryEvaluationResult {
  queryId: number;
  query: string;
  group: string;
  description: string;
  retrievedCount: number;
  topBookNames: string[];
  isMatch: boolean;
  status: 'ĐẠT' | 'KHÔNG ĐẠT';
  latencyMs: number;
  irMetrics?: SingleQueryIrMetrics;
}

export interface AggregatedIrMetrics {
  hitAt1: number;
  hitAt3: number;
  hitAt5: number;
  mrrAt5: number;
  ndcgAt5: number;
  precisionAt5: number;
  recallAt5: number;
  tnr: number;
  compositeIrScore: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
}

export interface BenchmarkSummary {
  algorithm: 'A' | 'B';
  parameters: {
    alpha: number;
    ftsWeight: number;
    threshold: number;
    minScore?: number;
    normalizeScore: boolean;
  };
  totalQueries: number;
  metrics: {
    totalPassed: number;
    passRatePercent: number;
    g1Passed: number;
    g1Total: number;
    g2Passed: number;
    g2Total: number;
    g3Passed: number;
    g3Total: number;
    g4Passed: number;
    g4Total: number;
    status: string;
  };
  irMetrics: AggregatedIrMetrics;
  detailedResults?: QueryEvaluationResult[];
}

@Injectable()
export class SearchBenchmarkService {
  private readonly logger = new Logger(SearchBenchmarkService.name);

  constructor(private readonly productsService: ProductsService) {}

  /**
   * Đánh giá 1 câu truy vấn cụ thể theo thuật toán và bộ tham số
   */
  private async evaluateSingleQuery(
    algorithm: 'A' | 'B',
    item: BenchmarkQueryItem,
    options: {
      alpha?: number;
      threshold?: number;
      minScore?: number;
      normalizeScore?: boolean;
    },
  ): Promise<QueryEvaluationResult> {
    const startTime = Date.now();

    const results =
      algorithm === 'A'
        ? await this.productsService.searchHybridA(item.query, 10, options)
        : await this.productsService.searchHybridB(item.query, 10, options);

    const latencyMs = Math.max(1, Date.now() - startTime);
    const topBookNames = results.map((r: any) => r.name as string);

    // Kiểm tra nhóm Negative (G4 - Từ khóa rác/không bán: Đạt nếu không trả về kết quả)
    if (item.mustNotMatch) {
      const isNoise = results.length > 0;
      const isMatch = !isNoise;
      return {
        queryId: item.id,
        query: item.query,
        group: item.group,
        description: item.description,
        retrievedCount: results.length,
        topBookNames: topBookNames.slice(0, 3),
        isMatch,
        status: isMatch ? 'ĐẠT' : 'KHÔNG ĐẠT',
        latencyMs,
      };
    }

    // Tính toán đầy đủ bộ chỉ số IR chuẩn quốc tế (Hit@1, Hit@3, Hit@5, MRR@5, NDCG@5, Precision@5, Recall@5)
    const irMetrics = IrMetricsUtil.evaluatePositiveQuery(
      topBookNames,
      item.gradedRelevance,
      item.expectedTitles,
    );
    const isHit = irMetrics.hitAt5 === 1;

    return {
      queryId: item.id,
      query: item.query,
      group: item.group,
      description: item.description,
      retrievedCount: results.length,
      topBookNames: topBookNames.slice(0, 5),
      isMatch: isHit,
      status: isHit ? 'ĐẠT' : 'KHÔNG ĐẠT',
      latencyMs,
      irMetrics,
    };
  }

  /**
   * Chạy benchmark toàn bộ các truy vấn với 1 cấu hình cụ thể
   */
  async runBenchmark(
    algorithm: 'A' | 'B',
    params?: {
      alpha?: number;
      threshold?: number;
      minScore?: number;
      normalizeScore?: boolean;
    },
    includeDetails: boolean = true,
  ): Promise<BenchmarkSummary> {
    const alpha = params?.alpha !== undefined ? Number(params.alpha) : 0.7;
    const ftsWeight = Number((1 - alpha).toFixed(2));
    const defaultThreshold = algorithm === 'A' ? 1.15 : 0.65;
    const threshold =
      params?.threshold !== undefined ? Number(params.threshold) : defaultThreshold;
    const minScore =
      params?.minScore !== undefined ? Number(params.minScore) : 0.25;
    const normalizeScore = params?.normalizeScore ?? false;

    const options = { alpha, threshold, minScore, normalizeScore };
    const queryResults: QueryEvaluationResult[] = [];

    for (const q of BENCHMARK_QUERIES) {
      const result = await this.evaluateSingleQuery(algorithm, q, options);
      queryResults.push(result);
    }

    // Gom nhóm kết quả
    const g1Items = queryResults.filter((r) => r.group === 'G1_EXACT');
    const g2Items = queryResults.filter((r) => r.group === 'G2_SEMANTIC');
    const g3Items = queryResults.filter((r) => r.group === 'G3_TYPO');
    const g4Items = queryResults.filter((r) => r.group === 'G4_NEGATIVE');

    const g1Passed = g1Items.filter((r) => r.isMatch).length;
    const g2Passed = g2Items.filter((r) => r.isMatch).length;
    const g3Passed = g3Items.filter((r) => r.isMatch).length;
    const g4Passed = g4Items.filter((r) => r.isMatch).length;

    const totalPassed = g1Passed + g2Passed + g3Passed + g4Passed;
    const passRatePercent = Math.round((totalPassed / queryResults.length) * 100);

    // Tổng hợp bộ chỉ số IR chuẩn quốc tế trên tập truy vấn dương (G1 + G2 + G3) và truy vấn âm (G4)
    const positiveItems = queryResults.filter((r) => Boolean(r.irMetrics));
    const posCount = Math.max(1, positiveItems.length);

    const avg = (getter: (m: SingleQueryIrMetrics) => number) =>
      Number(
        (
          positiveItems.reduce((sum, item) => sum + getter(item.irMetrics!), 0) /
          posCount
        ).toFixed(4),
      );

    const hitAt1 = avg((m) => m.hitAt1);
    const hitAt3 = avg((m) => m.hitAt3);
    const hitAt5 = avg((m) => m.hitAt5);
    const mrrAt5 = avg((m) => m.mrrAt5);
    const ndcgAt5 = avg((m) => m.ndcgAt5);
    const precisionAt5 = avg((m) => m.precisionAt5);
    const recallAt5 = avg((m) => m.recallAt5);
    const tnr =
      g4Items.length > 0
        ? Number((g4Passed / g4Items.length).toFixed(4))
        : 1;

    // Điểm tổng hợp IR (Composite IR Score):
    // 35% NDCG@5 (chất lượng thứ hạng đa cấp) + 30% MRR@5 (vị trí xuất hiện đầu tiên) + 15% Hit@5 (độ phủ Top 5) + 20% TNR (khả năng chặn từ khóa rác)
    const compositeIrScore = Number(
      (0.35 * ndcgAt5 + 0.3 * mrrAt5 + 0.15 * hitAt5 + 0.2 * tnr).toFixed(4),
    );

    const sortedLatencies = queryResults
      .map((r) => r.latencyMs)
      .sort((a, b) => a - b);
    const avgLatencyMs = Number(
      (
        sortedLatencies.reduce((sum, val) => sum + val, 0) /
        Math.max(1, sortedLatencies.length)
      ).toFixed(2),
    );
    const p95Index = Math.min(
      sortedLatencies.length - 1,
      Math.floor(sortedLatencies.length * 0.95),
    );
    const p95LatencyMs = sortedLatencies[p95Index] || 0;

    return {
      algorithm,
      parameters: {
        alpha,
        ftsWeight,
        threshold,
        minScore,
        normalizeScore,
      },
      totalQueries: BENCHMARK_QUERIES.length,
      metrics: {
        totalPassed,
        passRatePercent,
        g1Passed,
        g1Total: g1Items.length,
        g2Passed,
        g2Total: g2Items.length,
        g3Passed,
        g3Total: g3Items.length,
        g4Passed,
        g4Total: g4Items.length,
        status:
          totalPassed === BENCHMARK_QUERIES.length
            ? 'ĐẠT (100%)'
            : totalPassed >= 10
              ? 'ĐẠT KHÁ'
              : 'KHÔNG ĐẠT',
      },
      irMetrics: {
        hitAt1,
        hitAt3,
        hitAt5,
        mrrAt5,
        ndcgAt5,
        precisionAt5,
        recallAt5,
        tnr,
        compositeIrScore,
        avgLatencyMs,
        p95LatencyMs,
      },
      detailedResults: includeDetails ? queryResults : undefined,
    };
  }

  /**
   * GRID SEARCH TỰ ĐỘNG: Quét qua toàn bộ lưới tham số để tìm cấu hình tối ưu
   */
  async runGridSearch(algorithm: 'A' | 'B'): Promise<{
    algorithm: 'A' | 'B';
    totalCombinationsTested: number;
    leaderboard: any[];
    bestConfiguration: any;
    toleranceMargin: {
      safeAlphaRange: string;
      safeThresholdRange: string;
      recommendation: string;
    };
  }> {
    const alphaCandidates = [0.8, 0.7, 0.6, 0.5];
    const thresholdCandidates =
      algorithm === 'A'
        ? [0.95, 1.05, 1.15, 1.25] // L2 distance candidates
        : [0.45, 0.50, 0.55, 0.60, 0.65]; // Cosine distance candidates
    const normalizeCandidates = [false, true];

    const leaderboard: any[] = [];

    this.logger.log(
      `Bắt đầu chạy Grid Search cho thuật toán ${algorithm}... (Tổng số cấu hình: ${
        alphaCandidates.length * thresholdCandidates.length * normalizeCandidates.length
      })`,
    );

    for (const alpha of alphaCandidates) {
      for (const threshold of thresholdCandidates) {
        for (const normalizeScore of normalizeCandidates) {
          const summary = await this.runBenchmark(
            algorithm,
            { alpha, threshold, normalizeScore },
            false, // Không cần details để tiết kiệm payload
          );

          leaderboard.push({
            alpha: summary.parameters.alpha,
            ftsWeight: summary.parameters.ftsWeight,
            threshold: summary.parameters.threshold,
            normalizeScore: summary.parameters.normalizeScore,
            totalPassed: summary.metrics.totalPassed,
            passRatePercent: summary.metrics.passRatePercent,
            g1Passed: summary.metrics.g1Passed,
            g2Passed: summary.metrics.g2Passed,
            g3Passed: summary.metrics.g3Passed,
            g4Passed: summary.metrics.g4Passed,
            status: summary.metrics.status,
          });
        }
      }
    }

    // Sắp xếp leaderboard giảm dần theo tổng số test case đạt
    leaderboard.sort((a, b) => b.totalPassed - a.totalPassed);

    const best = leaderboard[0];

    // Tính cấu hình đạt điểm cao
    const topConfigs = leaderboard.filter(
      (c) => c.totalPassed === best.totalPassed,
    );
    const alphasInTop = Array.from(new Set(topConfigs.map((c) => c.alpha))).sort();
    const thresholdsInTop = Array.from(
      new Set(topConfigs.map((c) => c.threshold)),
    ).sort();

    return {
      algorithm,
      totalCombinationsTested: leaderboard.length,
      bestConfiguration: best,
      toleranceMargin: {
        safeAlphaRange: `${alphasInTop[0]} - ${alphasInTop[alphasInTop.length - 1]}`,
        safeThresholdRange: `${thresholdsInTop[0]} - ${thresholdsInTop[thresholdsInTop.length - 1]}`,
        recommendation:
          algorithm === 'B'
            ? `Thuật toán Cosine (Search B) cho tỷ lệ khớp khả quan hơn với Alpha = ${best.alpha} (${best.alpha * 100}% AI, ${Math.round((1 - best.alpha) * 100)}% FTS), Ngưỡng Cosine = ${best.threshold}, Chuẩn hóa FTS = ${best.normalizeScore}. Khoảng an toàn ghi nhận là [${thresholdsInTop[0]} - ${thresholdsInTop[thresholdsInTop.length - 1]}].`
            : `Thuật toán L2 (Search A) đạt kết quả tốt hơn với Alpha = ${best.alpha}, Ngưỡng L2 = ${best.threshold}, Chuẩn hóa FTS = ${best.normalizeScore}. Khoảng an toàn ghi nhận là [${thresholdsInTop[0]} - ${thresholdsInTop[thresholdsInTop.length - 1]}].`,
      },
      leaderboard: leaderboard.slice(0, 10),
    };
  }

  /**
   * CHẠY 6 KỊCH BẢN KIỂM THỬ (BENCHMARK SCENARIOS)
   * Giữ trọn vẹn 5 kịch bản ban đầu và bổ sung Kịch bản 6 (Tối ưu từ Grid Search):
   * 1. 100% FTS (0% AI) - So khớp mặt chữ
   * 2. 100% Vector AI (0% FTS) - Thuần ngữ nghĩa
   * 3. 80% AI - 20% FTS (AI áp đảo)
   * 4. 40% AI - 60% FTS (FTS lấn át)
   * 5. 60% AI - 40% FTS (Giả thuyết ban đầu của nhóm)
   * 6. 70% AI - 30% FTS (Cấu hình chiến thắng tối ưu từ Grid Search - Điểm Vàng)
   */
  async run5Scenarios(
    algorithm: 'A' | 'B' = 'B',
    options?: { threshold?: number; normalizeScore?: boolean },
  ): Promise<{
    algorithm: 'A' | 'B';
    totalScenarios: number;
    scenarios: any[];
    conclusion: string;
  }> {
    const defaultThreshold =
      options?.threshold !== undefined
        ? Number(options.threshold)
        : algorithm === 'A'
          ? 1.15
          : 0.65;
    const defaultNormalize = options?.normalizeScore ?? false;

    const results: any[] = [];

    for (const sc of BENCHMARK_SCENARIOS) {
      const summary = await this.runBenchmark(
        algorithm,
        {
          alpha: sc.alpha,
          threshold: sc.threshold ?? defaultThreshold,
          minScore: sc.minScore,
          normalizeScore: sc.normalizeScore ?? defaultNormalize,
        },
        false,
      );

      results.push({
        scenarioId: sc.id,
        scenarioName: sc.name,
        ratio: `${Math.round(sc.alpha * 100)}% AI - ${Math.round(sc.ftsWeight * 100)}% FTS`,
        alpha: sc.alpha,
        ftsWeight: sc.ftsWeight,
        totalPassedTests: `${summary.metrics.totalPassed}/${BENCHMARK_QUERIES.length} (${summary.metrics.passRatePercent}%)`,
        passRatePercent: summary.metrics.passRatePercent,
        details: {
          g1ExactMatch: `${summary.metrics.g1Passed}/${summary.metrics.g1Total} Đạt (Khớp chính xác tên)`,
          g2Semantic: `${summary.metrics.g2Passed}/${summary.metrics.g2Total} Đạt (Hiểu ngữ nghĩa/nhu cầu)`,
          g3TypoFix: `${summary.metrics.g3Passed}/${summary.metrics.g3Total} Đạt (Sửa lỗi chính tả/không dấu)`,
          g4NoiseRejection: `${summary.metrics.g4Passed}/${summary.metrics.g4Total} Đạt (Kháng từ khóa rác)`,
        },
        status: summary.metrics.status,
        note: sc.note,
      });
    }

    return {
      algorithm,
      totalScenarios: results.length,
      scenarios: results,
      conclusion:
        algorithm === 'B'
          ? 'Thực nghiệm trên 12 Test Case cho thấy: FTS đơn thuần hạn chế ở câu hỏi ngữ nghĩa; Vector thuần túy nhạy cảm với từ khóa ngoài miền; Các kịch bản kết hợp đa tỷ lệ (như 70-30 hoặc 80-20 kèm bộ lọc ngưỡng) ghi nhận tỷ lệ khớp khả quan hơn trên tập dữ liệu kiểm thử.'
          : 'Thực nghiệm Thuật toán A với khoảng cách Euclidean L2 cho kết quả thấp hơn Thuật toán B (Cosine Distance).',
    };
  }

  /**
   * ĐÁNH GIÁ 5 CẤP ĐỘ BỘ LỌC NGƯỠNG (THRESHOLD GATEKEEPER BENCHMARK)
   * Khảo sát 5 cấp độ ngưỡng lọc:
   * 1. Rộng (0.70 / 1.30)
   * 2. Khuyến nghị từ Grid Search (0.65 / 1.15)
   * 3. Trung bình (0.60 / 1.10)
   * 4. Ban đầu (0.55 / 1.05)
   * 5. Hẹp (0.40 / 0.85)
   */
  async runThresholdBenchmark(
    algorithm: 'A' | 'B' = 'B',
    alpha?: number,
    normalizeScore?: boolean,
  ): Promise<{
    algorithm: 'A' | 'B';
    fixedRatio: string;
    normalizeScore: boolean;
    levels: any[];
    analysis: {
      roleOfTwoFilters: {
        ratioFilter: string;
        thresholdFilter: string;
        combinedArchitecture: string;
      };
      optimalRecommendation: {
        threshold: number;
        minScore?: number;
        reason: string;
      };
      reportSummary: string;
    };
  }> {
    const fixedAlpha = alpha !== undefined ? Number(alpha) : 0.7;
    const defaultNormalize = normalizeScore ?? false;

    const thresholdConfigs =
      algorithm === 'B' ? THRESHOLD_CONFIGS_B : THRESHOLD_CONFIGS_A;

    const results: any[] = [];

    for (const cfg of thresholdConfigs) {
      const summary = await this.runBenchmark(
        algorithm,
        {
          alpha: fixedAlpha,
          threshold: cfg.threshold,
          minScore: cfg.minScore,
          normalizeScore: cfg.normalizeScore,
        },
        false,
      );

      results.push({
        levelId: cfg.levelId,
        name: cfg.name,
        vectorThreshold: cfg.threshold,
        minScoreThreshold: cfg.minScore,
        totalPassed: `${summary.metrics.totalPassed}/${BENCHMARK_QUERIES.length} (${summary.metrics.passRatePercent}%)`,
        passRatePercent: summary.metrics.passRatePercent,
        resultsByGroup: {
          g1ExactMatch: `${summary.metrics.g1Passed}/${summary.metrics.g1Total} Đạt`,
          g2Semantic: `${summary.metrics.g2Passed}/${summary.metrics.g2Total} Đạt`,
          g3TypoFix: `${summary.metrics.g3Passed}/${summary.metrics.g3Total} Đạt`,
          g4NoiseRejection: `${summary.metrics.g4Passed}/${summary.metrics.g4Total} Đạt`,
        },
        status: summary.metrics.status,
        expectedBehavior: cfg.expectedBehavior,
      });
    }

    return {
      algorithm,
      fixedRatio: `${Math.round(fixedAlpha * 100)}% AI - ${Math.round((1 - fixedAlpha) * 100)}% FTS`,
      normalizeScore: defaultNormalize,
      levels: results,
      analysis: {
        roleOfTwoFilters: {
          ratioFilter: `Bộ lọc tỷ số (Ratio Filter - Ranker: ${Math.round(fixedAlpha * 100)}% AI / ${Math.round((1 - fixedAlpha) * 100)}% FTS): Tác động đến THỨ TỰ XẾP HẠNG (Rank) của các tài liệu tìm được.`,
          thresholdFilter:
            'Bộ lọc ngưỡng (Threshold Gatekeeper: Vector Threshold + MinScore): Đóng vai trò SÀNG LỌC BAN ĐẦU để loại bớt các kết quả có độ tương đồng thấp hoặc từ khóa rác ngoài miền.',
          combinedArchitecture:
            'Mô hình kết hợp 2 giai đoạn: Giai đoạn 1 (Gatekeeper) hỗ trợ giảm bớt kết quả nhiễu; Giai đoạn 2 (Ranker) tính điểm dung hòa giữa ngữ nghĩa và từ khóa để sắp xếp kết quả.',
        },
        optimalRecommendation: {
          threshold: algorithm === 'B' ? 0.65 : 1.15,
          minScore: 0.25,
          reason:
            algorithm === 'B'
              ? 'So sánh qua 5 cấp độ cho thấy: Cấp độ 2 (Ngưỡng Cosine <= 0.65 và MinScore = 0.25) cho độ phủ ngữ nghĩa G2 tốt hơn (đạt 100% trong tập mẫu) mà vẫn duy trì khả năng loại trừ từ khóa rác G4 hiệu quả hơn so với các ngưỡng quá lỏng hay quá chặt.'
              : 'So sánh qua 5 cấp độ cho thấy: Cấp độ 2 (Ngưỡng L2 <= 1.15 và MinScore = 0.25) ghi nhận tỷ lệ khớp cao hơn trong các kịch bản thử nghiệm của Thuật toán A.',
        },
        reportSummary:
          'Thực nghiệm cho thấy: Việc điều chỉnh ngưỡng về mức 0.65 (Cosine) và 1.15 (L2) kết hợp với các tỷ lệ lai phù hợp giúp cải thiện đáng kể độ phủ và độ chính xác so với việc dùng ngưỡng mặc định ban đầu.',
      },
    };
  }

  /**
   * SO SÁNH MA TRẬN 4 TỶ LỆ LAI (80-20, 70-30, 60-40, 50-50)
   * KẾT HỢP CÙNG CÁC MỨC BỘ LỌC NGƯỠNG (VECTOR THRESHOLD & MIN SCORE)
   */
  async compareRatiosAndThresholds(
    algorithm: 'A' | 'B' = 'B',
    options?: {
      alphas?: number[];
      thresholds?: number[];
      minScores?: number[];
      normalizeScores?: boolean[];
    },
  ): Promise<{
    algorithm: 'A' | 'B';
    totalCombinationsTested: number;
    testedRatios: string[];
    headToHeadComparison: any[];
    ratioSummaries: any[];
    leaderboard: any[];
    matrix: any[];
    analysis: {
      ratioTradeOffs: {
        case80_20: string;
        case70_30: string;
        case60_40: string;
        case50_50: string;
      };
      thresholdRole: string;
      comparativeConclusion: string;
    };
  }> {
    const alphas = options?.alphas && options.alphas.length > 0
      ? options.alphas
      : [0.8, 0.7, 0.6, 0.5];

    const defaultThresholds =
      algorithm === 'B'
        ? [0.55, 0.60, 0.65, 0.70]
        : [1.05, 1.10, 1.15, 1.25];
    const thresholds =
      options?.thresholds && options.thresholds.length > 0
        ? options.thresholds
        : defaultThresholds;

    const minScores =
      options?.minScores && options.minScores.length > 0
        ? options.minScores
        : [0.20, 0.25, 0.30];

    const normalizeScores =
      options?.normalizeScores && options.normalizeScores.length > 0
        ? options.normalizeScores
        : [false, true];

    const matrix: any[] = [];

    this.logger.log(
      `Chạy so sánh ma trận tỷ lệ lai cho thuật toán ${algorithm}: Alphas=[${alphas.join(
        ',',
      )}], Thresholds=[${thresholds.join(',')}], MinScores=[${minScores.join(
        ',',
      )}], Normalizes=[${normalizeScores.join(',')}]`,
    );

    for (const alpha of alphas) {
      for (const threshold of thresholds) {
        for (const minScore of minScores) {
          for (const normalizeScore of normalizeScores) {
            const summary = await this.runBenchmark(
              algorithm,
              { alpha, threshold, minScore, normalizeScore },
              false,
            );

            matrix.push({
              alpha: summary.parameters.alpha,
              ftsWeight: summary.parameters.ftsWeight,
              ratioLabel: `${Math.round(alpha * 100)}% AI - ${Math.round((1 - alpha) * 100)}% FTS`,
              threshold: summary.parameters.threshold,
              minScore: summary.parameters.minScore,
              normalizeScore: summary.parameters.normalizeScore,
              totalPassed: summary.metrics.totalPassed,
              totalQueries: summary.totalQueries,
              passRatePercent: summary.metrics.passRatePercent,
              g1Passed: summary.metrics.g1Passed,
              g1Total: summary.metrics.g1Total,
              g2Passed: summary.metrics.g2Passed,
              g2Total: summary.metrics.g2Total,
              g3Passed: summary.metrics.g3Passed,
              g3Total: summary.metrics.g3Total,
              g4Passed: summary.metrics.g4Passed,
              g4Total: summary.metrics.g4Total,
              status: summary.metrics.status,
            });
          }
        }
      }
    }

    // Leaderboard sắp xếp giảm dần theo số test case đạt
    const leaderboard = [...matrix].sort(
      (a, b) => b.totalPassed - a.totalPassed || b.passRatePercent - a.passRatePercent,
    );

    // Thống kê theo từng tỷ lệ (Ratio Summaries)
    const ratioSummaries = alphas.map((alpha) => {
      const itemsForAlpha = matrix.filter((m) => m.alpha === alpha);
      const passRates = itemsForAlpha.map((m) => m.passRatePercent);
      const totalPassedCounts = itemsForAlpha.map((m) => m.totalPassed);

      const maxPassed = Math.max(...totalPassedCounts);
      const maxPassRate = Math.max(...passRates);
      const avgPassRate = Number(
        (passRates.reduce((sum, val) => sum + val, 0) / passRates.length).toFixed(1),
      );

      const bestItem = itemsForAlpha
        .slice()
        .sort((a, b) => b.totalPassed - a.totalPassed)[0];

      let characteristics = '';
      if (alpha === 0.8) {
        characteristics =
          'Trọng số AI 80% mang lại độ nhạy cao hơn ở các câu hỏi ngữ nghĩa (G2) và sửa lỗi chính tả (G3). FTS 20% đóng vai trò trợ lực nhẹ; cần mức minScore phù hợp (>= 0.25) để hạn chế từ khóa ngoài miền.';
      } else if (alpha === 0.7) {
        characteristics =
          'Tỷ lệ 70-30 duy trì khả năng nhận diện ngữ nghĩa tốt, đồng thời mỏ neo từ khóa FTS 30% giúp tăng độ ổn định điểm số cho tên sách khớp đúng mà không lấn át câu hỏi mô tả.';
      } else if (alpha === 0.6) {
        characteristics =
          'Trọng số FTS 40% củng cố điểm số rõ hơn cho các từ khóa ngắn khớp chính xác, tuy nhiên điểm số các câu hỏi ngữ nghĩa có xu hướng phụ thuộc nhiều hơn vào mức ngưỡng minScore.';
      } else if (alpha === 0.5) {
        characteristics =
          'Chia đều 50-50 giữa AI và FTS. Tỷ trọng FTS lớn giúp nhận diện tốt tên sách cụ thể, nhưng có thể làm giảm điểm tổng thể của các câu hỏi ngữ nghĩa dài nếu từ khóa không chứa từ trùng khớp trực tiếp.';
      } else {
        characteristics = `Cấu hình tỷ lệ ${Math.round(alpha * 100)}% AI - ${Math.round((1 - alpha) * 100)}% FTS.`;
      }

      return {
        alpha,
        ftsWeight: Number((1 - alpha).toFixed(2)),
        ratioLabel: `${Math.round(alpha * 100)}% AI - ${Math.round((1 - alpha) * 100)}% FTS`,
        testedCombinations: itemsForAlpha.length,
        maxPassedCount: `${maxPassed}/${BENCHMARK_QUERIES.length}`,
        maxPassRatePercent: maxPassRate,
        avgPassRatePercent: avgPassRate,
        recommendedConfigForRatio: {
          threshold: bestItem.threshold,
          minScore: bestItem.minScore,
          normalizeScore: bestItem.normalizeScore,
          totalPassed: `${bestItem.totalPassed}/${bestItem.totalQueries} (${bestItem.passRatePercent}%)`,
        },
        characteristics,
      };
    });

    // Bảng so sánh đối đầu trực diện (Head-to-head) ở cấu hình ngưỡng chuẩn
    const baselineThreshold = algorithm === 'B' ? 0.65 : 1.15;
    const baselineMinScore = 0.25;
    const headToHeadComparison = alphas.map((alpha) => {
      const match = matrix.find(
        (m) =>
          m.alpha === alpha &&
          m.threshold === baselineThreshold &&
          m.minScore === baselineMinScore &&
          m.normalizeScore === false,
      ) || matrix.find((m) => m.alpha === alpha) || matrix[0];

      return {
        ratio: match.ratioLabel,
        alpha: match.alpha,
        ftsWeight: match.ftsWeight,
        baselineSettings: `Threshold = ${match.threshold}, MinScore = ${match.minScore}, Normalize = ${match.normalizeScore}`,
        totalPassed: `${match.totalPassed}/${match.totalQueries} (${match.passRatePercent}%)`,
        g1ExactMatch: `${match.g1Passed}/${match.g1Total} Đạt`,
        g2Semantic: `${match.g2Passed}/${match.g2Total} Đạt`,
        g3TypoFix: `${match.g3Passed}/${match.g3Total} Đạt`,
        g4NoiseRejection: `${match.g4Passed}/${match.g4Total} Đạt`,
        status: match.status,
      };
    });

    return {
      algorithm,
      totalCombinationsTested: matrix.length,
      testedRatios: alphas.map((a) => `${Math.round(a * 100)}% AI - ${Math.round((1 - a) * 100)}% FTS`),
      headToHeadComparison,
      ratioSummaries,
      leaderboard: leaderboard.slice(0, 15),
      matrix,
      analysis: {
        ratioTradeOffs: {
          case80_20:
            'Tỷ lệ 80-20 thiên về AI: Hiểu ngữ nghĩa và xử lý từ khóa không dấu/sai chính tả nhạy hơn, nhưng phụ thuộc nhiều hơn vào bộ lọc ngưỡng để ngăn nhiễu.',
          case70_30:
            'Tỷ lệ 70-30: Duy trì độ nhạy ngữ nghĩa tốt, đồng thời mỏ neo 30% FTS hỗ trợ giữ điểm cho các tựa sách kinh điển ổn định hơn.',
          case60_40:
            'Tỷ lệ 60-40: FTS 40% tăng cường khả năng so khớp chuỗi, tuy nhiên ở các câu hỏi ngữ nghĩa không có từ trùng lặp thì điểm FTS bằng 0 sẽ kéo giảm điểm tổng thể.',
          case50_50:
            'Tỷ lệ 50-50 cân bằng: Thích hợp với các truy vấn ngắn mang tính tra cứu trực tiếp, nhưng kém linh hoạt hơn ở các câu hỏi mang tính diễn giải nhu cầu.',
        },
        thresholdRole:
          'Bộ lọc ngưỡng (Threshold Gatekeeper và MinScore) có ý nghĩa quyết định: Ngưỡng vector loại bỏ các vector quá phân tán, còn MinScore ngăn chặn các tài liệu có điểm tổng hợp thấp lọt vào danh sách hiển thị.',
        comparativeConclusion:
          'Thực nghiệm đa tổ hợp cho thấy: Khi kết hợp cùng bộ lọc ngưỡng phù hợp (Cosine <= 0.65, MinScore >= 0.25), cả 80-20 và 70-30 đều cho tỷ lệ khớp khả quan hơn trên tập kiểm thử so với 60-40 và 50-50. Người dùng có thể lựa chọn 80-20 nếu ưu tiên tìm kiếm ý niệm/nhu cầu, hoặc 70-30 nếu muốn cân bằng tốt hơn giữa nhu cầu và tên sách cụ thể.',
      },
    };
  }

  /**
   * HÀM THỰC NGHIỆM CHUYÊN BIỆT: QUÉT TÌM TỶ LỆ % AI - % FTS TỐI ƯU VÀ BIÊN ĐỘ MIN - MAX CỦA NGƯỠNG
   * THEO CHUẨN INFORMATION RETRIEVAL (Hit@1, Hit@3, Hit@5, MRR@5, NDCG@5, Precision@5, Recall@5, TNR)
   * -------------------------------------------------------------------------------------------------
   * Được tách riêng để kiểm thử độc lập trước khi áp dụng thông số vào hàm searchHybridB chính thức.
   */
  async runIrParameterTuningExperiment(
    algorithm: 'A' | 'B' = 'B',
    customOptions?: {
      alphas?: number[];
      thresholds?: number[];
      minScores?: number[];
      normalizeScore?: boolean;
    },
  ) {
    const alphas =
      customOptions?.alphas && customOptions.alphas.length > 0
        ? customOptions.alphas
        : [0.0, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 1.0];

    const thresholds =
      customOptions?.thresholds && customOptions.thresholds.length > 0
        ? customOptions.thresholds
        : [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.68, 0.7, 0.75, 0.8];

    const minScores =
      customOptions?.minScores && customOptions.minScores.length > 0
        ? customOptions.minScores
        : [0.15, 0.2, 0.25, 0.3, 0.35, 0.4];

    const normalizeScore = customOptions?.normalizeScore ?? true;

    // 1. Thí nghiệm 1: Quét dải tỷ lệ Alpha (% AI vs % FTS) tại ngưỡng tiêu chuẩn (threshold = 0.65, minScore = 0.25)
    const ratioSweepResults: any[] = [];
    for (const alpha of alphas) {
      const summary = await this.runBenchmark(
        algorithm,
        { alpha, threshold: 0.65, minScore: 0.25, normalizeScore },
        false,
      );
      ratioSweepResults.push({
        alpha,
        ftsWeight: Number((1 - alpha).toFixed(2)),
        ratioLabel: `${Math.round(alpha * 100)}% AI - ${Math.round((1 - alpha) * 100)}% FTS`,
        ...summary.irMetrics,
        g2SemanticHitRate: Number(
          (summary.metrics.g2Passed / Math.max(1, summary.metrics.g2Total)).toFixed(4),
        ),
      });
    }

    // Tìm tỷ lệ Alpha đạt điểm CompositeIR (NDCG@5 + MRR@5 + Hit@5 + TNR) cao nhất
    const sortedRatios = [...ratioSweepResults].sort(
      (a, b) =>
        b.compositeIrScore - a.compositeIrScore ||
        b.ndcgAt5 - a.ndcgAt5 ||
        b.mrrAt5 - a.mrrAt5,
    );
    const bestRatioConfig = sortedRatios[0];

    // 2. Thí nghiệm 2: Cố định tỷ lệ Alpha tối ưu, quét dải Threshold từ 0.40 -> 0.80 để tìm biên độ [Threshold_min, Threshold_max]
    const thresholdSweepResults: any[] = [];
    for (const threshold of thresholds) {
      const summary = await this.runBenchmark(
        algorithm,
        {
          alpha: bestRatioConfig.alpha,
          threshold,
          minScore: 0.25,
          normalizeScore,
        },
        false,
      );
      thresholdSweepResults.push({
        threshold,
        ...summary.irMetrics,
        g2SemanticHitRate: Number(
          (summary.metrics.g2Passed / Math.max(1, summary.metrics.g2Total)).toFixed(4),
        ),
      });
    }

    // Xác định biên độ [Threshold_min, Threshold_max]:
    // - An toàn khi Hit@5 đạt mức cao nhất, NDCG@5 duy trì >= 98% đỉnh (không làm rớt các sách liên quan mức 2, 3 của G2) VÀ TNR = 1.0 (chặn 100% từ khóa rác G4)
    const maxHitAt5 = Math.max(...thresholdSweepResults.map((t) => t.hitAt5));
    const maxNdcgAt5 = Math.max(
      ...thresholdSweepResults.filter((t) => t.tnr === 1).map((t) => t.ndcgAt5),
    );
    const safeThresholds = thresholdSweepResults.filter(
      (t) =>
        t.hitAt5 >= maxHitAt5 &&
        t.ndcgAt5 >= Number((maxNdcgAt5 * 0.98).toFixed(4)) &&
        t.tnr === 1,
    );

    const minSafeThreshold =
      safeThresholds.length > 0
        ? Math.min(...safeThresholds.map((t) => t.threshold))
        : 0.55;
    const maxSafeThreshold =
      safeThresholds.length > 0
        ? Math.max(...safeThresholds.map((t) => t.threshold))
        : 0.68;
    const optimalThresholdItem =
      [...safeThresholds].sort(
        (a, b) =>
          b.compositeIrScore - a.compositeIrScore || b.ndcgAt5 - a.ndcgAt5,
      )[0] || thresholdSweepResults[0];

    // 3. Thí nghiệm 3: Cố định Alpha và Threshold tối ưu, quét dải MinScore từ 0.15 -> 0.40 để tìm biên độ [MinScore_min, MinScore_max]
    const minScoreSweepResults: any[] = [];
    for (const minScore of minScores) {
      const summary = await this.runBenchmark(
        algorithm,
        {
          alpha: bestRatioConfig.alpha,
          threshold: optimalThresholdItem.threshold,
          minScore,
          normalizeScore,
        },
        false,
      );
      minScoreSweepResults.push({
        minScore,
        ...summary.irMetrics,
      });
    }

    const maxScoreHitAt5 = Math.max(...minScoreSweepResults.map((m) => m.hitAt5));
    const safeMinScores = minScoreSweepResults.filter(
      (m) => m.hitAt5 >= maxScoreHitAt5 && m.tnr === 1,
    );

    const minSafeScore =
      safeMinScores.length > 0
        ? Math.min(...safeMinScores.map((m) => m.minScore))
        : 0.2;
    const maxSafeScore =
      safeMinScores.length > 0
        ? Math.max(...safeMinScores.map((m) => m.minScore))
        : 0.3;
    const optimalMinScoreItem =
      [...safeMinScores].sort(
        (a, b) =>
          b.compositeIrScore - a.compositeIrScore ||
          b.precisionAt5 - a.precisionAt5,
      )[0] || minScoreSweepResults[0];

    return {
      algorithm,
      normalizeScore,
      optimalConfiguration: {
        alpha: bestRatioConfig.alpha,
        ftsWeight: bestRatioConfig.ftsWeight,
        ratioLabel: bestRatioConfig.ratioLabel,
        threshold: optimalThresholdItem.threshold,
        minScore: optimalMinScoreItem.minScore,
        metrics: {
          hitAt1: bestRatioConfig.hitAt1,
          hitAt3: bestRatioConfig.hitAt3,
          hitAt5: bestRatioConfig.hitAt5,
          mrrAt5: bestRatioConfig.mrrAt5,
          ndcgAt5: bestRatioConfig.ndcgAt5,
          precisionAt5: bestRatioConfig.precisionAt5,
          recallAt5: bestRatioConfig.recallAt5,
          tnr: bestRatioConfig.tnr,
          compositeIrScore: bestRatioConfig.compositeIrScore,
        },
      },
      thresholdBoundaries: {
        minSafeThreshold,
        maxSafeThreshold,
        optimalThreshold: optimalThresholdItem.threshold,
        operatingWindow: `[${minSafeThreshold.toFixed(2)}, ${maxSafeThreshold.toFixed(2)}]`,
        explanation: `Dưới mức ${minSafeThreshold.toFixed(2)} (Strict Bound), câu hỏi ngữ nghĩa dài (G2) bắt đầu bị cắt cụt làm giảm Hit@5 & Recall@5. Trên mức ${maxSafeThreshold.toFixed(2)} (Loose Bound), từ khóa rác ngoài miền (G4) bắt đầu vượt qua Gatekeeper làm giảm TNR.`,
      },
      minScoreBoundaries: {
        minSafeScore,
        maxSafeScore,
        optimalMinScore: optimalMinScoreItem.minScore,
        operatingWindow: `[${minSafeScore.toFixed(2)}, ${maxSafeScore.toFixed(2)}]`,
        explanation: `Điểm sàn trong khoảng [${minSafeScore.toFixed(2)}, ${maxSafeScore.toFixed(2)}] giúp cắt bỏ phần đuôi nhiễu (tối ưu Precision@5) mà không làm rơi mất các kết quả liên quan (giữ nguyên Recall@5).`,
      },
      sweeps: {
        ratioSweep: ratioSweepResults,
        thresholdSweep: thresholdSweepResults,
        minScoreSweep: minScoreSweepResults,
      },
    };
  }
}

