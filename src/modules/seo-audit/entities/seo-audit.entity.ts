import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@app/common/base/base.entity';
import { Product } from '../../products/entities/product.entity';
import type {
  SeoAuditChecklist,
  SeoGrade,
  SeoSectionFeedback,
} from '../interfaces/seo-audit-result.interface';

@Entity('seo_audits')
export class SeoAudit extends BaseEntity {
  // Khóa ngoại liên kết tới sản phẩm được chấm điểm SEO
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  // Từ khóa trọng tâm (Focus Keyword) được sử dụng trong lần đánh giá này
  @Column({ name: 'focus_keyword', type: 'varchar', length: 255, nullable: true })
  focusKeyword?: string;

  // Tổng điểm SEO đạt được (thang điểm 0 - 100)
  @Column({ name: 'total_score', type: 'int', default: 0 })
  totalScore!: number;

  // Xếp hạng tổng quan: EXCELLENT, GOOD, AVERAGE, POOR
  @Column({ type: 'varchar', length: 50, default: 'AVERAGE' })
  grade!: SeoGrade;

  // Phiên bản của BookDetail (bookDetail.version) tại thời điểm thực hiện chấm điểm
  @Column({ name: 'audited_version', type: 'int', default: 1 })
  auditedVersion!: number;

  // Tóm tắt ngắn gọn kết quả đánh giá
  @Column({ type: 'text', nullable: true })
  summary?: string;

  // Kết quả chi tiết của 6 tiêu chí thành phần (lưu dạng JSONB)
  @Column({ type: 'jsonb' })
  checklist!: SeoAuditChecklist;

  // Danh sách các cảnh báo gắn cụ thể vào từng blockId của Section
  @Column({ name: 'section_feedbacks', type: 'jsonb', nullable: true })
  sectionFeedbacks?: SeoSectionFeedback[];

  // Danh sách các khuyến nghị hành động (kết hợp từ Rule Engine và Ollama qwen2.5:1.5b)
  @Column({ name: 'actionable_guidance', type: 'jsonb', nullable: true })
  actionableGuidance?: string[];
}
