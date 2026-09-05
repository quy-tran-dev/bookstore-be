import { Entity, Column, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from '@app/common/base/base.entity';
import { Authenticator } from '@app/modules/auth/entities/authenticator.entity';
import { UserDetail } from './user-detail.entity';
import { Exclude } from 'class-transformer';

@Entity('users')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  // Thêm mật khẩu (Có thể null nếu user đăng ký bằng Google/Passkeys từ đầu)
  @Column({ type: 'varchar', length: 255, nullable: true, })
  @Exclude()
  password?: string;

  @Column({ type: 'varchar', length: 50, default: 'CUSTOMER' })
  // @Exclude()
  role!: 'ADMIN' | 'CUSTOMER';

  @Column({ name: 'is_verified', default: false })
  isVerified!: boolean;

  @Column({
    name: 'verification_verified_at',
    type: 'timestamptz',
    nullable: true,
  })
  emailVerifiedAt?: Date;

  isBlocked?: boolean;
  message?: string;

  // Thêm type: 'varchar'
  @Column({ name: 'hashed_refresh_token', type: 'varchar', nullable: true })
  @Exclude()
  hashedRefreshToken?: string | null;

  // Thêm type: 'varchar'
  @Column({ name: 'verification_token', type: 'varchar', nullable: true })
  @Exclude()
  verificationToken?: string | null;

  // Thêm type: 'varchar'
  @Column({ name: 'reset_password_token', type: 'varchar', nullable: true })
  @Exclude()
  resetPasswordToken?: string | null;

  // Giữ nguyên type: 'timestamptz'
  @Column({
    name: 'reset_password_expires',
    type: 'timestamptz',
    nullable: true,
  })
  @Exclude()
  resetPasswordExpires?: Date | null;

  @OneToMany(() => Authenticator, (authenticator) => authenticator.user)
  authenticators!: Authenticator[];

  // Đổi thành OneToOne và xóa bỏ @JoinColumn ở phía này
  @OneToOne(() => UserDetail, (userDetail) => userDetail.user, {
    cascade: true,
  })
  userDetail?: UserDetail;
}
