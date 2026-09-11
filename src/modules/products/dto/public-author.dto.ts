import { Exclude, Expose, Transform, Type } from 'class-transformer';

@Exclude()
export class PublicAuthorResponseDto {
  @Expose() id?: string;
  @Expose() name?: string;
  @Expose() slug?: string;
  @Expose() describe?: string;

  // Đổi tên key xuất ra thành 'avatarUrl'
  // Dùng 'obj.avatar' để chọc thẳng vào relation avatar của bảng Author
  @Expose({ name: 'avatarUrl' })
  @Transform(({ obj }) => obj.avatar?.fileUrl || null)
  avatar: any; 
}