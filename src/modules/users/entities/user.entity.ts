import { Entity, Column, OneToMany, OneToOne, JoinColumn } from 'typeorm';
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

  @OneToMany(() => Authenticator, (authenticator) => authenticator.user)
  authenticators!: Authenticator[];

  // Quan hệ 1-1 với bảng Detail
  @OneToOne(() => UserDetail, { cascade: true })
  @JoinColumn({ name: 'detail_id' })
  detail!: UserDetail;
}