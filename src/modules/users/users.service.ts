import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@app/common/base/base.service';
import { User } from './entities/user.entity';
import { UserResponseDto } from '../auth/dto/user-response.dto';
import { UpdateProfileDto } from '../auth/dto/update-profile.dto';

@Injectable()
export class UsersService extends BaseService<User> {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
  ) {
    // Truyền repository vào super() để BaseService hoạt động
    super(userRepository);
  }

  // Ghi đè phương thức findOne nếu muốn mặc định lấy cả relations
  async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { userDetail: true },
    });

    if (!user) throw new NotFoundException('User không tồn tại');

    return new UserResponseDto(user);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { userDetail: true },
    });

    if (!user) throw new NotFoundException('User không tồn tại');

    // Cập nhật an toàn qua DTO
    if (dto.fullName) user.userDetail.fullName = dto.fullName;
    if (dto.phone) user.userDetail.phone = dto.phone;
    if (dto.address) user.userDetail.address = dto.address;
    if (dto.avatarUrl) user.userDetail.avatarUrl = dto.avatarUrl;

    await this.userRepository.save(user);
    return new UserResponseDto(user);
  }

  // =====================================
  // TÍNH NĂNG BLOCK / UNBLOCK CHO ADMIN
  // =====================================
  async blockUser(id: string): Promise<void> {
    const user = await this.findOne({ id });
    if (user.role === 'ADMIN')
      throw new BadRequestException('Không thể khóa tài khoản Admin');

    user.isBlocked = true;
    await this.userRepository.save(user);
  }

  async unblockUser(id: string): Promise<void> {
    const user = await this.findOne({ id });
    user.isBlocked = false;
    await this.userRepository.save(user);
  }
}
