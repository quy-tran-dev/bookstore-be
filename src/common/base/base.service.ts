import {
  Repository,
  ObjectLiteral,
  FindOptionsWhere,
  DeepPartial,
  Not,
  FindManyOptions,
} from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { PaginationResult } from '../interfaces/pagination.interface';
import { BaseEntity } from './base.entity';

export class BaseService<T extends BaseEntity> {
  constructor(protected readonly repo: Repository<T>) {}

  async create(data: Partial<T>): Promise<T> {
    const entity = this.repo.create(data as DeepPartial<T>);
    return this.repo.save(entity);
  }

  async createMany(datas: DeepPartial<T>[]): Promise<T[]> {
    const entities: T[] = [];
    for (const data of datas) {
      const entity = this.repo.create(data as DeepPartial<T>);
      const result = await this.repo.save(entity);
      entities.push(result);
    }
    return entities;
  }

  async findAllPaginated(
    page: number = 1,
    limit: number = 10,
    options?: FindManyOptions<T>, // Cho phép truyền các điều kiện lọc, sắp xếp, v.v.
  ): Promise<PaginationResult<T>> {
    // Đảm bảo page và limit là số dương và có giá trị mặc định
    page = Math.max(1, page);
    limit = Math.max(1, limit);

    const skip = (page - 1) * limit;

    // Sử dụng findAndCount để lấy cả dữ liệu và tổng số bản ghi
    const [data, total] = await this.repo.findAndCount({
      ...options, // Kế thừa các tùy chọn lọc, sắp xếp, v.v. từ tham số options
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async findAll(): Promise<T[]> {
    return await this.repo.find();
  }

  // Lấy các bản ghi đã bị xoá mềm
  async findSoftDeleted(): Promise<T[]> {
    return this.repo
      .createQueryBuilder()
      .withDeleted()
      .where('deleted_at IS NOT NULL')
      .getMany();
  }

  async findOne(where: FindOptionsWhere<T>): Promise<T> {
    const entity = await this.repo.findOne({ where });
    if (!entity) {
      throw new NotFoundException('Entity not found');
    }
    return entity;
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    const entity = await this.findOne({ id } as FindOptionsWhere<T>);
    Object.assign(entity, data);
    return await this.repo.save(entity);
  }

  async softDelete(id: string): Promise<void> {
    const result = await this.repo.softDelete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Entity not found or already deleted');
    }
  }

  async restore(id: string): Promise<void> {
    const result = await this.repo.restore(id);
    if (result.affected === 0) {
      throw new NotFoundException('Entity not found or not deleted');
    }
  }

  async findWithDeleted(id: string): Promise<T> {
    const entity = await this.repo.findOne({
      where: { id } as FindOptionsWhere<T>,
      withDeleted: true,
    });
    if (!entity) {
      throw new NotFoundException('Entity not found (even soft-deleted)');
    }
    return entity;
  }
}
