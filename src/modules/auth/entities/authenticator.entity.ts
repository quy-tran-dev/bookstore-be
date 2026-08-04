import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { BaseEntity } from '@app/common/base/base.entity';

@Entity('authenticators')
export class Authenticator extends BaseEntity {
  @Column({ name: 'credential_id', type: 'text' })
  credentialId!: string;

  // Lưu Khóa công khai dưới dạng nhị phân (BYTEA) trong Postgres -> Node.js hiểu là Buffer
  @Column({ name: 'credential_public_key', type: 'bytea' })
  credentialPublicKey!: Buffer;

  // Biến đếm chống tấn công Replay Attack
  @Column({ type: 'bigint', default: 0 })
  counter!: number;

  @Column({ name: 'device_type', type: 'varchar', length: 32 })
  deviceType!: string;

  @Column({ name: 'backed_up', type: 'boolean', default: false })
  backedUp!: boolean;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.authenticators, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}