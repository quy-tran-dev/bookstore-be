// src/modules/categories/entities/category.entity.ts
import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '@app/common/base/base.entity';

@Entity('categories')
export class Category extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name?: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug?: string;

  @Column({ type: 'text', nullable: true })
  imgUrl?: string;

  @Column({ name: 'parent_id', nullable: true })
  parentId?: string;

  // Quan hệ trỏ lên cha
  @ManyToOne(() => Category, (category) => category.children, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_id' })
  parent?: Category;

  // Quan hệ trỏ xuống các con
  @OneToMany(() => Category, (category) => category.parent)
  children?: Category[];
}