import { BaseEntity } from '@app/common/base/base.entity';
import { Entity, Column } from 'typeorm';

@Entity('user_details')
export class UserDetail extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  fullName!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone?: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ type: 'text', nullable: true })
  avatarUrl?: string;
}