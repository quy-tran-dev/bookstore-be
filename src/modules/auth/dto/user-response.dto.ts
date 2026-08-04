import { User } from '@app/modules/users/entities/user.entity';
import { UserDetailDto } from './user-detail.dto';

export class UserResponseDto {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
  detail: UserDetailDto | null;
  constructor(user: User) {
    this.id = user.id;
    this.email = user.email;
    this.role = user.role;
    this.detail = user.userDetail || null;
    this.createdAt = user.createdAt;
  }
}
