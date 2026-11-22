export interface BenchmarkQueryItem {
  id: number;
  query: string;
  group: 'G1_EXACT' | 'G2_SEMANTIC' | 'G3_TYPO' | 'G4_NEGATIVE';
  description: string;
  expectedTitles: string[];
  /**
   * Thang điểm mức độ liên quan đa cấp (Graded Relevance) phục vụ tính toán NDCG@K, MRR@K, Precision@K, Recall@K:
   * - 3: Sách mục tiêu chính xác tuyệt đối (Exact Target Book)
   * - 2: Sách rất liên quan, giải quyết trực tiếp nhu cầu tìm kiếm (Highly Relevant)
   * - 1: Sách liên quan bổ trợ cùng lĩnh vực (Partially Relevant)
   */
  gradedRelevance?: Record<string, number>;
  mustNotMatch?: boolean;
}

export const BENCHMARK_QUERIES: BenchmarkQueryItem[] = [
  // G1: EXACT MATCH (3 câu) - Khớp chính xác tên tựa sách kinh điển
  // Kỳ vọng: FTS phát huy ưu thế so khớp mặt chữ, sách dự kiến xuất hiện ngay Top 1 (MRR@5 = 1.0, NDCG@5 = 1.0)
  {
    id: 1,
    query: 'Clean Code',
    group: 'G1_EXACT',
    description: 'Tìm chính xác tựa sách Lập trình Clean Code',
    expectedTitles: ['Clean Code - Mã Sạch', 'The Clean Coder'],
    gradedRelevance: {
      'Clean Code - Mã Sạch': 3,
      'The Clean Coder': 2,
      'Refactoring - Cải Thiện Thiết Kế Mã Nguồn Hiện Có': 1,
    },
  },
  {
    id: 2,
    query: 'Đắc Nhân Tâm',
    group: 'G1_EXACT',
    description: 'Tìm chính xác sách Kỹ năng Đắc Nhân Tâm',
    expectedTitles: ['Đắc Nhân Tâm'],
    gradedRelevance: {
      'Đắc Nhân Tâm': 3,
      'Quẳng Gánh Lo Đi Và Vui Sống': 1,
    },
  },
  {
    id: 3,
    query: 'Nhà Giả Kim',
    group: 'G1_EXACT',
    description: 'Tìm chính xác tiểu thuyết kinh điển Nhà Giả Kim',
    expectedTitles: ['Nhà Giả Kim (The Alchemist)'],
    gradedRelevance: {
      'Nhà Giả Kim (The Alchemist)': 3,
      'Hoàng Tử Bé': 1,
    },
  },

  // G2: SEMANTIC / INTENT SEARCH (4 câu) - Tìm theo nhu cầu/ý nghĩa người đọc
  // Kỳ vọng: Vector AI hiểu bản chất nội dung mà không cần người dùng nhớ tên sách
  {
    id: 4,
    query: 'sách dạy viết mã nguồn sạch dễ bảo trì',
    group: 'G2_SEMANTIC',
    description: 'Nhu cầu viết code sạch trong lập trình phần mềm',
    expectedTitles: [
      'Clean Code - Mã Sạch',
      'Refactoring - Cải Thiện Thiết Kế Mã Nguồn Hiện Có',
      'Code Complete (Tập 2)',
    ],
    gradedRelevance: {
      'Clean Code - Mã Sạch': 3,
      'Refactoring - Cải Thiện Thiết Kế Mã Nguồn Hiện Có': 2,
      'Code Complete (Tập 2)': 2,
      'The Clean Coder': 1,
    },
  },
  {
    id: 5,
    query: 'cách rèn luyện thói quen tốt và kỷ luật bản thân',
    group: 'G2_SEMANTIC',
    description: 'Nhu cầu phát triển bản thân, thay đổi thói quen và rèn kỷ luật',
    expectedTitles: [
      'Atomic Habits (Thay Đổi Tí Hon Hiệu Quả To Lớn)',
      '7 Thói Quen Để Thành Đạt',
      'Kỷ Luật Tự Do (Discipline Equals Freedom)',
      'Deep Work - Làm Việc Sâu',
    ],
    gradedRelevance: {
      'Atomic Habits (Thay Đổi Tí Hon Hiệu Quả To Lớn)': 3,
      'Kỷ Luật Tự Do (Discipline Equals Freedom)': 3,
      '7 Thói Quen Để Thành Đạt': 2,
      'Deep Work - Làm Việc Sâu': 1,
    },
  },
  {
    id: 6,
    query: 'chiến lược khởi nghiệp kinh doanh ít rủi ro',
    group: 'G2_SEMANTIC',
    description: 'Nhu cầu khởi nghiệp, vận hành doanh nghiệp tinh gọn',
    expectedTitles: [
      'Khởi Nghiệp Tinh Gọn (The Lean Startup)',
      'Tạo Lập Mô Hình Kinh Doanh (Business Model Generation)',
      'Chiến Lược Đại Dương Xanh',
      'Từ Tốt Đến Vĩ Đại',
    ],
    gradedRelevance: {
      'Khởi Nghiệp Tinh Gọn (The Lean Startup)': 3,
      'Tạo Lập Mô Hình Kinh Doanh (Business Model Generation)': 2,
      'Chiến Lược Đại Dương Xanh': 2,
      'Từ Tốt Đến Vĩ Đại': 1,
    },
  },
  {
    id: 7,
    query: 'tiểu thuyết trinh thám phá án ly kỳ gay cấn',
    group: 'G2_SEMANTIC',
    description: 'Nhu cầu giải trí tìm đọc truyện trinh thám vụ án bí ẩn',
    expectedTitles: [
      'Sherlock Holmes: Toàn Tập (Tập 1)',
      'Sherlock Holmes: Toàn Tập (Tập 2)',
      'Phía Sau Nghi Can X',
      'Án Mạng Trên Chuyến Tàu Tốc Hành Phương Đông',
      'Và Rồi Không Còn Ai (And Then There Were None)',
    ],
    gradedRelevance: {
      'Sherlock Holmes: Toàn Tập (Tập 1)': 3,
      'Phía Sau Nghi Can X': 3,
      'Án Mạng Trên Chuyến Tàu Tốc Hành Phương Đông': 2,
      'Và Rồi Không Còn Ai (And Then There Were None)': 2,
      'Sherlock Holmes: Toàn Tập (Tập 2)': 2,
    },
  },

  // G3: TYPO / KHÔNG DẤU (3 câu) - Gõ nhanh, gõ sai, gõ tiếng Việt không dấu
  // Kỳ vọng: AI bù trừ không gian vector khi FTS bị gãy mặt chữ
  {
    id: 8,
    query: 'clean code ma sach',
    group: 'G3_TYPO',
    description: 'Tìm tên sách Clean Code tiếng Việt không dấu',
    expectedTitles: ['Clean Code - Mã Sạch'],
    gradedRelevance: {
      'Clean Code - Mã Sạch': 3,
      'The Clean Coder': 1,
    },
  },
  {
    id: 9,
    query: 'dac nhan tam dale carnegie',
    group: 'G3_TYPO',
    description: 'Tìm sách Đắc Nhân Tâm không dấu kèm tác giả',
    expectedTitles: ['Đắc Nhân Tâm'],
    gradedRelevance: {
      'Đắc Nhân Tâm': 3,
    },
  },
  {
    id: 10,
    query: 'nha gia kim paulo coelho',
    group: 'G3_TYPO',
    description: 'Tìm tiểu thuyết Nhà Giả Kim không dấu kèm tác giả',
    expectedTitles: ['Nhà Giả Kim (The Alchemist)'],
    gradedRelevance: {
      'Nhà Giả Kim (The Alchemist)': 3,
    },
  },

  // G4: NEGATIVE / OUT-OF-DOMAIN (2 câu) - Từ khóa rác ngoài phạm vi nhà sách
  // Kỳ vọng: Bộ lọc ngưỡng (Gatekeeper) chặn đứng, trả về rỗng ([])
  {
    id: 11,
    query: 'mua bán xe máy honda wave alpha cũ giá rẻ',
    group: 'G4_NEGATIVE',
    description: 'Từ khóa ngoài ngành (phương tiện xe cộ)',
    expectedTitles: [],
    mustNotMatch: true,
  },
  {
    id: 12,
    query: 'vé máy bay khứ hồi hà nội đà nẵng sài gòn',
    group: 'G4_NEGATIVE',
    description: 'Từ khóa ngoài ngành (vé máy bay / du lịch)',
    expectedTitles: [],
    mustNotMatch: true,
  },
];
