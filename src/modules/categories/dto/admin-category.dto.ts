import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên danh mục không được để trống' })
  name?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  imgUrl?: string;

  @IsOptional()
  isVerified?: boolean; // true = Đã duyệt, false = Nháp/Đang chỉnh sửa

  @IsNumber()
  @IsOptional()
  status?: number; // 1 = Hiển thị (Active), 0 = Ẩn (Inactive)

  @IsUUID()
  @IsOptional()
  parentId?: string;
}