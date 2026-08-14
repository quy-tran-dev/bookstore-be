import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@app/common/base/base.service';
import { Product } from './entities/product.entity';
import { SlugUtil } from '@app/common/utils/slug.util';
import { AlbumFormatUtil } from '@app/common/utils/album-format.util';

@Injectable()
export class ProductsService extends BaseService<Product> {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {
    super(productRepository);
  }

  // --- HELPER CHUẨN HÓA DỮ LIỆU ---
  private formatRelationData(data: any) {
    const formattedData = { ...data };
    
    if (data.categoryIds) {
      formattedData.categories = data.categoryIds.map((id: string) => ({ id }));
      delete formattedData.categoryIds;
    }
    
    if (data.authorIds) {
      formattedData.authors = data.authorIds.map((id: string) => ({ id }));
      delete formattedData.authorIds;
    }
    if (data.albums && Array.isArray(data.albums)) {
      const mappedAlbums = data.albums.map(item => ({
        displayOrder: item.displayOrder !== undefined ? item.displayOrder : 0,
        media: { id: item.mediaId } 
      }));

      formattedData.albums = AlbumFormatUtil.formatAlbumsOrder(mappedAlbums);
    }

    return formattedData;
  }

  async create(data: any, currentUserId?: string): Promise<Product> {
    if (!data.slug && data.name) data.slug = SlugUtil.generate(data.name);
    
    // Check trùng slug
    const existing = await this.productRepository.findOne({ where: { slug: data.slug } });
    if (existing) {
      throw new BadRequestException({ message: 'Slug đã tồn tại', duplicateSlug: data.slug });
    }

    const payload = this.formatRelationData(data);
    
    // Lưu một phát ăn luôn cả Product, BookDetail, Categories, và Authors
    const newProduct = await super.create(payload, currentUserId);

    return this.findOneWithDetails(newProduct.id);
  }

  async update(id: string, data: any, currentUserId?: string): Promise<Product> {
    if (data.name && !data.slug) data.slug = SlugUtil.generate(data.name);
    
    if (data.slug) {
      const existing = await this.productRepository.findOne({ where: { slug: data.slug } });
      if (existing && existing.id !== id) {
        throw new BadRequestException({ message: 'Slug mới bị trùng', duplicateSlug: data.slug });
      }
    }

    const payload = this.formatRelationData(data);

    // TypeORM update qua save() để kích hoạt cascade cho relations
    const entity = await this.productRepository.findOne({ 
      where: { id },
      relations: { bookDetail: true } // Kéo bookDetail cũ lên để update đè lên, tránh tạo mới
    });
    
    if (!entity) throw new NotFoundException('Không tìm thấy sản phẩm');
    
    if (currentUserId) payload.updateBy = currentUserId;

    // Gộp dữ liệu mới vào dữ liệu cũ
    const updatedEntity = this.productRepository.merge(entity, payload);
    await this.productRepository.save(updatedEntity);

    return this.findOneWithDetails(id);
  }

  // Helper lấy full data trả về
  async findOneWithDetails(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: {
        bookDetail: true,
        categories: true,
        authors: true,
      },
    });
    if (!product) throw new NotFoundException('Truy xuất dữ liệu thất bại');
    return product;
  }

}