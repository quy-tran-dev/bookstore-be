import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên danh mục không được để trống' })
  name?: string;

  @IsString()
  @IsOptional() // Cho phép Admin không cần gửi trường này lên
  slug?: string;

  @IsOptional()
  isVerified?: boolean; // true = Đã duyệt, false = Nháp/Đang chỉnh sửa

  @IsNumber()
  @IsOptional()
  status?: number; // 1 = Hiển thị (Active), 0 = Ẩn (Inactive)
}