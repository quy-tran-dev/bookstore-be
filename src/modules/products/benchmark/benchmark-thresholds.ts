export interface BenchmarkThresholdConfig {
  levelId: number;
  name: string;
  threshold: number;
  minScore: number;
  expectedBehavior: string;
  normalizeScore?: boolean;
}

/**
 * 5 CẤP ĐỘ BỘ LỌC NGƯỠNG CHO THUẬT TOÁN B (COSINE DISTANCE)
 */
export const THRESHOLD_CONFIGS_B: BenchmarkThresholdConfig[] = [
  {
    levelId: 1,
    name: 'Cấp độ 1: Ngưỡng Quá Lỏng (Loose Gatekeeper)',
    threshold: 0.7,
    minScore: 0.15,
    expectedBehavior:
      'Chấp nhận vector khoảng cách xa. Độ phủ cao nhưng lỏng lẻo khi kho sách mở rộng.',
  },
  {
    levelId: 2,
    name: 'Cấp độ 2: Ngưỡng Tối Ưu (Optimal Gatekeeper - Điểm Vàng Grid Search)',
    threshold: 0.65,
    minScore: 0.25,
    expectedBehavior:
      'Điểm vàng tối ưu: Độ phủ ngữ nghĩa đạt 100% tuyệt đối mà tỷ lệ rác vẫn duy trì 0%.',
  },
  {
    levelId: 3,
    name: 'Cấp độ 3: Ngưỡng Vừa Phải (Moderate Gatekeeper)',
    threshold: 0.6,
    minScore: 0.25,
    expectedBehavior:
      'Ngưỡng trung bình. Hiểu ngữ nghĩa tốt và kiểm soát rác an toàn.',
  },
  {
    levelId: 4,
    name: 'Cấp độ 4: Ngưỡng Ban Đầu (Original Gatekeeper - Giả thuyết cũ)',
    threshold: 0.55,
    minScore: 0.35,
    expectedBehavior:
      'Ngưỡng giả thuyết ban đầu của nhóm: Chặn 0% rác nhưng độ phủ ngữ nghĩa ở mức 75%.',
  },
  {
    levelId: 5,
    name: 'Cấp độ 5: Ngưỡng Quá Chặt (Strict Gatekeeper)',
    threshold: 0.4,
    minScore: 0.5,
    expectedBehavior:
      'Khắt khe cực đoan: Gây hiện tượng sụp đổ độ phủ (False Negatives), loại bỏ nhầm cả câu hỏi ngữ nghĩa.',
  },
];

/**
 * 5 CẤP ĐỘ BỘ LỌC NGƯỠNG CHO THUẬT TOÁN A (EUCLIDEAN L2 DISTANCE)
 */
export const THRESHOLD_CONFIGS_A: BenchmarkThresholdConfig[] = [
  {
    levelId: 1,
    name: 'Cấp độ 1: Ngưỡng Quá Lỏng (Loose Gatekeeper)',
    threshold: 1.3,
    minScore: 0.15,
    expectedBehavior: 'Khoảng cách L2 lớn, chấp nhận vector phân tán.',
  },
  {
    levelId: 2,
    name: 'Cấp độ 2: Ngưỡng Tối Ưu (Optimal Gatekeeper - Điểm Vàng Grid Search)',
    threshold: 1.15,
    minScore: 0.25,
    expectedBehavior:
      'Ngưỡng L2 tối ưu: Triệt tiêu nhiễu tốt nhất, bảo toàn 100% khả năng tìm kiếm ngữ nghĩa.',
  },
  {
    levelId: 3,
    name: 'Cấp độ 3: Ngưỡng Vừa Phải (Moderate Gatekeeper)',
    threshold: 1.1,
    minScore: 0.25,
    expectedBehavior: 'Ngưỡng trung bình của L2 Distance.',
  },
  {
    levelId: 4,
    name: 'Cấp độ 4: Ngưỡng Ban Đầu (Original Gatekeeper - Giả thuyết cũ)',
    threshold: 1.05,
    minScore: 0.35,
    expectedBehavior: 'Ngưỡng giả thuyết ban đầu của nhóm.',
  },
  {
    levelId: 5,
    name: 'Cấp độ 5: Ngưỡng Quá Chặt (Strict Gatekeeper)',
    threshold: 0.85,
    minScore: 0.5,
    expectedBehavior:
      'Chỉ chấp nhận vector khoảng cách cực gần, gây sụp đổ điểm số của câu hỏi ngữ nghĩa.',
  },
];
