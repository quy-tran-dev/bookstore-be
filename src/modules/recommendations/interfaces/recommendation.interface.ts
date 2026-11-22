/**
 * Chiến lược gợi ý sách được hệ thống áp dụng:
 * - SEMANTIC_SIMILARITY: Gợi ý dựa trên khoảng cách Cosine Vector (<=>) thuần ngữ nghĩa của pgvector (384 chiều MiniLM)
 * - USER_CENTROID: Gợi ý cá nhân hóa dựa trên Vector trọng tâm (Centroid Vector) từ lịch sử mua hàng / đánh giá của độc giả
 * - CART_CENTROID: Gợi ý bán chéo (Cross-selling) dựa trên Vector trọng tâm của các cuốn sách đang có trong giỏ hàng
 * - COLD_START: Chiến lược khởi động lạnh dành cho khách vãng lai hoặc tài khoản mới (dựa trên độ thịnh hành Bestseller & tồn kho)
 */
export type RecommendationStrategy =
  | 'SEMANTIC_SIMILARITY'
  | 'USER_CENTROID'
  | 'CART_CENTROID'
  | 'COLD_START';

/**
 * Thông tin một cuốn sách được gợi ý trả về cho Client / Frontend
 */
export interface RecommendedBookItem {
  id: string;
  name: string;
  slug: string;
  price: number;
  finalPrice: number;
  shortDescribe?: string;
  stockQuantity: number;
  soldCount: number;
  thumbnailUrl?: string | null;
  categories: string[];
  authors: string[];
  /**
   * Điểm tương đồng ngữ nghĩa Cosine (nằm trong khoảng [0, 1], ví dụ: 0.8742 tương ứng 87.42% tương đồng).
   * Với chiến lược COLD_START, giá trị này là null.
   */
  similarityScore: number | null;
  /**
   * Lý do gợi ý ngắn gọn bằng tiếng Việt giúp người dùng hiểu vì sao cuốn sách này được đề xuất
   */
  recommendationReason: string;
}

/**
 * Kết quả trả về của API gợi ý sách tương tự một cuốn sách đang xem
 */
export interface SimilarBooksResponse {
  sourceBook: {
    id: string;
    name: string;
    slug: string;
  };
  strategy: RecommendationStrategy;
  minSimilarityThreshold: number;
  totalRecommended: number;
  items: RecommendedBookItem[];
}

/**
 * Kết quả trả về của API gợi ý sách cá nhân hóa hoặc gợi ý bán kèm trong giỏ hàng
 */
export interface PersonalizedRecommendationResponse {
  strategy: RecommendationStrategy;
  basedOnBookCount: number;
  minSimilarityThreshold: number;
  totalRecommended: number;
  items: RecommendedBookItem[];
}
