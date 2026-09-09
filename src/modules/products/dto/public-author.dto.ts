import { Exclude, Expose, Transform, Type } from 'class-transformer';

@Exclude()
export class PublicAuthorResponseDto {
  @Expose() id?: string;
  @Expose() name?: string;
  @Expose() slug?: string;
  @Expose() describe?: string;
  @Expose()
  @Transform(({ obj }) => obj.avatar?.fileUrl || null)
  avatarUrl?: string;
}