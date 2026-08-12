import { DataSource } from 'typeorm';
import { Product } from '../../modules/products/entities/product.entity';
import { Author } from '../../modules/products/entities/author.entity';
import { Category } from '../../modules/categories/entities/category.entity';
import { SlugUtil } from '../../common/utils/slug.util';
import { StatusCategory } from '@app/common/enums/status-category.enum';
import { StatusProduct } from '@app/common/enums/status-product.enum';

export const seedProducts = async (dataSource: DataSource) => {
  console.log('\n Đang reset Products & Authors...');
  
  const productRepo = dataSource.getRepository(Product);
  const authorRepo = dataSource.getRepository(Author);
  const categoryRepo = dataSource.getRepository(Category);

  // 1. Reset sạch sẽ dữ liệu
  await dataSource.query(`TRUNCATE TABLE "authors", "products", "book_details", "product_categories", "book_authors" CASCADE`);
  
  console.log('\n Đang tạo seed 35+ Products & Authors...');

  // 2. Helper lấy hoặc tạo Danh mục
  const getOrCreateCat = async (slug: string, name: string) => {
    let cat = await categoryRepo.findOne({ where: { slug } });
    if (!cat) cat = await categoryRepo.save(categoryRepo.create({ name, slug, isVerified: true, status: StatusCategory.ACTIVE }));
    return cat;
  };

  // Chuẩn bị sẵn các danh mục
  const catTieuThuyet = await getOrCreateCat('tieu-thuyet', 'Tiểu Thuyết');
  const catKyNang = await getOrCreateCat('ky-nang-song', 'Kỹ Năng Sống');
  const catQuanTri = await getOrCreateCat('quan-tri-kinh-doanh', 'Quản Trị Kinh Doanh');
  const catMarketing = await getOrCreateCat('marketing-ban-hang', 'Marketing & Bán Hàng');
  const catLapTrinh = await getOrCreateCat('lap-trinh-cntt', 'Lập Trình & CNTT');

  const categoryMap: Record<string, Category> = {
    'tieu-thuyet': catTieuThuyet,
    'ky-nang-song': catKyNang,
    'quan-tri': catQuanTri,
    'marketing': catMarketing,
    'lap-trinh': catLapTrinh,
  };

  // 3. Helper lấy hoặc tạo Tác giả
  const getOrCreateAuthor = async (name: string) => {
    let author = await authorRepo.findOne({ where: { name } });
    if (!author) {
      author = await authorRepo.save(authorRepo.create({ name, describe: `Tác giả nổi tiếng: ${name}` }));
    }
    return author;
  };

  // 4. Data 35 quyển sách đa dạng
  const rawBooks = [
    // --- SÁCH LẬP TRÌNH & CNTT ---
    { name: 'Clean Code', author: 'Robert C. Martin', cat: 'lap-trinh', price: 350000, desc: 'Cuốn sách gối đầu giường của mọi lập trình viên, hướng dẫn viết code sạch, dễ đọc và dễ bảo trì.' },
    { name: 'The Pragmatic Programmer', author: 'Andrew Hunt', cat: 'lap-trinh', price: 420000, desc: 'Hành trình từ một thợ gõ code trở thành một nghệ nhân phần mềm thực thụ.' },
    { name: 'Design Patterns: Elements of Reusable Object-Oriented Software', author: 'Erich Gamma', cat: 'lap-trinh', price: 550000, desc: 'Kinh thánh về các mẫu thiết kế hướng đối tượng (GoF).' },
    { name: 'Refactoring: Improving the Design of Existing Code', author: 'Martin Fowler', cat: 'lap-trinh', price: 480000, desc: 'Nghệ thuật tái cấu trúc mã nguồn mà không làm thay đổi hành vi bên ngoài.' },
    { name: 'Cracking the Coding Interview', author: 'Gayle Laakmann McDowell', cat: 'lap-trinh', price: 390000, desc: 'Cẩm nang 189 câu hỏi phỏng vấn lập trình tại các tập đoàn công nghệ lớn.' },
    { name: 'Grokking Algorithms', author: 'Aditya Bhargava', cat: 'lap-trinh', price: 250000, desc: 'Học thuật toán qua hình ảnh minh họa cực kỳ dễ hiểu và trực quan.' },
    { name: 'Head First Design Patterns', author: 'Eric Freeman', cat: 'lap-trinh', price: 400000, desc: 'Cách tiếp cận trực quan nhất để nắm vững các mẫu thiết kế phần mềm.' },

    // --- TIỂU THUYẾT ---
    { name: 'Nhà Giả Kim (The Alchemist)', author: 'Paulo Coelho', cat: 'tieu-thuyet', price: 79000, desc: 'Truyền cảm hứng mãnh liệt về việc theo đuổi ước mơ và vận mệnh của chính mình.' },
    { name: 'Bố Già (The Godfather)', author: 'Mario Puzo', cat: 'tieu-thuyet', price: 120000, desc: 'Bức tranh toàn cảnh về thế giới ngầm Mafia tại Mỹ và những quy tắc sinh tồn.' },
    { name: 'Hai Số Phận (Kane and Abel)', author: 'Jeffrey Archer', cat: 'tieu-thuyet', price: 145000, desc: 'Cuộc chiến kéo dài hàng thập kỷ giữa hai người đàn ông sinh cùng ngày, cùng tháng, cùng năm.' },
    { name: 'Suối Nguồn (The Fountainhead)', author: 'Ayn Rand', cat: 'tieu-thuyet', price: 210000, desc: 'Tác phẩm vĩ đại về chủ nghĩa cá nhân và sự toàn vẹn của sáng tạo nghệ thuật.' },
    { name: 'Giết Con Chim Nhại', author: 'Harper Lee', cat: 'tieu-thuyet', price: 95000, desc: 'Góc nhìn ngây thơ của trẻ con về những vấn đề sâu sắc như phân biệt chủng tộc và bất công xã hội.' },
    { name: 'Mật Mã Da Vinci', author: 'Dan Brown', cat: 'tieu-thuyet', price: 130000, desc: 'Cuộc phiêu lưu giải mã những bí ẩn tôn giáo chấn động lịch sử.' },
    { name: 'Harry Potter và Hòn Đá Phù Thủy', author: 'J.K. Rowling', cat: 'tieu-thuyet', price: 115000, desc: 'Cánh cửa mở ra thế giới phép thuật huyền diệu của cậu bé có vết sẹo hình tia chớp.' },
    { name: 'Đại Gia Gatsby', author: 'F. Scott Fitzgerald', cat: 'tieu-thuyet', price: 65000, desc: 'Bức tranh hào nhoáng nhưng bi kịch của Giấc mơ Mỹ những năm 1920.' },

    // --- KỸ NĂNG SỐNG ---
    { name: 'Đắc Nhân Tâm', author: 'Dale Carnegie', cat: 'ky-nang-song', price: 86000, desc: 'Nghệ thuật thu phục lòng người và giao tiếp đỉnh cao nhất mọi thời đại.' },
    { name: 'Atomic Habits (Thay Đổi Tí Hon Hiệu Quả To Lớn)', author: 'James Clear', cat: 'ky-nang-song', price: 135000, desc: 'Phương pháp khoa học để xây dựng thói quen tốt và phá bỏ thói quen xấu.' },
    { name: 'Tư Duy Nhanh Và Chậm', author: 'Daniel Kahneman', cat: 'ky-nang-song', price: 195000, desc: 'Khám phá hai hệ thống tư duy điều khiển những quyết định trong cuộc sống của chúng ta.' },
    { name: 'Nghệ Thuật Tinh Tế Của Việc Đếch Quan Tâm', author: 'Mark Manson', cat: 'ky-nang-song', price: 99000, desc: 'Cách tiếp cận ngược đời nhưng thực tế để sống một cuộc đời trọn vẹn hơn.' },
    { name: 'Đọc Vị Bất Kỳ Ai', author: 'David J. Lieberman', cat: 'ky-nang-song', price: 85000, desc: 'Kỹ năng nắm bắt tâm lý để không bao giờ bị lừa dối hay lợi dụng.' },
    { name: 'Sức Mạnh Của Thói Quen', author: 'Charles Duhigg', cat: 'ky-nang-song', price: 125000, desc: 'Cơ chế hoạt động của thói quen và cách ứng dụng nó để thành công.' },
    { name: '7 Thói Quen Để Thành Đạt', author: 'Stephen R. Covey', cat: 'ky-nang-song', price: 140000, desc: 'Khuôn mẫu tư duy để đạt được sự hiệu quả trong cả công việc lẫn cuộc sống.' },
    { name: 'Đánh Thức Con Người Phi Thường Trong Bạn', author: 'Anthony Robbins', cat: 'ky-nang-song', price: 180000, desc: 'Khai phá tiềm năng vô hạn đang ngủ quên bên trong bạn.' },

    // --- QUẢN TRỊ KINH DOANH ---
    { name: 'Từ Tốt Đến Vĩ Đại', author: 'Jim Collins', cat: 'quan-tri', price: 130000, desc: 'Những công ty nhảy vọt đã làm gì để thoát khỏi sự bình thường?' },
    { name: 'Khởi Nghiệp Tinh Gọn (The Lean Startup)', author: 'Eric Ries', cat: 'quan-tri', price: 110000, desc: 'Phương pháp đổi mới liên tục để xây dựng các doanh nghiệp thành công.' },
    { name: 'Không Đến Một (Zero to One)', author: 'Peter Thiel', cat: 'quan-tri', price: 120000, desc: 'Cách xây dựng các công ty tạo ra những điều mới mẻ cho tương lai.' },
    { name: 'Chiến Lược Đại Dương Xanh', author: 'W. Chan Kim', cat: 'quan-tri', price: 160000, desc: 'Làm thế nào để tạo ra khoảng trống thị trường không cạnh tranh?' },
    { name: 'Nghĩ Giàu Làm Giàu', author: 'Napoleon Hill', cat: 'quan-tri', price: 95000, desc: '13 nguyên tắc nghĩ giàu làm giàu được đúc kết từ hàng trăm tỷ phú.' },
    { name: 'Cha Giàu Cha Nghèo', author: 'Robert Kiyosaki', cat: 'quan-tri', price: 105000, desc: 'Bài học về tài chính và cách tiền bạc hoạt động mà trường học không dạy bạn.' },
    
    // --- MARKETING & BÁN HÀNG ---
    { name: 'Tiếp Thị 4.0 (Marketing 4.0)', author: 'Philip Kotler', cat: 'marketing', price: 125000, desc: 'Chuyển dịch chiến lược marketing từ truyền thống sang kỷ nguyên số.' },
    { name: 'Điểm Bùng Phát (The Tipping Point)', author: 'Malcolm Gladwell', cat: 'marketing', price: 115000, desc: 'Những điều nhỏ bé có thể tạo ra sự thay đổi lớn lao như thế nào?' },
    { name: 'Hooked: Trải Nghiệm Khách Hàng Xuất Sắc', author: 'Nir Eyal', cat: 'marketing', price: 135000, desc: 'Mô hình tạo ra những sản phẩm hình thành thói quen cho người dùng.' },
    { name: 'Bí Mật DotCom', author: 'Russell Brunson', cat: 'marketing', price: 155000, desc: 'Công thức xây dựng phễu bán hàng (Sales Funnel) online đạt doanh thu triệu đô.' },
    { name: 'Contagious (Hiệu Ứng Lan Truyền)', author: 'Jonah Berger', cat: 'marketing', price: 110000, desc: 'Tại sao một số sản phẩm và ý tưởng lại trở nên viral?' },
    { name: 'Con Bò Tía (Purple Cow)', author: 'Seth Godin', cat: 'marketing', price: 85000, desc: 'Khác biệt hoặc là chết trong thời đại tiếp thị bão hòa.' },
  ];

  console.log(`\n Đang tiến hành Insert ${rawBooks.length} cuốn sách...`);

  // 5. Vòng lặp insert dữ liệu
  for (const book of rawBooks) {
    const author = await getOrCreateAuthor(book.author);
    const category = categoryMap[book.cat];
    
    const costPrice = Math.floor(book.price * 0.6); // Giá vốn = 60% giá bán
    const discountPrice = Math.floor(book.price * 0.85); // Khuyến mãi 15%

    const productPayload = {
      name: book.name,
      slug: SlugUtil.generate(book.name),
      // Dùng placeholder tự động gen chữ cho từng quyển sách để giao diện khỏi nhàm chán
      img: `https://placehold.co/400x600/2a2a2a/ffffff?text=${encodeURIComponent(book.name.split(' ').slice(0,3).join(' '))}...`,
      shortDescribe: book.desc,
      cost: costPrice,
      price: book.price,
      finalPrice: discountPrice,
      stockQuantity: Math.floor(Math.random() * 200) + 10, // Random từ 10 -> 210 quyển
      soldCount: Math.floor(Math.random() * 1000), // Random số lượng đã bán
      isVerified: true,
      status: StatusProduct.ACTIVE,
      bookDetail: {
        title: book.name,
        describe: `${book.desc} Tác phẩm được đánh giá cực kỳ cao bởi giới chuyên môn và cộng đồng người đọc.`,
        publisher: 'NXB Tổng Hợp', // Mock data
        publishYear: 2020 + Math.floor(Math.random() * 5),
        language: 'Tiếng Việt',
        format: Math.random() > 0.5 ? 'Bìa mềm' : 'Bìa cứng',
        pageCount: Math.floor(Math.random() * 300) + 150,
      },
      categories: category ? [{ id: category.id }] : [],
      authors: [{ id: author.id }]
    };

    await productRepo.save(productRepo.create(productPayload as any));
  }

  console.log('  Seed toàn bộ dữ liệu thật thành công!');
};