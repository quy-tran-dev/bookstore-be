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
    name: 'Cấp độ 1: Ngưỡng Rộng (Loose Gatekeeper)',
    threshold: 0.7,
    minScore: 0.15,
    expectedBehavior:
      'Chấp nhận vector khoảng cách xa hơn. Độ phủ cao hơn nhưng nguy cơ lọt kết quả ít liên quan tăng lên.',
  },
  {
    levelId: 2,
    name: 'Cấp độ 2: Ngưỡng Khuyến Nghị từ Grid Search',
    threshold: 0.65,
    minScore: 0.25,
    expectedBehavior:
      'Cân bằng tốt hơn giữa việc mở rộng độ phủ câu hỏi ngữ nghĩa và khả năng loại bỏ từ khóa ngoài miền.',
  },
  {
    levelId: 3,
    name: 'Cấp độ 3: Ngưỡng Trung Bình (Moderate Gatekeeper)',
    threshold: 0.6,
    minScore: 0.25,
    expectedBehavior:
      'Ngưỡng trung bình. Nhận diện ngữ nghĩa tương đối tốt và duy trì lọc từ khóa rác ổn định.',
  },
  {
    levelId: 4,
    name: 'Cấp độ 4: Ngưỡng Ban Đầu (Original Gatekeeper)',
    threshold: 0.55,
    minScore: 0.35,
    expectedBehavior:
      'Ngưỡng giả thuyết ban đầu: Lọc tốt từ khóa rác nhưng độ phủ ngữ nghĩa bị giới hạn hơn.',
  },
  {
    levelId: 5,
    name: 'Cấp độ 5: Ngưỡng Hẹp (Strict Gatekeeper)',
    threshold: 0.4,
    minScore: 0.5,
    expectedBehavior:
      'Yêu cầu độ tương đồng rất cao: Dễ dẫn đến hiện tượng bỏ sót kết quả liên quan (False Negatives).',
  },
];

/**
 * 5 CẤP ĐỘ BỘ LỌC NGƯỠNG CHO THUẬT TOÁN A (EUCLIDEAN L2 DISTANCE)
 */
export const THRESHOLD_CONFIGS_A: BenchmarkThresholdConfig[] = [
  {
    levelId: 1,
    name: 'Cấp độ 1: Ngưỡng Rộng (Loose Gatekeeper)',
    threshold: 1.3,
    minScore: 0.15,
    expectedBehavior: 'Khoảng cách L2 lớn, chấp nhận vector phân tán hơn.',
  },
  {
    levelId: 2,
    name: 'Cấp độ 2: Ngưỡng Khuyến Nghị từ Grid Search',
    threshold: 1.15,
    minScore: 0.25,
    expectedBehavior:
      'Ngưỡng L2 cho kết quả khả quan hơn trong tập dữ liệu thử nghiệm, hạn chế nhiễu tốt hơn.',
  },
  {
    levelId: 3,
    name: 'Cấp độ 3: Ngưỡng Trung Bình (Moderate Gatekeeper)',
    threshold: 1.1,
    minScore: 0.25,
    expectedBehavior: 'Ngưỡng trung bình của L2 Distance.',
  },
  {
    levelId: 4,
    name: 'Cấp độ 4: Ngưỡng Ban Đầu (Original Gatekeeper)',
    threshold: 1.05,
    minScore: 0.35,
    expectedBehavior: 'Ngưỡng giả thuyết ban đầu của nhóm.',
  },
  {
    levelId: 5,
    name: 'Cấp độ 5: Ngưỡng Hẹp (Strict Gatekeeper)',
    threshold: 0.85,
    minScore: 0.5,
    expectedBehavior:
      'Chỉ chấp nhận vector khoảng cách gần, có xu hướng loại bớt một số câu hỏi ngữ nghĩa.',
  },
];
