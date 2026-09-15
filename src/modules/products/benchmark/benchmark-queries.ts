export interface BenchmarkQueryItem {
  id: number;
  query: string;
  group: 'G1_EXACT' | 'G2_SEMANTIC' | 'G3_TYPO' | 'G4_NEGATIVE';
  description: string;
  expectedTitles: string[]; // Tên sách hoặc từ khóa xuất hiện trong tên sách mong đợi
  mustNotMatch?: boolean;   // true nếu là query rác (G4), kỳ vọng không trả về sách nào
}

export const BENCHMARK_QUERIES: BenchmarkQueryItem[] = [
  // =========================================================================
  // G1: EXACT MATCH (Tìm chính xác tên sách hoặc tên tác giả - Kỳ vọng FTS Top 1)
  // =========================================================================
  {
    id: 1,
    query: 'Clean Code',
    group: 'G1_EXACT',
    description: 'Tìm chính xác tựa sách Clean Code',
    expectedTitles: ['Clean Code - Mã Sạch', 'The Clean Coder'],
  },
  {
    id: 2,
    query: 'Design Patterns',
    group: 'G1_EXACT',
    description: 'Tìm chính xác tựa sách Design Patterns',
    expectedTitles: ['Design Patterns: Elements of Reusable', 'Head First Design Patterns', 'Node.js Design Patterns'],
  },
  {
    id: 3,
    query: 'Cracking the Coding Interview',
    group: 'G1_EXACT',
    description: 'Tìm chính xác sách luyện phỏng vấn thuật toán',
    expectedTitles: ['Cracking the Coding Interview'],
  },
  {
    id: 4,
    query: 'Robert C. Martin',
    group: 'G1_EXACT',
    description: 'Tìm theo tên tác giả Uncle Bob',
    expectedTitles: ['Clean Code - Mã Sạch', 'Clean Architecture', 'The Clean Coder'],
  },
  {
    id: 5,
    query: 'Grokking Algorithms',
    group: 'G1_EXACT',
    description: 'Tìm chính xác sách thuật toán trực quan',
    expectedTitles: ['Grokking Algorithms - Thuật Toán Trực Quan'],
  },
  {
    id: 6,
    query: 'Building Microservices',
    group: 'G1_EXACT',
    description: 'Tìm chính xác tựa sách microservices',
    expectedTitles: ['Building Microservices', 'Monolith to Microservices'],
  },

  // =========================================================================
  // G2: SEMANTIC / INTENT SEARCH (Tìm theo ý nghĩa / ngữ cảnh / nhu cầu người đọc)
  // =========================================================================
  {
    id: 7,
    query: 'sách dạy viết mã nguồn sạch dễ bảo trì',
    group: 'G2_SEMANTIC',
    description: 'Tìm sách về kỹ năng viết code sạch mà không nhớ tên cụ thể',
    expectedTitles: ['Clean Code - Mã Sạch', 'Refactoring - Cải Thiện Thiết Kế', 'Code Complete (Tập 2)'],
  },
  {
    id: 8,
    query: 'kinh nghiệm phỏng vấn thuật toán công ty công nghệ lớn',
    group: 'G2_SEMANTIC',
    description: 'Tìm tài liệu ôn luyện phỏng vấn Big Tech',
    expectedTitles: ['Cracking the Coding Interview', 'Elements of Programming Interviews (EPI)'],
  },
  {
    id: 9,
    query: 'kiến trúc hệ thống phân tán quy mô lớn',
    group: 'G2_SEMANTIC',
    description: 'Tìm sách thiết kế kiến trúc hệ thống và microservices',
    expectedTitles: ['System Design Interview', 'Building Microservices', 'Clean Architecture'],
  },
  {
    id: 10,
    query: 'tái cấu trúc tối ưu mã nguồn cũ rối rắm',
    group: 'G2_SEMANTIC',
    description: 'Tìm sách hướng dẫn refactor code',
    expectedTitles: ['Refactoring - Cải Thiện Thiết Kế Mã Nguồn Hiện Có'],
  },
  {
    id: 11,
    query: 'sách học cấu trúc dữ liệu và giải thuật trực quan cho người mới',
    group: 'G2_SEMANTIC',
    description: 'Tìm giáo trình thuật toán dễ hiểu cho beginner',
    expectedTitles: ['Grokking Algorithms - Thuật Toán Trực Quan', 'Introduction to Algorithms (CLRS)'],
  },
  {
    id: 12,
    query: 'lập trình web hiện đại với component',
    group: 'G2_SEMANTIC',
    description: 'Tìm sách về phát triển web front-end',
    expectedTitles: ['Learning React: Modern Patterns', 'Eloquent JavaScript (Phiên Bản 3)'],
  },

  // =========================================================================
  // G3: TYPO / KHÔNG DẤU / LỖI CHÍNH TẢ (Kiểm tra độ bù trừ AI khi FTS bị gãy)
  // =========================================================================
  {
    id: 13,
    query: 'clean code ma sach',
    group: 'G3_TYPO',
    description: 'Tìm tên sách tiếng Việt không dấu',
    expectedTitles: ['Clean Code - Mã Sạch'],
  },
  {
    id: 14,
    query: 'thuat toan truc quan',
    group: 'G3_TYPO',
    description: 'Tìm sách thuật toán trực quan không dấu',
    expectedTitles: ['Grokking Algorithms - Thuật Toán Trực Quan'],
  },
  {
    id: 15,
    query: 'microservice sam newman',
    group: 'G3_TYPO',
    description: 'Tìm thiếu chữ s trong microservices và tên tác giả',
    expectedTitles: ['Building Microservices', 'Monolith to Microservices'],
  },
  {
    id: 16,
    query: 'system design alex xu',
    group: 'G3_TYPO',
    description: 'Tìm tên sách và tác giả system design',
    expectedTitles: ["System Design Interview – An Insider's Guide (Volume 1)"],
  },
  {
    id: 17,
    query: 'javascript nang cao',
    group: 'G3_TYPO',
    description: 'Tìm sách chuyên sâu JavaScript không dấu',
    expectedTitles: ['Eloquent JavaScript (Phiên Bản 3)', "You Don't Know JS Yet: Get Started"],
  },
  {
    id: 18,
    query: 'domain driven design ddd',
    group: 'G3_TYPO',
    description: 'Tìm kiến trúc DDD',
    expectedTitles: ['Domain-Driven Design (DDD): Tác Động Vào Lõi Phần Mềm'],
  },

  // =========================================================================
  // G4: NEGATIVE / OUT-OF-DOMAIN (Kiểm tra độ nhiễu / False Positives / Ngưỡng cắt)
  // Kỳ vọng: Hệ thống phải trả về rỗng ([]) hoặc điểm số không vượt qua ngưỡng.
  // =========================================================================
  {
    id: 19,
    query: 'mua bán xe máy honda wave alpha cũ giá rẻ',
    group: 'G4_NEGATIVE',
    description: 'Từ khóa hoàn toàn ngoài ngành sách (xe máy)',
    expectedTitles: [],
    mustNotMatch: true,
  },
  {
    id: 20,
    query: 'vé máy bay khứ hồi hà nội đà nẵng sài gòn',
    group: 'G4_NEGATIVE',
    description: 'Từ khóa ngoài ngành (du lịch / hàng không)',
    expectedTitles: [],
    mustNotMatch: true,
  },
  {
    id: 21,
    query: 'laptop gaming asus rog rtx 4060',
    group: 'G4_NEGATIVE',
    description: 'Từ khóa phần cứng máy tính không phải sách',
    expectedTitles: [],
    mustNotMatch: true,
  },
  {
    id: 22,
    query: 'hướng dẫn nấu món canh chua cá lóc miền tây',
    group: 'G4_NEGATIVE',
    description: 'Công thức ẩm thực ngoài phạm vi cửa hàng',
    expectedTitles: [],
    mustNotMatch: true,
  },
  {
    id: 23,
    query: 'thuốc giảm cân cấp tốc an toàn hiệu quả',
    group: 'G4_NEGATIVE',
    description: 'Sản phẩm y tế dược phẩm',
    expectedTitles: [],
    mustNotMatch: true,
  },
  {
    id: 24,
    query: 'dịch vụ vá lốp xe ô tô lưu động 24 7',
    group: 'G4_NEGATIVE',
    description: 'Dịch vụ sửa chữa xe cộ',
    expectedTitles: [],
    mustNotMatch: true,
  },
];
