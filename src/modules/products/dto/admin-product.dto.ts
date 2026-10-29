import { 
  IsNotEmpty, IsOptional, IsString, IsNumber, 
  IsBoolean, IsUUID, IsArray, ValidateNested, Min 
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { CreateProductAlbumDto } from '@app/modules/media/dto/admin-media.dto';
import { SectionBlock } from '../interfaces/section.interface';

export class CreateBookDetailDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  describe?: string; // Giữ lại để tương thích ngược

  @IsString()
  @IsOptional()
  publisher?: string;

  @IsNumber()
  @IsOptional()
  publishYear?: number;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  format?: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  pageCount?: number;

  // Danh sách các khối nội dung chi tiết dạng Section (Block-based: H1/H2/H3, p, image, video, list, style)
  @IsArray()
  @IsOptional()
  sections?: SectionBlock[];

  // Phiên bản kỳ vọng để kiểm soát xung đột sửa đổi (Optimistic Locking)
  @IsNumber()
  @IsOptional()
  expectedVersion?: number;
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên sách không được để trống' })
  name?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  shortDescribe?: string;

  // --- KHO & GIÁ CẢ ---
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsNumber()
  @Min(0)
  price?: number;

  @IsNumber()
  @Min(0)
  finalPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  stockQuantity?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  soldCount?: number;

  // --- TRẠNG THÁI ---
  @IsBoolean()
  @IsOptional()
  isVerified?: boolean;

  @IsNumber()
  @IsOptional()
  status?: number;

  // --- QUAN HỆ LỒNG NHAU ---
  @ValidateNested()
  @Type(() => CreateBookDetailDto)
  @IsOptional()
  bookDetail?: CreateBookDetailDto;

  @IsArray()
  @IsUUID('all', { each: true, message: 'ID Danh mục phải là UUID' })
  @IsOptional()
  categoryIds?: string[];

  @IsArray()
  @IsUUID('all', { each: true, message: 'ID Tác giả phải là UUID' })
  @IsOptional()
  authorIds?: string[];

  @IsArray()
  @ValidateNested()
  @Type(() => CreateProductAlbumDto)
  @IsOptional()
  albums?: CreateProductAlbumDto[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}
