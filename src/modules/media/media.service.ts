import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@app/common/base/base.service';
import { Media } from './entities/media.entity';
import * as fs from 'fs';
import { join } from 'path';

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

  async getGroupedMedia() {
    // Lấy toàn bộ ảnh, sắp xếp theo thời gian mới nhất
    const allMedia = await this.mediaRepository.find({
      order: { createdAt: 'DESC' }
    });

    // Dùng thuật toán Reduce để nhóm data thành Object O(n)
    const groupedData = allMedia.reduce((acc, media) => {
      // Nếu folderPath bị null/empty thì gán vào 'general'
      const key = media.folderPath || 'general'; 
      
      if (!acc[key]) {
        acc[key] = []; // Khởi tạo mảng nếu key chưa tồn tại
      }
      
      acc[key].push(media);
      return acc;
    }, {} as Record<string, Media[]>);

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
    return folders.map(f => ({
      folderPath: f.folderPath, // VD: "products/nghe-thuat-sinh-ton"
      totalFiles: Number(f.totalFiles), // Trả về số lượng để FE hiện Badge (vd: 15 ảnh)
    }));
  }

  async hardDelete(id: string): Promise<void> {
    // Phải thêm withDeleted: true phòng trường hợp ảnh đã bị soft delete trước đó
    const media = await this.mediaRepository.findOne({ 
      where: { id },
      withDeleted: true 
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
