import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';

export class UpdateReviewDto {
  @IsInt({ message: 'Đánh giá sao phải là số nguyên' })
  @Min(1, { message: 'Đánh giá tối thiểu là 1 sao' })
  @Max(5, { message: 'Đánh giá tối đa là 5 sao' })
  @IsOptional()
  rating?: number;

  @IsString({ message: 'Tiêu đề phải là chuỗi ký tự' })
  @IsOptional()
  title?: string;

  @IsString({ message: 'Nội dung đánh giá phải là chuỗi ký tự' })
  @IsOptional()
  comment?: string;
}
