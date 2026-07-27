import { BaseEntity } from '@app/common/base/base.entity';
import { Entity, Column, OneToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

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
  
  @OneToOne(() => User, (user) => user.userDetail)
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user: User;
}