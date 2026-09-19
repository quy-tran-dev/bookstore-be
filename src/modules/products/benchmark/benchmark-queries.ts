export interface BenchmarkQueryItem {
  id: number;
  query: string;
  group: 'G1_EXACT' | 'G2_SEMANTIC' | 'G3_TYPO' | 'G4_NEGATIVE';
  description: string;
  expectedTitles: string[]; 
  mustNotMatch?: boolean; 
}

export const BENCHMARK_QUERIES: BenchmarkQueryItem[] = [
  // G1: EXACT MATCH (3 câu) - Khớp chính xác tên tựa sách kinh điển
  // Kỳ vọng: FTS chiếm ưu thế tuyệt đối, sách phải xuất hiện ở Top 1
  {
    id: 1,
    query: 'Clean Code',
    group: 'G1_EXACT',
    description: 'Tìm chính xác tựa sách Lập trình Clean Code',
    expectedTitles: ['Clean Code - Mã Sạch', 'The Clean Coder'],
  },
  {
    id: 2,
    query: 'Đắc Nhân Tâm',
    group: 'G1_EXACT',
    description: 'Tìm chính xác sách Kỹ năng Đắc Nhân Tâm',
    expectedTitles: ['Đắc Nhân Tâm'],
  },
  {
    id: 3,
    query: 'Nhà Giả Kim',
    group: 'G1_EXACT',
    description: 'Tìm chính xác tiểu thuyết kinh điển Nhà Giả Kim',
    expectedTitles: ['Nhà Giả Kim (The Alchemist)'],
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
  },

  // G3: TYPO / KHÔNG DẤU (3 câu) - Gõ nhanh, gõ sai, gõ tiếng Việt không dấu
  // Kỳ vọng: AI bù trừ không gian vector khi FTS bị gãy mặt chữ
  {
    id: 8,
    query: 'clean code ma sach',
    group: 'G3_TYPO',
    description: 'Tìm tên sách Clean Code tiếng Việt không dấu',
    expectedTitles: ['Clean Code - Mã Sạch'],
  },
  {
    id: 9,
    query: 'dac nhan tam dale carnegie',
    group: 'G3_TYPO',
    description: 'Tìm sách Đắc Nhân Tâm không dấu kèm tác giả',
    expectedTitles: ['Đắc Nhân Tâm'],
  },
  {
    id: 10,
    query: 'nha gia kim paulo coelho',
    group: 'G3_TYPO',
    description: 'Tìm tiểu thuyết Nhà Giả Kim không dấu kèm tác giả',
    expectedTitles: ['Nhà Giả Kim (The Alchemist)'],
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
