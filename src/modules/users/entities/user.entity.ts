import { Entity, Column, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from '@app/common/base/base.entity';
import { Authenticator } from '@app/modules/auth/entities/authenticator.entity';
import { UserDetail } from './user-detail.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  // Thêm mật khẩu (Có thể null nếu user đăng ký bằng Google/Passkeys từ đầu)
  @Column({ type: 'varchar', length: 255, nullable: true })
  password?: string;

  @Column({ type: 'varchar', length: 50, default: 'CUSTOMER' })
  role!: 'ADMIN' | 'CUSTOMER';

  @Column({ name: 'is_verified', default: false })
  isVerified!: boolean;

  @Column({ name: 'verification_token', nullable: true })
  verificationToken?: string;

  @Column({
    name: 'verification_verified_at',
    type: 'timestamptz',
    nullable: true,
  })
  emailVerifiedAt?: Date;

  @Column({ name: 'reset_password_token', nullable: true })
  resetPasswordToken?: string;

  @Column({
    name: 'reset_password_expires',
    type: 'timestamptz',
    nullable: true,
  })
  resetPasswordExpires?: Date;

  @Column({ name: 'hashed_refresh_token', nullable: true })
  hashedRefreshToken?: string;

  isBlocked?: boolean;
  message?: string;

  @OneToMany(() => Authenticator, (authenticator) => authenticator.user)
  authenticators!: Authenticator[];

  // Đổi thành OneToOne và xóa bỏ @JoinColumn ở phía này
  @OneToOne(() => UserDetail, (userDetail) => userDetail.user, {
    cascade: true,
  })
  userDetail: UserDetail;
}
