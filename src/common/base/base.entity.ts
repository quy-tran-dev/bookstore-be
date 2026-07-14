import {
  BaseEntity as TypeOrmBaseEntity,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Column,
  Index,
  BeforeInsert,
} from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

export abstract class BaseEntity extends TypeOrmBaseEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  @Index()
  deletedAt?: Date | null;

  @Column({ name: 'create_by', nullable: true })
  createBy?: string;

  @Column({ name: 'update_by', nullable: true })
  updateBy?: string;

  @Column({ name: 'delete_by', nullable: true })
  deleteBy?: string;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv7();
    }
  }
}