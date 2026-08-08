import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateAuthorDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên tác giả không được để trống' })
  name?: string;

  @IsString()
  @IsOptional()
  describe?: string;
}

export class UpdateAuthorDto extends PartialType(CreateAuthorDto) {}