import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateAuthorDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên tác giả không được để trống' })
  name?: string;

  @IsString()
  @IsOptional()
  describe?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsUUID('all', { message: 'Media ID không hợp lệ' })
  @IsOptional()
  mediaId?: string;
}

export class UpdateAuthorDto extends PartialType(CreateAuthorDto) {}