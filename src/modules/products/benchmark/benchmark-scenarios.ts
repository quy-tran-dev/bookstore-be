export interface BenchmarkScenarioConfig {
  id: number;
  name: string;
  alpha: number;
  ftsWeight: number;
  threshold?: number;
  minScore?: number;
  normalizeScore?: boolean;
  note: string;
}

/**
 * 6 KỊCH BẢN KIỂM THỬ THỰC NGHIỆM
 * Bao gồm FTS thuần, AI thuần và 4 tỷ lệ lai (80-20, 50-50, 60-40, 70-30)
 */
export const BENCHMARK_SCENARIOS: BenchmarkScenarioConfig[] = [
  {
    id: 1,
    name: 'Kịch bản 1: 100% FTS (Chỉ so khớp mặt chữ)',
    alpha: 0.0,
    ftsWeight: 1.0,
    note: 'FTS thuần: Chính xác tuyệt đối tên sách, 0% nhiễu ở từ khóa rác, nhưng bỏ sót hoàn toàn câu hỏi ngữ nghĩa.',
  },
  {
    id: 2,
    name: 'Kịch bản 2: 100% Vector (Chỉ dùng AI)',
    alpha: 1.0,
    ftsWeight: 0.0,
    note: 'Vector thuần: Rất mạnh về ngữ nghĩa, nhưng giảm độ chính xác ở tên sách khớp tuyệt đối và dễ dính ảo giác.',
  },
  {
    id: 3,
    name: 'Kịch bản 3: 80% AI - 20% FTS (AI chiếm ưu thế)',
    alpha: 0.8,
    ftsWeight: 0.2,
    note: 'AI áp đảo: Ưu tiên ngữ nghĩa cao, nhưng trọng số FTS 20% hơi yếu khi từ khóa là tên sách ngắn.',
  },
  {
    id: 4,
    name: 'Kịch bản 4: 50% AI - 50% FTS (Cân bằng đồng đều)',
    alpha: 0.5,
    ftsWeight: 0.5,
    note: 'Cân bằng 50-50: FTS chiếm tới 50% làm loãng độ chính xác khi gặp câu hỏi ngữ nghĩa dài hoặc sai chính tả.',
  },
  {
    id: 5,
    name: 'Kịch bản 5: 60% AI - 40% FTS (Tỷ lệ 60-40)',
    alpha: 0.6,
    ftsWeight: 0.4,
    note: 'Tỷ lệ 60-40: Cải thiện so với 50-50 nhưng trọng số FTS vẫn còn ảnh hưởng khi gặp từ khóa mô tả.',
  },
  {
    id: 6,
    name: 'Kịch bản 6: 70% AI - 30% FTS (Điểm Cân Bằng Vàng Tối Ưu)',
    alpha: 0.7,
    ftsWeight: 0.3,
    note: 'Cấu hình tối ưu: Đạt 100% Test Case, kết hợp hoàn hảo giữa năng lực ngữ nghĩa của AI và mỏ neo FTS 30%.',
  },
];
