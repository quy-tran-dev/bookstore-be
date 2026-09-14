import { IsEnum, IsNotEmpty, IsOptional, IsString, IsInt, Min, Max, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { StatusReview } from '@app/common/enums/status-review.enum';

export class UpdateReviewStatusDto {
  @IsEnum(StatusReview, { message: 'Trạng thái đánh giá không hợp lệ' })
  @IsNotEmpty({ message: 'Trạng thái không được để trống' })
  status!: StatusReview;
}

export class AdminReplyReviewDto {
  @IsString({ message: 'Nội dung phản hồi phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Nội dung phản hồi không được để trống' })
  adminReply!: string;
}

export class AdminUpdateReviewDto {
  @IsInt({ message: 'Đánh giá sao phải là số nguyên' })
  @Min(1, { message: 'Đánh giá tối thiểu là 1 sao' })
  @Max(5, { message: 'Đánh giá tối đa là 5 sao' })
  @IsOptional()
  rating?: number;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  comment?: string;

  @IsEnum(StatusReview, { message: 'Trạng thái không hợp lệ' })
  @IsOptional()
  status?: StatusReview;

  @IsString()
  @IsOptional()
  adminReply?: string;
}

export class QueryAdminReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number = 10;

  @IsString()
  @IsOptional()
  keyword?: string;

  @IsUUID('all')
  @IsOptional()
  productId?: string;

  @IsUUID('all')
  @IsOptional()
  userId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @Type(() => Number)
  @IsEnum(StatusReview)
  @IsOptional()
  status?: StatusReview;

  @IsString()
  @IsOptional()
  orderBy?: string;

  @IsString()
  @IsOptional()
  sort?: 'ASC' | 'DESC' = 'DESC';
}
