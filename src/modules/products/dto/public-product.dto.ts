import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { PublicAuthorResponseDto } from './public-author.dto';
import { PublicCategoryResponseDto } from '@app/modules/categories/dto/public-category.dto';

@Exclude()
export class PublicAlbumResponseDto {
  @Expose() displayOrder?: number;

  @Expose()
  @Transform(({ obj }) => obj.media?.fileUrl || null)
  imageUrl?: string;

  @Expose()
  @Transform(({ obj }) => obj.media?.altText || null)
  altText?: string;
}

@Exclude()
export class PublicBookDetailResponseDto {
  @Expose() title?: string;
  @Expose() describe?: string; // Khớp với entity BookDetail
  @Expose() publisher?: string;
  @Expose() publishYear?: number;
  @Expose() language?: string;
  @Expose() format?: string;
  @Expose() pageCount?: number;
}

@Exclude()
export class PublicProductListResponseDto {
  @Expose() id?: string;
  @Expose() name?: string;
  @Expose() slug?: string;
  @Expose() shortDescribe?: string;
  @Expose() price?: number;
  @Expose() finalPrice?: number;
  @Expose() stockQuantity?: number;
  @Expose() soldCount?: number;
  @Expose() createdAt?: Date;

  @Expose()
  @Type(() => PublicAlbumResponseDto)
  albums?: PublicAlbumResponseDto[];
}
@Exclude()
export class PublicProductDetailResponseDto extends PublicProductListResponseDto {
  @Expose()
  @Type(() => PublicCategoryResponseDto)
  categories?: PublicCategoryResponseDto[];

  @Expose()
  @Type(() => PublicAuthorResponseDto)
  authors?: PublicAuthorResponseDto[];

  @Expose()
  @Type(() => PublicBookDetailResponseDto)
  bookDetail?: PublicBookDetailResponseDto;
}

@Exclude()
export class PublicProductSearchResponseDto extends PublicProductDetailResponseDto {
   @Expose() searchScore?: number;
}
