import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BaseService } from '@app/common/base/base.service';
import { Media } from './entities/media.entity';
import * as fs from 'fs';
import { join } from 'path';
import * as fsPromises from 'fs/promises';

@Injectable()
export class MediaService extends BaseService<Media> {
  constructor(
    @InjectRepository(Media)
    private readonly mediaRepository: Repository<Media>,
  ) {
    super(mediaRepository);
  }

  // --- HÀM DI CHUYỂN FILE SANG SUB-FOLDER ---
  async moveMediaToSubfolder(
    mediaId: string,
    baseFolder: string,
    subFolder: string,
  ): Promise<Media | null> {
    const media = await this.mediaRepository.findOne({
      where: { id: mediaId },
    });
    if (!media || !media.fileUrl) return null;

    // Lấy tên file vật lý (VD: uuid.jpg) từ fileUrl cũ
    const physicalName = media.fileUrl.split('/').pop();
    if (!physicalName) return media;

    // Nếu ảnh đã nằm đúng thư mục đích rồi thì bỏ qua
    const targetUrlPath = `/uploads/${baseFolder}/${subFolder}/${physicalName}`;
    if (media.fileUrl === targetUrlPath) return media;

    // Xử lý đường dẫn vật lý trên server
    const oldPhysicalPath = join('.', 'public', media.fileUrl);
    const newDirPath = join('.', 'public', 'uploads', baseFolder, subFolder);
    const newPhysicalPath = join(newDirPath, physicalName);

    // Tạo thư mục đích nếu chưa có
    if (!fs.existsSync(newDirPath)) {
      fs.mkdirSync(newDirPath, { recursive: true });
    }

    // Di chuyển file vật lý
    if (fs.existsSync(oldPhysicalPath)) {
      fs.renameSync(oldPhysicalPath, newPhysicalPath);

      // Cập nhật lại DB với đường dẫn mới
      media.fileUrl = targetUrlPath;
      media.folderPath = `${baseFolder}/${subFolder}`;
      await this.mediaRepository.save(media);
    }

    return media;
  }

  async moveMediaGroupToSubfolder(
    mediaIds: string[] ,
    baseFolder: string,
    subFolder: string,
  ): Promise<Media[]> {
    if (!mediaIds || mediaIds.length === 0) return [];

    // 1. Lấy tất cả media trong đúng 1 câu Query
    const medias = await this.mediaRepository.findBy({
      id: In(mediaIds),
    });

    if (medias.length === 0) return [];

    const newDirPath = join('.', 'public', 'uploads', baseFolder, subFolder);

    // 2. Kiểm tra và tạo thư mục đích đúng 1 lần duy nhất
    if (!fs.existsSync(newDirPath)) {
      await fsPromises.mkdir(newDirPath, { recursive: true });
    }

    const mediasToUpdate: Media[] = [];
    const movePromises: Promise<void>[] = [];

    // 3. Xử lý logic di chuyển file
    for (const media of medias) {
      if (!media.fileUrl) continue;

      const physicalName = media.fileUrl.split('/').pop();
      if (!physicalName) continue;

      const targetUrlPath = `/uploads/${baseFolder}/${subFolder}/${physicalName}`;

      // Nếu đã nằm đúng chỗ rồi thì bỏ qua
      if (media.fileUrl === targetUrlPath) continue;

      const oldPhysicalPath = join('.', 'public', media.fileUrl);
      const newPhysicalPath = join(newDirPath, physicalName);

      if (fs.existsSync(oldPhysicalPath)) {
        // Đưa lệnh chuyển file vào mảng để chạy song song
        movePromises.push(fsPromises.rename(oldPhysicalPath, newPhysicalPath));

        // Cập nhật giá trị trên RAM
        media.fileUrl = targetUrlPath;
        media.folderPath = `${baseFolder}/${subFolder}`;
        mediasToUpdate.push(media);
      }
    }

    // 4. Chờ tất cả file vật lý được di chuyển xong (Chạy song song cực nhanh)
    if (movePromises.length > 0) {
      await Promise.all(movePromises);
    }

    // 5. Cập nhật Database hàng loạt (Bulk Save) bằng 1 câu lệnh duy nhất
    if (mediasToUpdate.length > 0) {
      await this.mediaRepository.save(mediasToUpdate);
    }

    return mediasToUpdate;
  }

  async getGroupedMedia() {
    // Lấy toàn bộ ảnh, sắp xếp theo thời gian mới nhất
    const allMedia = await this.mediaRepository.find({
      order: { createdAt: 'DESC' },
    });

    // Dùng thuật toán Reduce để nhóm data thành Object O(n)
    const groupedData = allMedia.reduce(
      (acc, media) => {
        // Nếu folderPath bị null/empty thì gán vào 'general'
        const key = media.folderPath || 'general';

        if (!acc[key]) {
          acc[key] = []; // Khởi tạo mảng nếu key chưa tồn tại
        }

        acc[key].push(media);
        return acc;
      },
      {} as Record<string, Media[]>,
    );

    return groupedData;
  }

  async getFolderStats() {
    // Dùng QueryBuilder để GROUP BY và COUNT
    const folders = await this.mediaRepository
      .createQueryBuilder('media')
      .select('media.folder_path', 'folderPath')
      .addSelect('COUNT(media.id)', 'totalFiles')
      .groupBy('media.folder_path')
      .orderBy('media.folder_path', 'ASC')
      .getRawMany();

    // Map lại data cho đẹp
    return folders.map((f) => ({
      folderPath: f.folderPath, // VD: "products/nghe-thuat-sinh-ton"
      totalFiles: Number(f.totalFiles), // Trả về số lượng để FE hiện Badge (vd: 15 ảnh)
    }));
  }

  async hardDelete(id: string): Promise<void> {
    // Phải thêm withDeleted: true phòng trường hợp ảnh đã bị soft delete trước đó
    const media = await this.mediaRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!media) throw new NotFoundException('Không tìm thấy file');

    // Xóa file vật lý trên ổ cứng
    if (media.fileUrl) {
      const physicalPath = join('.', 'public', media.fileUrl);
      if (fs.existsSync(physicalPath)) {
        fs.unlinkSync(physicalPath); // Chém bay file
      }
    }

    // Quét sạch record trong Database
    await this.mediaRepository.delete(id);
  }
}
