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
    note: 'FTS thuần: Khớp tốt theo đúng mặt chữ tên sách, ít nhạy với từ khóa rác ngoài miền, nhưng hạn chế trong việc nhận diện câu hỏi tìm kiếm theo ngữ nghĩa.',
  },
  {
    id: 2,
    name: 'Kịch bản 2: 100% Vector (Chỉ dùng AI)',
    alpha: 1.0,
    ftsWeight: 0.0,
    note: 'Vector thuần: Nắm bắt ngữ nghĩa tốt hơn, nhưng độ chính xác xếp hạng tên sách ngắn có thể giảm và dễ bị ảnh hưởng bởi từ khóa lạ nếu không có bộ lọc ngưỡng.',
  },
  {
    id: 3,
    name: 'Kịch bản 3: 80% AI - 20% FTS (AI chiếm ưu thế)',
    alpha: 0.8,
    ftsWeight: 0.2,
    note: 'Tỷ lệ 80-20: Ưu tiên nhận diện ngữ nghĩa cao, FTS đóng vai trò hỗ trợ nhẹ khi từ khóa khớp từ.',
  },
  {
    id: 4,
    name: 'Kịch bản 4: 50% AI - 50% FTS (Cân bằng đồng đều)',
    alpha: 0.5,
    ftsWeight: 0.5,
    note: 'Tỷ lệ 50-50: Cân bằng giữa từ khóa và ngữ nghĩa, tuy nhiên FTS chiếm tỷ trọng đáng kể nên có thể ảnh hưởng điểm số ở câu hỏi diễn giải dài.',
  },
  {
    id: 5,
    name: 'Kịch bản 5: 60% AI - 40% FTS (Tỷ lệ 60-40)',
    alpha: 0.6,
    ftsWeight: 0.4,
    note: 'Tỷ lệ 60-40: Tăng tỷ trọng ngữ nghĩa hơn 50-50, đồng thời giữ tỷ trọng từ khóa 40% để nhận diện tựa sách.',
  },
  {
    id: 6,
    name: 'Kịch bản 6: 70% AI - 30% FTS (Tỷ lệ 70-30)',
    alpha: 0.7,
    ftsWeight: 0.3,
    note: 'Tỷ lệ 70-30: Cho độ hòa hợp tốt hơn trong tập kiểm thử, kết hợp giữa khả năng suy luận ngữ nghĩa của AI và điểm neo từ khóa của FTS.',
  },
];
