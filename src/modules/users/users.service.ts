import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserResponseDto } from '../auth/dto/user-response.dto';
import { UpdateProfileDto } from '../auth/dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private userRepository: Repository<User>) {}

  async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { detail: true },
    });
    
    if (!user) throw new NotFoundException('User không tồn tại');
    
    // Return qua DTO để giấu pass
    return new UserResponseDto(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { detail: true },
    });
    
    if (!user) throw new NotFoundException('User không tồn tại');

    // Cập nhật an toàn qua DTO
    if (dto.fullName) user.detail.fullName = dto.fullName;
    if (dto.phone) user.detail.phone = dto.phone;
    if (dto.address) user.detail.address = dto.address;
    if (dto.avatarUrl) user.detail.avatarUrl = dto.avatarUrl;

    await this.userRepository.save(user);
    return new UserResponseDto(user);
  }
}