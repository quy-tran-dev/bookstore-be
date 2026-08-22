import { IsNotEmpty, IsOptional, IsString, IsNumber, Min, IsUUID, IsArray, ValidateNested } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';


export class CreateProductAlbumDto {
  @IsUUID('all', { message: 'ID của media phải là UUID hợp lệ' })
  @IsNotEmpty()
  mediaId?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  displayOrder?: number;
}

export class CreateMediaDto {
  @IsString()
  @IsNotEmpty()
  fileName?: string;

  @IsString()
  @IsOptional()
  folderPath?: string;

  @IsString()
  @IsNotEmpty()
  fileUrl?: string;

  @IsString()
  @IsNotEmpty()
  mimeType?: string;

  @IsNumber()
  @IsNotEmpty()
  size?: number;

  @IsString()
  @IsOptional()
  provider?: string;

  @IsString()
  @IsOptional()
  altText?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductAlbumDto)
  @IsOptional()
  albums?: CreateProductAlbumDto[];
}

export class UpdateMediaDto extends PartialType(CreateMediaDto) {}