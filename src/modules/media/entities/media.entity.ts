import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@app/common/base/base.entity';

@Entity('medias')
export class Media extends BaseEntity {
  @Index()
  @Column({
    name: 'folder_path',
    type: 'varchar',
    length: 255,
    default: 'general',
  })
  folderPath?: string;
  
  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName?: string; // Tên file gốc (VD: anh-bia-sach.jpg)

  @Column({ name: 'file_url', type: 'text' })
  fileUrl?: string; // Đường dẫn để hiển thị (VD: /uploads/2026/08/anh-bia-sach.jpg hoặc link S3)

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType?: string; // Kiểu file (VD: image/jpeg, image/png)

  @Column({ type: 'int', default: 0 })
  size?: number; // Kích thước file (tính bằng bytes) để kiểm soát dung lượng

  @Column({ type: 'varchar', length: 50, default: 'local' })
  provider?: string; // Nơi lưu trữ (local, cloudinary, s3...)

  @Column({ name: 'alt_text', type: 'varchar', length: 255, nullable: true })
  altText?: string; // Text thay thế cho ảnh, cực kỳ quan trọng cho SEO bên Next.js
}
