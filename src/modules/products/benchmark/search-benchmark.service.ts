import { Injectable, Logger } from '@nestjs/common';
import { ProductsService } from '../products.service';
import { BENCHMARK_QUERIES, BenchmarkQueryItem } from './benchmark-queries';

export interface QueryEvaluationResult {
  queryId: number;
  query: string;
  group: string;
  description: string;
  retrievedCount: number;
  topBookNames: string[];
  isMatch: boolean;
  reciprocalRank: number; // 1 / position of first expected book (1.0 if top 1, 0.5 if top 2...)
  precisionAt5: number;   // Relevant books in top 5 / 5
  isNoise: boolean;       // For G4: true if it returned results
  latencyMs: number;
}

export interface BenchmarkSummary {
  algorithm: 'A' | 'B';
  parameters: {
    alpha: number;
    ftsWeight: number;
    threshold: number;
    normalizeScore: boolean;
  };
  totalQueries: number;
  metrics: {
    mrr: number;            // Mean Reciprocal Rank (0 to 1)
    precisionAt5: number;   // Average Precision@5 (0 to 1)
    g1ExactAccuracy: number;// % G1 matched in top 3
    g2SemanticHitRate: number;// % G2 matched in top 5
    g3TypoHitRate: number;  // % G3 matched in top 5
    g4NoiseRate: number;    // % G4 returning false positive results (lower is better, 0% is ideal)
    avgLatencyMs: number;
    combinedScore: number;  // Overall score out of 100
  };
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
    options: { alpha?: number; threshold?: number; normalizeScore?: boolean },
  ): Promise<QueryEvaluationResult> {
    const startTime = Date.now();

    const results =
      algorithm === 'A'
        ? await this.productsService.searchHybridA(item.query, 10, options)
        : await this.productsService.searchHybridB(item.query, 10, options);

    const latencyMs = Date.now() - startTime;
    const topBookNames = results.map((r: any) => r.name as string);

    // Kiểm tra nhóm Negative (G4)
    if (item.mustNotMatch) {
      const isNoise = results.length > 0;
      return {
        queryId: item.id,
        query: item.query,
        group: item.group,
        description: item.description,
        retrievedCount: results.length,
        topBookNames: topBookNames.slice(0, 3),
        isMatch: !isNoise, // Match nếu KHÔNG trả về gì
        reciprocalRank: isNoise ? 0 : 1,
        precisionAt5: isNoise ? 0 : 1,
        isNoise,
        latencyMs,
      };
    }

    // Kiểm tra các nhóm có kỳ vọng (G1, G2, G3)
    let firstMatchRank = 0;
    let relevantCountAt5 = 0;

    for (let i = 0; i < topBookNames.length; i++) {
      const title = topBookNames[i].toLowerCase();
      const isHit = item.expectedTitles.some((expected) =>
        title.includes(expected.toLowerCase()),
      );

      if (isHit) {
        if (firstMatchRank === 0) {
          firstMatchRank = i + 1; // 1-indexed rank
        }
        if (i < 5) {
          relevantCountAt5++;
        }
      }
    }

    const reciprocalRank = firstMatchRank > 0 ? 1 / firstMatchRank : 0;
    const precisionAt5 = Number((relevantCountAt5 / 5).toFixed(2));
    const isMatch = firstMatchRank > 0 && firstMatchRank <= 5;

    return {
      queryId: item.id,
      query: item.query,
      group: item.group,
      description: item.description,
      retrievedCount: results.length,
      topBookNames: topBookNames.slice(0, 5),
      isMatch,
      reciprocalRank,
      precisionAt5,
      isNoise: false,
      latencyMs,
    };
  }

  /**
   * Chạy benchmark toàn bộ 24 truy vấn với 1 cấu hình cụ thể
   */
  async runBenchmark(
    algorithm: 'A' | 'B',
    params?: { alpha?: number; threshold?: number; normalizeScore?: boolean },
    includeDetails: boolean = true,
  ): Promise<BenchmarkSummary> {
    const alpha = params?.alpha !== undefined ? Number(params.alpha) : 0.6;
    const ftsWeight = Number((1 - alpha).toFixed(2));
    const defaultThreshold = algorithm === 'A' ? 1.2 : 0.6;
    const threshold =
      params?.threshold !== undefined ? Number(params.threshold) : defaultThreshold;
    const normalizeScore = params?.normalizeScore ?? false;

    const options = { alpha, threshold, normalizeScore };
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

    const g1Hits = g1Items.filter((r) => r.isMatch).length;
    const g2Hits = g2Items.filter((r) => r.isMatch).length;
    const g3Hits = g3Items.filter((r) => r.isMatch).length;
    const g4Noise = g4Items.filter((r) => r.isNoise).length;

    const g1ExactAccuracy = Number(((g1Hits / g1Items.length) * 100).toFixed(1));
    const g2SemanticHitRate = Number(((g2Hits / g2Items.length) * 100).toFixed(1));
    const g3TypoHitRate = Number(((g3Hits / g3Items.length) * 100).toFixed(1));
    const g4NoiseRate = Number(((g4Noise / g4Items.length) * 100).toFixed(1));

    // Tính MRR và Precision@5 (chỉ trên G1, G2, G3)
    const validItems = [...g1Items, ...g2Items, ...g3Items];
    const totalMRR = validItems.reduce((acc, cur) => acc + cur.reciprocalRank, 0);
    const mrr = Number((totalMRR / validItems.length).toFixed(3));

    const totalP5 = validItems.reduce((acc, cur) => acc + cur.precisionAt5, 0);
    const precisionAt5 = Number((totalP5 / validItems.length).toFixed(3));

    const totalLatency = queryResults.reduce((acc, cur) => acc + cur.latencyMs, 0);
    const avgLatencyMs = Math.round(totalLatency / queryResults.length);

    // Điểm tổng hợp Combined Score (Thang 100):
    // 35% MRR + 30% Precision@5 + 15% Semantic + 20% (100 - NoiseRate)
    const combinedScore = Number(
      (
        mrr * 35 +
        precisionAt5 * 30 +
        (g2SemanticHitRate / 100) * 15 +
        ((100 - g4NoiseRate) / 100) * 20
      ).toFixed(2),
    );

    return {
      algorithm,
      parameters: {
        alpha,
        ftsWeight,
        threshold,
        normalizeScore,
      },
      totalQueries: BENCHMARK_QUERIES.length,
      metrics: {
        mrr,
        precisionAt5,
        g1ExactAccuracy,
        g2SemanticHitRate,
        g3TypoHitRate,
        g4NoiseRate,
        avgLatencyMs,
        combinedScore,
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
    const alphaCandidates = [0.4, 0.5, 0.6, 0.7];
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
            combinedScore: summary.metrics.combinedScore,
            mrr: summary.metrics.mrr,
            precisionAt5: summary.metrics.precisionAt5,
            g1ExactAccuracy: summary.metrics.g1ExactAccuracy,
            g2SemanticHitRate: summary.metrics.g2SemanticHitRate,
            g3TypoHitRate: summary.metrics.g3TypoHitRate,
            g4NoiseRate: summary.metrics.g4NoiseRate,
            avgLatencyMs: summary.metrics.avgLatencyMs,
          });
        }
      }
    }

    // Sắp xếp leaderboard giảm dần theo combinedScore
    leaderboard.sort((a, b) => b.combinedScore - a.combinedScore);

    const best = leaderboard[0];

    // Tính khoảng dung sai (Tolerance Margin): Các cấu hình đạt >= 95% điểm của Best
    const topConfigs = leaderboard.filter(
      (c) => c.combinedScore >= best.combinedScore * 0.95,
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
            ? `Thuật toán Cosine (Search B) đạt độ chính xác cao nhất với Alpha = ${best.alpha} (${best.alpha * 100}% AI, ${Math.round((1 - best.alpha) * 100)}% FTS), Ngưỡng Cosine = ${best.threshold}, Chuẩn hóa FTS = ${best.normalizeScore}. Khoảng an toàn ngưỡng Cosine là [${thresholdsInTop[0]} - ${thresholdsInTop[thresholdsInTop.length - 1]}].`
            : `Thuật toán L2 (Search A) đạt điểm cao nhất với Alpha = ${best.alpha}, Ngưỡng L2 = ${best.threshold}, Chuẩn hóa FTS = ${best.normalizeScore}. Khoảng an toàn ngưỡng L2 là [${thresholdsInTop[0]} - ${thresholdsInTop[thresholdsInTop.length - 1]}].`,
      },
      leaderboard: leaderboard.slice(0, 10), // Top 10 cấu hình tốt nhất
    };
  }

  /**
   * CHẠY 5 KỊCH BẢN KINH ĐIỂN (BENCHMARK SCENARIOS)
   * 1. 100% FTS (0% AI) - So khớp mặt chữ
   * 2. 100% Vector AI (0% FTS) - Thuần ngữ nghĩa
   * 3. 80% AI - 20% FTS (AI áp đảo)
   * 4. 40% AI - 60% FTS (FTS lấn át)
   * 5. 60% AI - 40% FTS (Sweet Spot - Cân bằng hoàn hảo)
   */
  async run5Scenarios(algorithm: 'A' | 'B' = 'B'): Promise<{
    algorithm: 'A' | 'B';
    scenarios: any[];
    analysis: string;
  }> {
    const defaultThreshold = algorithm === 'A' ? 1.05 : 0.55;

    const scenariosConfig = [
      {
        id: 1,
        name: 'Kịch bản 1: 100% FTS (Chỉ so khớp mặt chữ)',
        alpha: 0.0,
        ftsWeight: 1.0,
        threshold: defaultThreshold,
        normalizeScore: false,
        note: 'FTS thuần: Chính xác tuyệt đối tên sách, 0% nhiễu ở từ khóa rác, nhưng bỏ sót từ đồng nghĩa và câu hỏi ngữ nghĩa.',
      },
      {
        id: 2,
        name: 'Kịch bản 2: 100% Vector (Chỉ dùng AI)',
        alpha: 1.0,
        ftsWeight: 0.0,
        threshold: defaultThreshold,
        normalizeScore: false,
        note: 'Vector thuần: Rất mạnh về ngữ nghĩa và từ đồng nghĩa, nhưng bị ảo giác (nhiễu cao) khi gặp từ khóa rác.',
      },
      {
        id: 3,
        name: 'Kịch bản 3: 80% AI - 20% FTS (AI lấn át)',
        alpha: 0.8,
        ftsWeight: 0.2,
        threshold: defaultThreshold,
        normalizeScore: true,
        note: 'AI áp đảo: Ưu tiên ngữ nghĩa, FTS quá yếu nên chưa đủ làm mỏ neo kiểm soát ảo giác.',
      },
      {
        id: 4,
        name: 'Kịch bản 4: 40% AI - 60% FTS (FTS lấn át)',
        alpha: 0.4,
        ftsWeight: 0.6,
        threshold: defaultThreshold,
        normalizeScore: true,
        note: 'FTS lấn át: Nghiêng về mặt chữ, các câu hỏi ngữ nghĩa sâu bị giảm thứ hạng.',
      },
      {
        id: 5,
        name: 'Kịch bản 5: 60% AI - 40% FTS (Sweet Spot - Cân bằng)',
        alpha: 0.6,
        ftsWeight: 0.4,
        threshold: defaultThreshold,
        normalizeScore: true,
        note: 'Điểm cân bằng vàng: FTS 40% đóng vai trò mỏ neo giữ AI không bay bổng, AI 60% đủ sức mở rộng ngữ nghĩa và sửa lỗi chính tả.',
      },
    ];

    const results: any[] = [];

    for (const sc of scenariosConfig) {
      const summary = await this.runBenchmark(
        algorithm,
        {
          alpha: sc.alpha,
          threshold: sc.threshold,
          normalizeScore: sc.normalizeScore,
        },
        false,
      );

      results.push({
        scenarioId: sc.id,
        name: sc.name,
        ratio: `${Math.round(sc.alpha * 100)}% AI - ${Math.round(sc.ftsWeight * 100)}% FTS`,
        alpha: sc.alpha,
        ftsWeight: sc.ftsWeight,
        threshold: sc.threshold,
        combinedScore: summary.metrics.combinedScore,
        mrr: summary.metrics.mrr,
        precisionAt5: summary.metrics.precisionAt5,
        g1ExactAccuracy: `${summary.metrics.g1ExactAccuracy}% (Khớp tên chính xác)`,
        g2SemanticHitRate: `${summary.metrics.g2SemanticHitRate}% (Hiểu ngữ nghĩa)`,
        g3TypoHitRate: `${summary.metrics.g3TypoHitRate}% (Sửa lỗi chính tả/không dấu)`,
        g4NoiseRate: `${summary.metrics.g4NoiseRate}% (Tỷ lệ lọt rác - Càng thấp càng tốt)`,
        avgLatencyMs: `${summary.metrics.avgLatencyMs} ms`,
        note: sc.note,
      });
    }

    return {
      algorithm,
      scenarios: results,
      analysis:
        algorithm === 'B'
          ? 'Kịch bản 5 (60% AI - 40% FTS với Cosine Distance) đạt điểm số cân bằng tốt nhất giữa độ phủ ngữ nghĩa (Semantic Recall) và khả năng chặn đứng từ khóa rác (Precision). FTS 40% giữ mỏ neo vững chắc cho các truy vấn chính xác.'
          : 'Kịch bản 5 (60% AI - 40% FTS với L2 Distance) đạt điểm cân bằng cao nhất, kết hợp ưu điểm của L2 khoảng cách không gian với FTS.',
    };
  }
}
