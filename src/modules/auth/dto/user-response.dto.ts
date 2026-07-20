import { User } from "@app/modules/users/entities/user.entity";

export class UserResponseDto {
  id: string;
  email: string;
  role: string;
  detail: any;
  createdAt: Date;

  constructor(user: User) {
    this.id = user.id;
    this.email = user.email;
    this.role = user.role;
    this.detail = user.detail; // Map entity UserDetail sang
    this.createdAt = user.createdAt;
  }
}