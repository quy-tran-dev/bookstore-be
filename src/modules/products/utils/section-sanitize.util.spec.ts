import { SectionSanitizeUtil } from './section-sanitize.util';

describe('SectionSanitizeUtil - Kiểm thử lọc mã độc XSS và chuẩn hóa dữ liệu Section', () => {
  describe('sanitizeText', () => {
    it('phải loại bỏ hoàn toàn cặp thẻ <script>...</script>', () => {
      const dirty = 'Xin chào <script>alert("XSS")</script> thế giới sách!';
      expect(SectionSanitizeUtil.sanitizeText(dirty)).toBe(
        'Xin chào  thế giới sách!',
      );
    });

    it('phải loại bỏ các thẻ nguy hiểm như iframe, object, embed, form', () => {
      const dirty =
        'Đoạn văn <iframe src="https://evil.com"></iframe> và <object data="hack.swf"></object>';
      expect(SectionSanitizeUtil.sanitizeText(dirty)).toBe('Đoạn văn  và');
    });

    it('phải loại bỏ các thuộc tính bắt sự kiện inline (onerror, onload, onclick)', () => {
      const dirty =
        'Nội dung <img src="cover.jpg" onerror="stealToken()" onload=\'run()\' /> an toàn';
      const cleaned = SectionSanitizeUtil.sanitizeText(dirty);
      expect(cleaned).not.toContain('onerror');
      expect(cleaned).not.toContain('onload');
      expect(cleaned).toContain('<img src="cover.jpg" /> an toàn');
    });

    it('phải khử các giao thức javascript:, data:, vbscript:', () => {
      const dirty = 'Liên kết javascript:alert(1) và data:text/html,<script>';
      const cleaned = SectionSanitizeUtil.sanitizeText(dirty);
      expect(cleaned).not.toContain('javascript:');
      expect(cleaned).not.toContain('data:');
    });
  });

  describe('sanitizeUrl', () => {
    it('chỉ chấp nhận URL hợp lệ bắt đầu bằng http://, https:// hoặc đường dẫn nội bộ /', () => {
      expect(
        SectionSanitizeUtil.sanitizeUrl('https://cdn.bookstore.vn/book.jpg'),
      ).toBe('https://cdn.bookstore.vn/book.jpg');
      expect(
        SectionSanitizeUtil.sanitizeUrl('/uploads/products/clean-code.png'),
      ).toBe('/uploads/products/clean-code.png');
    });

    it('phải trả về chuỗi rỗng nếu URL chứa giao thức độc hại hoặc đường dẫn không hợp lệ', () => {
      expect(SectionSanitizeUtil.sanitizeUrl('javascript:alert(1)')).toBe('');
      expect(
        SectionSanitizeUtil.sanitizeUrl('data:image/svg+xml;base64,PHN2Zz4='),
      ).toBe('');
      expect(SectionSanitizeUtil.sanitizeUrl('//evil-domain.com/payload')).toBe(
        '',
      );
    });
  });

  describe('sanitizeSections', () => {
    it('phải làm sạch toàn bộ các khối heading, paragraph, image, video và list', () => {
      const rawSections = [
        {
          id: 'blk-1',
          type: 'heading',
          heading: {
            level: 2,
            text: 'Chương 1 <script>evil()</script>',
          },
        },
        {
          id: 'blk-2',
          type: 'paragraph',
          content: 'Nội dung <b onclick="hack()">quan trọng</b> của sách.',
        },
        {
          id: 'blk-3',
          type: 'image',
          image: {
            url: 'javascript:evil()',
            altText: 'Ảnh bìa <iframe src="x"></iframe> sách',
          },
        },
        {
          id: 'blk-4',
          type: 'list',
          list: {
            format: 'unordered',
            items: ['Ý thứ nhất <script>alert(1)</script>', 'Ý thứ hai'],
          },
        },
      ];

      const result = SectionSanitizeUtil.sanitizeSections(rawSections);

      expect(result).toHaveLength(4);
      expect(result[0].heading?.text).toBe('Chương 1');
      expect(result[1].content).toBe('Nội dung <b>quan trọng</b> của sách.');
      expect(result[2].image?.url).toBe('');
      expect(result[2].image?.altText).toBe('Ảnh bìa  sách');
      expect(result[3].list?.items).toEqual(['Ý thứ nhất', 'Ý thứ hai']);
    });
  });
});
