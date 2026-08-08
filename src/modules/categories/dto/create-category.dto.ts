import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên danh mục không được để trống' })
  name?: string;

  @IsString()
  @IsOptional() // Cho phép Admin không cần gửi trường này lên
  slug?: string;

  @IsString()
  @IsOptional()
  imgUrl?: string;
}