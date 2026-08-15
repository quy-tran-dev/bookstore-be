import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '@app/common/base/base.entity';
import { StatusCategory } from '@app/common/enums/status-category.enum';

@Entity('categories')
export class Category extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name?: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug?: string;

  // --- TRẠNG THÁI HIỂN THỊ ---
  @Column({ type: 'boolean', default: false })
  isVerified?: boolean; // true = Đã duyệt, false = Nháp/Đang chỉnh sửa

  @Column({ type: 'int', default: StatusCategory.INACTIVE })
  status?: number; // 1 = Hiển thị (Active), 0 = Ẩn (Inactive)

  @Column({ name: 'parent_id', nullable: true })
  parentId?: string;

  // Quan hệ trỏ lên cha
  @ManyToOne(() => Category, (category) => category.children, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_id' })
  parent?: Category;

  // Quan hệ trỏ xuống các con
  @OneToMany(() => Category, (category) => category.parent)
  children?: Category[];
}