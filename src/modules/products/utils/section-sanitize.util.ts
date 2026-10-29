import { SectionBlock } from '../interfaces/section.interface';

export class SectionSanitizeUtil {
  /**
   * Làm sạch một chuỗi văn bản:
   * - Loại bỏ hoàn toàn các thẻ script độc hại (<script>...</script>)
   * - Loại bỏ các thẻ iframe, object, embed
   * - Loại bỏ các thuộc tính bắt sự kiện inline nguy hiểm (onload, onerror, onclick, v.v.)
   * - Loại bỏ giao thức javascript:
   */
  static sanitizeText(input: string = ''): string {
    if (!input || typeof input !== 'string') return '';

    let clean = input;

    // 1. Xóa toàn bộ thẻ <script>...</script>
    clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // 2. Xóa các thẻ nguy hiểm khác (iframe, embed, object, form)
    clean = clean.replace(/<\/?(iframe|embed|object|form)[^>]*>/gi, '');

    // 3. Xóa các thuộc tính bắt sự kiện inline: on\w+="...", on\w+='...'
    clean = clean.replace(/\s*on\w+\s*=\s*(["']).*?\1/gi, '');
    clean = clean.replace(/\s*on\w+\s*=\s*[^>\s]+/gi, '');

    // 4. Khử URL có javascript: hoặc data:text/html
    clean = clean.replace(/(javascript|data|vbscript):/gi, '');

    return clean.trim();
  }

  /**
   * Kiểm tra và làm sạch URL (chỉ cho phép http://, https:// hoặc đường dẫn nội bộ bắt đầu bằng /)
   */
  static sanitizeUrl(url: string = ''): string {
    if (!url || typeof url !== 'string') return '';
    const trimmed = this.sanitizeText(url);
    if (
      /^https?:\/\//i.test(trimmed) ||
      (trimmed.startsWith('/') && !trimmed.startsWith('//'))
    ) {
      return trimmed;
    }
    return '';
  }

  /**
   * Duyệt qua toàn bộ danh sách Sections và làm sạch từng phần tử text/url
   */
  static sanitizeSections(sections: any[] = []): SectionBlock[] {
    if (!sections || !Array.isArray(sections)) return [];

    return sections.map((block: any, index: number) => {
      const sanitized: SectionBlock = {
        id: block.id ? this.sanitizeText(String(block.id)) : `blk-${Date.now()}-${index}`,
        order: block.order !== undefined ? Number(block.order) : index + 1,
        type: block.type || 'paragraph',
        style: block.style,
      };

      if (block.content) {
        sanitized.content = this.sanitizeText(String(block.content));
      }

      if (block.heading) {
        sanitized.heading = {
          level: [1, 2, 3, 4].includes(Number(block.heading.level))
            ? (Number(block.heading.level) as 1 | 2 | 3 | 4)
            : 2,
          text: this.sanitizeText(String(block.heading.text || '')),
        };
      }

      if (block.image) {
        sanitized.image = {
          mediaId: block.image.mediaId
            ? this.sanitizeText(String(block.image.mediaId))
            : undefined,
          url: this.sanitizeUrl(block.image.url || ''),
          altText: this.sanitizeText(String(block.image.altText || '')),
          caption: block.image.caption
            ? this.sanitizeText(String(block.image.caption))
            : undefined,
          width: block.image.width ? Number(block.image.width) : undefined,
          height: block.image.height ? Number(block.image.height) : undefined,
        };
      }

      if (block.video) {
        sanitized.video = {
          provider: block.video.provider === 'direct' ? 'direct' : 'youtube',
          url: this.sanitizeUrl(block.video.url || ''),
          caption: block.video.caption
            ? this.sanitizeText(String(block.video.caption))
            : undefined,
        };
      }

      if (block.list && Array.isArray(block.list.items)) {
        sanitized.list = {
          format: block.list.format || 'unordered',
          items: block.list.items.map((item: any) => this.sanitizeText(String(item))),
        };
      }

      return sanitized;
    });
  }
}
