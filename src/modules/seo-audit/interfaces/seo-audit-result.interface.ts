/**
 * Trạng thái đạt chuẩn của từng tiêu chí SEO:
 * - PASSED: Đạt mức tối ưu
 * - WARNING: Cần cải thiện thêm để đạt hiệu quả cao nhất
 * - FAILED: Chưa đạt yêu cầu cơ bản hoặc vi phạm quy tắc SEO (ví dụ: nhồi nhét từ khóa)
 */
export type SeoAuditStatus = 'PASSED' | 'WARNING' | 'FAILED';

/**
 * Xếp loại tổng thể bài viết sản phẩm theo thang điểm 100:
 * - EXCELLENT: 85 - 100 điểm
 * - GOOD: 70 - 84 điểm
 * - AVERAGE: 50 - 69 điểm
 * - POOR: Dưới 50 điểm
 */
export type SeoGrade = 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'POOR';

/**
 * Kết quả chấm điểm chi tiết của 1 tiêu chí thành phần
 */
export interface SeoCriterionScore {
  score: number;
  maxScore: number;
  status: SeoAuditStatus;
  details: string;
  metrics?: Record<string, any>;
}

/**
 * Gợi ý chỉnh sửa gắn trực tiếp với từng khối nội dung (SectionBlock) hoặc trường dữ liệu
 */
export interface SeoSectionFeedback {
  blockId?: string;
  blockType?: string;
  field: 'title' | 'shortDescribe' | 'section' | 'image' | 'keyword' | 'semantic';
  severity: 'WARNING' | 'FAILED';
  message: string;
}

/**
 * Bảng kiểm 6 tiêu chí SEO On-Page (Tổng 100 điểm)
 */
export interface SeoAuditChecklist {
  /** Tiêu chí 1 (Tối đa 20đ): Tiêu đề sách & sự hiện diện của từ khóa trọng tâm */
  titleAndKeyword: SeoCriterionScore;
  /** Tiêu chí 2 (Tối đa 15đ): Mô tả ngắn (shortDescribe - Meta Description) */
  metaDescription: SeoCriterionScore;
  /** Tiêu chí 3 (Tối đa 20đ): Cấu trúc phân đoạn Section (Heading H2/H3 & độ dài bài viết) */
  sectionStructure: SeoCriterionScore;
  /** Tiêu chí 4 (Tối đa 15đ): Mật độ và vị trí phân bổ từ khóa trọng tâm */
  keywordDistribution: SeoCriterionScore;
  /** Tiêu chí 5 (Tối đa 15đ): Tối ưu thẻ Alt cho hình ảnh trong Album và trong các khối Section */
  mediaOptimization: SeoCriterionScore;
  /** Tiêu chí 6 (Tối đa 15đ): Độ tương đồng ngữ nghĩa (Cosine Similarity bằng Vector MiniLM) */
  semanticRelevance: SeoCriterionScore;
}

/**
 * Cấu trúc dữ liệu trả về đầy đủ của một lần kiểm tra SEO
 */
export interface SeoAuditResult {
  auditId?: string;
  productId?: string;
  focusKeyword: string;
  totalScore: number;
  grade: SeoGrade;
  auditedVersion?: number;
  summary: string;
  checklist: SeoAuditChecklist;
  sectionFeedbacks: SeoSectionFeedback[];
  actionableGuidance: string[];
  createdAt?: Date;
}
