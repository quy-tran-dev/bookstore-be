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

/**
 * BỘ KỊCH BẢN KIỂM THỬ THỰC NGHIỆM MỞ RỘNG (24 TEST CASES ĐẠI DIỆN)
 * -------------------------------------------------------------------
 * Phân bổ theo 4 nhóm hành vi tìm kiếm thực tế trong TMĐT:
 * - G1_EXACT (6 câu): Tìm đích danh tựa sách / tác giả
 * - G2_SEMANTIC (8 câu): Tìm theo nhu cầu tự nhiên, ý niệm, ngữ cảnh
 * - G3_TYPO (6 câu): Tìm kiếm không dấu, lỗi gõ nhanh, viết tắt
 * - G4_NEGATIVE (4 câu): Từ khóa rác ngoài danh mục nhà sách (kiểm tra Gatekeeper TNR)
 */
export const BENCHMARK_QUERIES: BenchmarkQueryItem[] = [
  // =========================================================================
  // G1: EXACT MATCH (6 câu) - Khớp chính xác tên tựa sách kinh điển
  // Kỳ vọng: FTS (&) và L2 Distance (<->) phát huy độ sắc bén ở cự ly gần, đưa sách đích lên Top 1
  // =========================================================================
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
  {
    id: 13,
    query: 'Harry Potter và Hòn Đá Phù Thủy',
    group: 'G1_EXACT',
    description: 'Tìm chính xác tập 1 bộ tiểu thuyết giả tưởng Harry Potter',
    expectedTitles: [
      'Harry Potter và Hòn Đá Phù Thủy',
      'Harry Potter và Phòng Chứa Bí Mật',
    ],
    gradedRelevance: {
      'Harry Potter và Hòn Đá Phù Thủy': 3,
      'Harry Potter và Phòng Chứa Bí Mật': 2,
      'Harry Potter và Tên Tù Nhân Ngục Azkaban': 1,
    },
  },
  {
    id: 14,
    query: 'Tâm Lý Học Về Tiền',
    group: 'G1_EXACT',
    description: 'Tìm chính xác sách tài chính cá nhân Tâm Lý Học Về Tiền',
    expectedTitles: [
      'Tâm Lý Học Về Tiền (The Psychology of Money)',
      'The Psychology of Money',
    ],
    gradedRelevance: {
      'Tâm Lý Học Về Tiền (The Psychology of Money)': 3,
      'The Psychology of Money': 2,
      'Rich Dad Poor Dad': 1,
    },
  },
  {
    id: 15,
    query: 'System Design Interview',
    group: 'G1_EXACT',
    description: 'Tìm chính xác sách phỏng vấn thiết kế hệ thống',
    expectedTitles: [
      "System Design Interview – An Insider's Guide (Volume 1)",
      "System Design Interview – An Insider's Guide (Volume 2)",
    ],
    gradedRelevance: {
      "System Design Interview – An Insider's Guide (Volume 1)": 3,
      "System Design Interview – An Insider's Guide (Volume 2)": 3,
      'Designing Data-Intensive Applications (DDIA)': 2,
    },
  },

  // =========================================================================
  // G2: SEMANTIC / INTENT SEARCH (8 câu) - Tìm theo nhu cầu/ý nghĩa người đọc
  // Kỳ vọng: Cosine Distance (<=>) giữ góc ngữ nghĩa mượt mà kết hợp FTS (|) mở rộng độ phủ
  // =========================================================================
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
  {
    id: 16,
    query: 'sách hướng dẫn học trí tuệ nhân tạo và mạng nơ ron học sâu',
    group: 'G2_SEMANTIC',
    description: 'Nhu cầu tìm hiểu AI, Machine Learning và Deep Learning',
    expectedTitles: [
      'Deep Learning (Trí Tuệ Nhân Tạo Chuyên Sâu)',
      'Hands-On Machine Learning with Scikit-Learn, Keras, and TensorFlow',
      'Học Machine Learning Từ Con Số',
    ],
    gradedRelevance: {
      'Deep Learning (Trí Tuệ Nhân Tạo Chuyên Sâu)': 3,
      'Hands-On Machine Learning with Scikit-Learn, Keras, and TensorFlow': 3,
      'Học Machine Learning Từ Con Số': 2,
      'Deep Learning': 2,
    },
  },
  {
    id: 17,
    query: 'làm sao để bớt lo âu căng thẳng và sống an nhiên ở hiện tại',
    group: 'G2_SEMANTIC',
    description: 'Nhu cầu chữa lành tâm lý, giảm stress và thực hành chánh niệm',
    expectedTitles: [
      'Quẳng Gánh Lo Đi Và Vui Sống',
      'Sức Mạnh Của Hiện Tại (The Power of Now)',
      'Chủ Nghĩa Khắc Kỷ (Stoicism)',
    ],
    gradedRelevance: {
      'Quẳng Gánh Lo Đi Và Vui Sống': 3,
      'Sức Mạnh Của Hiện Tại (The Power of Now)': 3,
      'Chủ Nghĩa Khắc Kỷ (Stoicism)': 2,
      'Tìm Lại Chính Mình (Search Inside Yourself)': 2,
    },
  },
  {
    id: 18,
    query: 'kiến trúc phân rã hệ thống phần mềm lớn thành các dịch vụ nhỏ độc lập',
    group: 'G2_SEMANTIC',
    description: 'Nhu cầu thiết kế hệ thống phân tán và Microservices',
    expectedTitles: [
      'Building Microservices',
      'Monolith to Microservices',
      'Clean Architecture',
    ],
    gradedRelevance: {
      'Building Microservices': 3,
      'Monolith to Microservices': 3,
      'Clean Architecture': 2,
      'Domain-Driven Design (DDD): Tác Động Vào Lõi Phần Mềm': 2,
    },
  },
  {
    id: 19,
    query: 'nghệ thuật đàm phán thuyết phục khách hàng và tâm lý bán hàng',
    group: 'G2_SEMANTIC',
    description: 'Nhu cầu nâng cao kỹ năng giao tiếp, thuyết phục và chốt sale',
    expectedTitles: [
      'Những Đòn Tâm Lý Trong Thuyết Phục (Influence)',
      'Bí Quyết Giao Tiếp Thuyết Phục',
      'Never Split the Difference',
    ],
    gradedRelevance: {
      'Những Đòn Tâm Lý Trong Thuyết Phục (Influence)': 3,
      'Bí Quyết Giao Tiếp Thuyết Phục': 3,
      'Never Split the Difference': 2,
      'Nghệ Thuật Bán Hàng Cho Người Giàu': 2,
    },
  },

  // =========================================================================
  // G3: TYPO / KHÔNG DẤU (6 câu) - Gõ nhanh, gõ sai, gõ tiếng Việt không dấu
  // Kỳ vọng: AI bù trừ không gian vector khi FTS bị gãy mặt chữ
  // =========================================================================
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
  {
    id: 20,
    query: 'tu duy nhanh va cham daniel kahneman',
    group: 'G3_TYPO',
    description: 'Tìm sách Tư Duy Nhanh Và Chậm gõ không dấu',
    expectedTitles: [
      'Tư Duy Nhanh Và Chậm (Thinking, Fast and Slow)',
      'Thinking, Fast and Slow',
    ],
    gradedRelevance: {
      'Tư Duy Nhanh Và Chậm (Thinking, Fast and Slow)': 3,
      'Thinking, Fast and Slow': 2,
    },
  },
  {
    id: 21,
    query: 'sherlock holmes tham tu pha an',
    group: 'G3_TYPO',
    description: 'Tìm truyện trinh thám Sherlock Holmes gõ không dấu',
    expectedTitles: [
      'Sherlock Holmes: Toàn Tập (Tập 1)',
      'Sherlock Holmes: Toàn Tập (Tập 2)',
    ],
    gradedRelevance: {
      'Sherlock Holmes: Toàn Tập (Tập 1)': 3,
      'Sherlock Holmes: Toàn Tập (Tập 2)': 2,
      'Sherlock Holmes Toàn Tập': 2,
    },
  },
  {
    id: 22,
    query: 'lap trinh python cho nguoi moi bat dau',
    group: 'G3_TYPO',
    description: 'Tìm sách học lập trình Python tiếng Việt không dấu',
    expectedTitles: [
      'Lập Trình Python Cho Người Mới Bắt Đầu',
      'Python Crash Course',
    ],
    gradedRelevance: {
      'Lập Trình Python Cho Người Mới Bắt Đầu': 3,
      'Python Crash Course': 2,
      'Fluent Python': 1,
    },
  },

  // =========================================================================
  // G4: NEGATIVE / OUT-OF-DOMAIN (4 câu) - Từ khóa rác ngoài phạm vi nhà sách
  // Kỳ vọng: Bộ lọc ngưỡng (Gatekeeper) chặn đứng 100%, trả về rỗng ([])
  // =========================================================================
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
  {
    id: 23,
    query: 'máy giặt cửa ngang samsung inverter tiết kiệm điện',
    group: 'G4_NEGATIVE',
    description: 'Từ khóa ngoài ngành (điện gia dụng / điện máy)',
    expectedTitles: [],
    mustNotMatch: true,
  },
  {
    id: 24,
    query: 'đặt phòng khách sạn resort view biển nha trang phú quốc',
    group: 'G4_NEGATIVE',
    description: 'Từ khóa ngoài ngành (dịch vụ lưu trú khách sạn)',
    expectedTitles: [],
    mustNotMatch: true,
  },
];
