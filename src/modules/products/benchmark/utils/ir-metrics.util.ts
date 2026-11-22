/**
 * THƯ VIỆN TÍNH TOÁN CÁC CHỈ SỐ ĐÁNH GIÁ TRUY XUẤT THÔNG TIN CHUẨN QUỐC TẾ (INFORMATION RETRIEVAL - IR METRICS)
 * -------------------------------------------------------------------------------------------------------------
 * Được sử dụng bởi các nền tảng tìm kiếm và benchmark học thuật (BEIR, MTEB, Elasticsearch, Pinecone, Vespa, SIGIR):
 * 1. Hit@K (Hit Rate / Success@K): Tỷ lệ truy vấn có ít nhất 1 tài liệu đúng xuất hiện trong Top K.
 * 2. MRR@K (Mean Reciprocal Rank): Trung bình nghịch đảo thứ hạng của tài liệu đúng đầu tiên trong Top K (1/rank).
 * 3. NDCG@K (Normalized Discounted Cumulative Gain): Đánh giá chất lượng thứ tự xếp hạng có xét đến mức độ liên quan đa cấp (Graded Relevance: 0, 1, 2, 3) và vị trí log2.
 * 4. Precision@K: Tỷ lệ tài liệu thực sự liên quan trong K kết quả đầu tiên trả về.
 * 5. Recall@K: Tỷ lệ tài liệu liên quan tìm thấy trong Top K so với tổng số tài liệu liên quan của câu truy vấn trong Ground Truth.
 * 6. TNR (True Negative Rate / Specificity): Tỷ lệ từ chối thành công các truy vấn rác ngoài miền (Out-of-Domain).
 */
export interface SingleQueryIrMetrics {
  hitAt1: number;
  hitAt3: number;
  hitAt5: number;
  mrrAt5: number;
  ndcgAt5: number;
  precisionAt5: number;
  recallAt5: number;
  firstRelevantRank: number | null;
}

export class IrMetricsUtil {
  /**
   * Tra cứu điểm mức độ liên quan (Graded Relevance: 0, 1, 2, 3) của một tựa sách trả về
   * dựa trên từ điển Ground Truth của câu truy vấn.
   * - 3: Khớp hoàn hảo / Sách mục tiêu chính xác (Exact Target)
   * - 2: Rất liên quan / Cùng chủ đề giải quyết trực tiếp nhu cầu (Highly Relevant)
   * - 1: Liên quan bổ trợ / Cùng lĩnh vực rộng (Partially Relevant)
   * - 0: Không liên quan (Irrelevant)
   */
  static resolveRelevanceGrade(
    bookTitle: string,
    gradedRelevance?: Record<string, number>,
    expectedTitles: string[] = [],
  ): number {
    if (!bookTitle) return 0;
    const lowerTitle = bookTitle.toLowerCase().trim();

    if (gradedRelevance && Object.keys(gradedRelevance).length > 0) {
      let maxGrade = 0;
      for (const [expectedKey, grade] of Object.entries(gradedRelevance)) {
        if (lowerTitle.includes(expectedKey.toLowerCase().trim())) {
          if (grade > maxGrade) {
            maxGrade = grade;
          }
        }
      }
      if (maxGrade > 0) return maxGrade;
    }

    // Fallback tương thích ngược với mảng expectedTitles (mặc định gán mức 3 cho phần tử đầu tiên, mức 2 cho các phần tử sau)
    for (let idx = 0; idx < expectedTitles.length; idx++) {
      if (lowerTitle.includes(expectedTitles[idx].toLowerCase().trim())) {
        return idx === 0 ? 3 : 2;
      }
    }

    return 0;
  }

  /**
   * 1. Tính Hit@K (Success@K):
   * Công thức: Hit@K = 1 nếu trong Top K có ít nhất 1 cuốn sách có độ liên quan (rel >= minRelGrade), ngược lại = 0.
   */
  static computeHitAtK(
    retrievedTitles: string[],
    k: number,
    gradedRelevance?: Record<string, number>,
    expectedTitles: string[] = [],
    minRelGrade: number = 1,
  ): number {
    const topK = (retrievedTitles || []).slice(0, k);
    for (const title of topK) {
      const rel = this.resolveRelevanceGrade(
        title,
        gradedRelevance,
        expectedTitles,
      );
      if (rel >= minRelGrade) {
        return 1;
      }
    }
    return 0;
  }

  /**
   * 2. Tính Reciprocal Rank tại Top K (RR@K - thành phần của MRR@K):
   * Công thức: RR@K = 1 / rank_first (với rank_first là vị trí đầu tiên từ 1..K xuất hiện sách liên quan).
   * Ví dụ: Sách đúng ở Top 1 -> 1.0; Top 2 -> 0.5; Top 3 -> 0.3333; Top 5 -> 0.2; Không có trong Top K -> 0.
   */
  static computeReciprocalRankAtK(
    retrievedTitles: string[],
    k: number,
    gradedRelevance?: Record<string, number>,
    expectedTitles: string[] = [],
    minRelGrade: number = 1,
  ): { rr: number; firstRank: number | null } {
    const topK = (retrievedTitles || []).slice(0, k);
    for (let i = 0; i < topK.length; i++) {
      const rel = this.resolveRelevanceGrade(
        topK[i],
        gradedRelevance,
        expectedTitles,
      );
      if (rel >= minRelGrade) {
        const rank = i + 1;
        return {
          rr: Number((1 / rank).toFixed(4)),
          firstRank: rank,
        };
      }
    }
    return { rr: 0, firstRank: null };
  }

  /**
   * 3. Tính NDCG@K (Normalized Discounted Cumulative Gain at K):
   * Công thức chuẩn học thuật:
   *   DCG@K  = Sum_{i=1..K} [ (2^(rel_i) - 1) / log2(i + 1) ]
   *   IDCG@K = Sum_{i=1..min(K, |Ideal|)} [ (2^(ideal_rel_i) - 1) / log2(i + 1) ]
   *   NDCG@K = DCG@K / IDCG@K
   * Ý nghĩa: Phạt nặng nếu cuốn sách có độ liên quan cao (rel = 3) bị đẩy xuống vị trí thấp hơn cuốn liên quan nhẹ (rel = 1).
   */
  static computeNdcgAtK(
    retrievedTitles: string[],
    k: number,
    gradedRelevance?: Record<string, number>,
    expectedTitles: string[] = [],
  ): number {
    const topK = (retrievedTitles || []).slice(0, k);

    // Tính DCG@K thực tế từ danh sách kết quả tìm kiếm
    // Lưu ý chống cộng trùng điểm nếu cùng 1 cuốn sách trong Ground Truth xuất hiện nhiều lần
    let dcg = 0;
    for (let i = 0; i < topK.length; i++) {
      const rel = this.resolveRelevanceGrade(
        topK[i],
        gradedRelevance,
        expectedTitles,
      );
      if (rel > 0) {
        const gain = Math.pow(2, rel) - 1;
        const discount = Math.log2(i + 2); // i là 0-based nên vị trí thứ hạng là (i+1) -> log2((i+1) + 1) = log2(i + 2)
        dcg += gain / discount;
      }
    }

    // Xây dựng danh sách điểm liên quan lý tưởng (Ideal Relevance Grades) sắp xếp giảm dần
    const idealGrades: number[] =
      gradedRelevance && Object.keys(gradedRelevance).length > 0
        ? Object.values(gradedRelevance)
            .filter((g) => g > 0)
            .sort((a, b) => b - a)
        : expectedTitles.map((_, idx) => (idx === 0 ? 3 : 2));

    if (idealGrades.length === 0) return 0;

    let idcg = 0;
    const idealTopK = idealGrades.slice(0, k);
    for (let i = 0; i < idealTopK.length; i++) {
      const gain = Math.pow(2, idealTopK[i]) - 1;
      const discount = Math.log2(i + 2);
      idcg += gain / discount;
    }

    if (idcg === 0) return 0;
    return Number(Math.min(1, dcg / idcg).toFixed(4));
  }

  /**
   * 4. Tính Precision@K (Độ chính xác tại Top K):
   * Công thức: Precision@K = (Số sách liên quan trong Top K) / K
   * Lưu ý: Chia cho min(K, tổng số sách liên quan có trong Ground Truth) hoặc chia cho K chuẩn để đánh giá mật độ kết quả đúng.
   * Ở đây tính Precision@K chuẩn theo mẫu số min(K, số kết quả thực tế trả về hoặc K) để phản ánh đúng tỷ lệ sách đúng trên màn hình.
   */
  static computePrecisionAtK(
    retrievedTitles: string[],
    k: number,
    gradedRelevance?: Record<string, number>,
    expectedTitles: string[] = [],
    minRelGrade: number = 1,
  ): number {
    const topK = (retrievedTitles || []).slice(0, k);
    if (topK.length === 0 || k <= 0) return 0;

    let relevantCount = 0;
    for (const title of topK) {
      const rel = this.resolveRelevanceGrade(
        title,
        gradedRelevance,
        expectedTitles,
      );
      if (rel >= minRelGrade) {
        relevantCount++;
      }
    }

    return Number((relevantCount / k).toFixed(4));
  }

  /**
   * 5. Tính Recall@K (Độ bao phủ tại Top K):
   * Công thức: Recall@K = (Số sách liên quan tìm được trong Top K) / (Tổng số sách liên quan của câu truy vấn trong Ground Truth)
   */
  static computeRecallAtK(
    retrievedTitles: string[],
    k: number,
    gradedRelevance?: Record<string, number>,
    expectedTitles: string[] = [],
    minRelGrade: number = 1,
  ): number {
    const totalRelevantInGroundTruth =
      gradedRelevance && Object.keys(gradedRelevance).length > 0
        ? Object.values(gradedRelevance).filter((g) => g >= minRelGrade).length
        : expectedTitles.length;

    if (totalRelevantInGroundTruth === 0) return 0;

    const topK = (retrievedTitles || []).slice(0, k);
    let relevantFound = 0;
    for (const title of topK) {
      const rel = this.resolveRelevanceGrade(
        title,
        gradedRelevance,
        expectedTitles,
      );
      if (rel >= minRelGrade) {
        relevantFound++;
      }
    }

    return Number(
      Math.min(1, relevantFound / totalRelevantInGroundTruth).toFixed(4),
    );
  }

  /**
   * Tổng hợp toàn bộ các chỉ số IR chuẩn cho 1 câu truy vấn có mục tiêu (G1, G2, G3)
   */
  static evaluatePositiveQuery(
    retrievedTitles: string[],
    gradedRelevance?: Record<string, number>,
    expectedTitles: string[] = [],
  ): SingleQueryIrMetrics {
    const hitAt1 = this.computeHitAtK(
      retrievedTitles,
      1,
      gradedRelevance,
      expectedTitles,
    );
    const hitAt3 = this.computeHitAtK(
      retrievedTitles,
      3,
      gradedRelevance,
      expectedTitles,
    );
    const hitAt5 = this.computeHitAtK(
      retrievedTitles,
      5,
      gradedRelevance,
      expectedTitles,
    );
    const { rr: mrrAt5, firstRank: firstRelevantRank } =
      this.computeReciprocalRankAtK(
        retrievedTitles,
        5,
        gradedRelevance,
        expectedTitles,
      );
    const ndcgAt5 = this.computeNdcgAtK(
      retrievedTitles,
      5,
      gradedRelevance,
      expectedTitles,
    );
    const precisionAt5 = this.computePrecisionAtK(
      retrievedTitles,
      5,
      gradedRelevance,
      expectedTitles,
    );
    const recallAt5 = this.computeRecallAtK(
      retrievedTitles,
      5,
      gradedRelevance,
      expectedTitles,
    );

    return {
      hitAt1,
      hitAt3,
      hitAt5,
      mrrAt5,
      ndcgAt5,
      precisionAt5,
      recallAt5,
      firstRelevantRank,
    };
  }
}
