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
// Import Discord Service
import { DiscordService } from '../discord/discord.service';

@Injectable()
export class UsersService extends BaseService<User> {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    private readonly discordService: DiscordService, // Inject Discord
  ) {
    super(userRepository);
  }

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
    if (!user.userDetail) {
      throw new BadRequestException('Không tìm thấy chi tiết người dùng');
    }
    
    if (dto.fullName) user.userDetail.fullName = dto.fullName;
    if (dto.phone) user.userDetail.phone = dto.phone;
    if (dto.address) user.userDetail.address = dto.address;
    if (dto.avatarUrl) user.userDetail.avatarUrl = dto.avatarUrl;

    user.updateBy = userId;
    user.userDetail.updateBy = userId;

    await this.userRepository.save(user);
    return new UserResponseDto(user);
  }

  // =====================================
  // TÍNH NĂNG BLOCK / UNBLOCK CHO ADMIN
  // =====================================
  async blockUser(id: string, adminId: string): Promise<void> {
    const user = await this.findOne({ id } as any);
    if (user.role === 'ADMIN')
      throw new BadRequestException('Không thể khóa tài khoản Admin');

    user.isBlocked = true;
    user.updateBy = adminId;

    await this.userRepository.save(user);

    // Gửi cảnh báo lên Discord
    this.discordService.sendLog(
      'WARN',
      `Admin (ID: ${adminId}) vừa **KHÓA** tài khoản: ${user.email}`,
      'UsersService',
    );
  }

  async unblockUser(id: string, adminId: string): Promise<void> {
    const user = await this.findOne({ id } as any);
    user.isBlocked = false;
    user.updateBy = adminId;

    await this.userRepository.save(user);

    // Báo cáo lên Discord
    this.discordService.sendLog(
      'INFO',
      `Admin (ID: ${adminId}) vừa **MỞ KHÓA** tài khoản: ${user.email}`,
      'UsersService',
    );
  }
}