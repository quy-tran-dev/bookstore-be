import { IsNotEmpty, IsOptional, IsString, IsInt, Min, Max, IsUUID } from 'class-validator';

export class CreateReviewDto {
  @IsUUID('all', { message: 'ID sản phẩm không đúng định dạng UUID' })
  @IsNotEmpty({ message: 'ID sản phẩm không được để trống' })
  productId!: string;

  @IsInt({ message: 'Đánh giá sao phải là số nguyên' })
  @Min(1, { message: 'Đánh giá tối thiểu là 1 sao' })
  @Max(5, { message: 'Đánh giá tối đa là 5 sao' })
  rating!: number;

  @IsString({ message: 'Tiêu đề phải là chuỗi ký tự' })
  @IsOptional()
  title?: string;

  @IsString({ message: 'Nội dung đánh giá phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Nội dung đánh giá không được để trống' })
  comment!: string;

  @IsUUID('all', { message: 'ID đơn hàng không đúng định dạng UUID' })
  @IsOptional()
  orderId?: string;
}
