export class SlugUtil {
  static generate(text: string): string {
    if (!text) return '';

    let slug = text;

    // 0. Xử lý riêng chữ Đ/đ
    slug = slug.replace(/Đ/g, 'D').replace(/đ/g, 'd');

    // 1. Bỏ dấu tiếng Việt (chuyển NFD và xóa các ký tự dấu)
    slug = slug.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 2. Xóa các ký tự đặc biệt, chuyển thành chữ thường
    slug = slug.replace(/[^\w\s-]/g, '').trim().toLowerCase();

    // 3. Thay khoảng trắng bằng dấu gạch ngang
    slug = slug.replace(/[-\s]+/g, '-');

    return slug;
  }
}