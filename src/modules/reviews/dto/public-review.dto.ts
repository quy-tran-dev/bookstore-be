import { Exclude, Expose, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryPublicReviewDto {
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

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @IsString()
  @IsOptional()
  sort?: 'ASC' | 'DESC' = 'DESC';
}

@Exclude()
export class PublicReviewUserDto {
  @Expose()
  id?: string;

  @Expose()
  fullName?: string;

  @Expose()
  avatarUrl?: string | null;
}

@Exclude()
export class PublicReviewResponseDto {
  @Expose()
  id!: string;

  @Expose()
  rating!: number;

  @Expose()
  title?: string | null;

  @Expose()
  comment!: string;

  @Expose()
  isPurchased!: boolean;

  @Expose()
  adminReply?: string | null;

  @Expose()
  adminReplyAt?: Date | null;

  @Expose()
  createdAt!: Date;

  @Expose()
  @Type(() => PublicReviewUserDto)
  user?: PublicReviewUserDto;
}

export class ProductRatingStatsDto {
  averageRating!: number;
  totalReviews!: number;
  breakdown!: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
}
