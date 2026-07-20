import { IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Avatar phải là một URL hợp lệ' })
  avatarUrl?: string;
}