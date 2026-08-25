import { IsArray, IsString, IsNotEmpty } from 'class-validator';

export class MoveMediaGroupDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ message: 'Danh sách ID không được để trống' })
  mediaIds?: string[];

  @IsString()
  @IsNotEmpty({ message: 'Base folder không được để trống (vd: products)' })
  baseFolder?: string;

  @IsString()
  @IsNotEmpty({ message: 'Sub folder không được để trống (vd: slug-ten-san-pham)' })
  subFolder?: string;
}