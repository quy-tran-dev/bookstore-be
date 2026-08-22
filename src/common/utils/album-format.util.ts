import { BadRequestException } from '@nestjs/common';

// --- HELPER CHUẨN HÓA ALBUM ---
export class AlbumFormatUtil {
  static formatAlbumsOrder(albums: any[]) {
    if (!albums || albums.length === 0) return albums;

    // 1. Chia mảng thành 3 nhóm
    const hiddenImages = albums.filter((a) => a.displayOrder === 0);
    const mainImages = albums.filter((a) => a.displayOrder === 1);
    const subImages = albums.filter((a) => a.displayOrder > 1);

    // 2. Validate Nhóm Main Image
    if (mainImages.length > 1) {
      throw new BadRequestException(
        'Sản phẩm chỉ được phép có ĐÚNG 1 ảnh chính (displayOrder = 1)',
      );
    }

    let processedMainImages = [...mainImages];
    let processedSubImages = [...subImages];

    // Nếu không có ảnh Main nào, nhưng lại có ảnh Sub -> Ép thằng Sub đầu tiên lên làm Main
    if (processedMainImages.length === 0 && processedSubImages.length > 0) {
      processedSubImages.sort((a, b) => a.displayOrder - b.displayOrder);
      const forcedMain = processedSubImages.shift(); // Lấy thằng đầu ra
      forcedMain.displayOrder = 1;
      processedMainImages.push(forcedMain);
    }

    // 3. Auto-increment cho nhóm Sub Images (Nâng order liên tục: 2, 3, 4...)
    // Đảm bảo không bị trùng index hoặc nhảy số lộn xộn
    processedSubImages.sort((a, b) => a.displayOrder - b.displayOrder);
    processedSubImages.forEach((img, index) => {
      img.displayOrder = index + 2; // Index mảng bắt đầu từ 0 -> +2 sẽ thành 2, 3, 4...
    });

    // Trả về mảng đã được dọn dẹp sạch sẽ
    return [...processedMainImages, ...processedSubImages, ...hiddenImages];
  }
}
