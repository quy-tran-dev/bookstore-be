import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { SectionBlock } from '../../products/interfaces/section.interface';

export class AuditImageItemDto {
  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  altText?: string;
}

/**
 * DTO phục vụ chấm điểm SEO trực tiếp trên bản nháp (Draft) khi Admin đang gõ trên giao diện
 */
export class AnalyzeSeoDraftDto {
  // Tiêu đề sách hoặc tiêu đề bài viết (bắt buộc để đối chiếu với từ khóa và nội dung)
  @IsString()
  title!: string;

  // Mô tả ngắn gọn của sách (dùng làm thẻ Meta Description trên kết quả tìm kiếm)
  @IsString()
  @IsOptional()
  shortDescribe?: string;

  // Từ khóa trọng tâm mà Admin muốn tối ưu cho cuốn sách này
  @IsString()
  @IsOptional()
  focusKeyword?: string;

  // Danh sách các khối nội dung theo cấu trúc SectionBlock (heading, paragraph, image, video, quote, list)
  @IsArray()
  @IsOptional()
  sections?: SectionBlock[];

  // Nội dung mô tả dạng chuỗi cũ (dùng làm phương án dự phòng nếu chưa có sections)
  @IsString()
  @IsOptional()
  describe?: string;

  // Danh sách hình ảnh trong Album của sản phẩm (kèm thẻ altText)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AuditImageItemDto)
  @IsOptional()
  albumImages?: AuditImageItemDto[];

  // Tùy chọn có gọi thêm mô hình Ollama (qwen2.5:1.5b) để diễn giải lời khuyên hay không
  @IsBoolean()
  @IsOptional()
  includeAiAdvice?: boolean;
}

/**
 * DTO tùy chọn khi chạy kiểm tra SEO cho sản phẩm đã lưu trong Database
 */
export class AuditProductOptionsDto {
  // Cho phép Admin truyền từ khóa trọng tâm mới muốn kiểm tra thử trên sản phẩm
  @IsString()
  @IsOptional()
  focusKeyword?: string;

  // Mặc định có gọi Ollama sinh lời khuyên hay chỉ chấm nhanh bằng Rule + Vector
  @IsBoolean()
  @IsOptional()
  includeAiAdvice?: boolean;
}
