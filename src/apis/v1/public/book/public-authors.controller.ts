import { AuthorsService } from '@app/modules/products/authors.service';
import {
  Controller,
  Get,
  Param,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ILike } from 'typeorm';

@Controller('authors')
export class PublicAuthorsController {
  constructor(private readonly authorsService: AuthorsService) {}

  // Lấy danh sách tác giả
  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('keyword') keyword?: string,
  ) {
    const whereCondition: any = { status: 1 }; // Chỉ lấy tác giả đang hoạt động

    if (keyword) {
      whereCondition.name = ILike(`%${keyword}%`);
    }

    return this.authorsService.findAllPaginated(page, limit, {
      where: whereCondition,
      order: { createdAt: 'DESC' },
      // relations: { avatar: true } // Kéo theo ảnh đại diện nếu có
    });
  }

  // Lấy chi tiết tác giả bằng SLUG
  @Get(':slug')
  async findOneBySlug(@Param('slug') slug: string) {
    const author = await this.authorsService.findOneBy({
      slug: slug,
    });

    
    return author;
  }

  @Get('id/:id')
  async findOneById(@Param('id') id: string) {
    const author = await this.authorsService.findOneBy({
      id: id,
    });

    return author;
  }
}
