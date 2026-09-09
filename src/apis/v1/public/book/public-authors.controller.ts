import { AuthorsService } from '@app/modules/products/authors.service';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  Controller,
  Get,
  Param,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  NotFoundException,
  UseInterceptors,
} from '@nestjs/common';
import { ILike } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { PublicAuthorResponseDto } from '@app/modules/products/dto/public-author.dto';

@Controller('authors')
@UseInterceptors(CacheInterceptor)
export class PublicAuthorsController {
  constructor(private readonly authorsService: AuthorsService) {}

  @Get()
  @CacheTTL(1800000)
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('keyword') keyword?: string,
  ) {
    const whereCondition: any = {};

    if (keyword) {
      whereCondition.name = ILike(`%${keyword}%`);
    }

    const result = await this.authorsService.findAllPaginated(page, limit, {
      where: whereCondition,
      order: { createdAt: 'DESC' },
      relations: { avatar: true },
    });

    return {
      ...result,
      data: plainToInstance(PublicAuthorResponseDto, result?.data || []),
    };
  }

  @Get(':slug')
  @CacheTTL(1800000)
  async findOneBySlug(@Param('slug') slug: string) {
    const author = await this.authorsService.findOneBy({
      slug: slug,
    });

    if (!author) throw new NotFoundException('Không tìm thấy tác giả');
    
    return plainToInstance(PublicAuthorResponseDto, author);
  }

  @Get('id/:id')
  @CacheTTL(1800000)
  async findOneById(@Param('id') id: string) {
    const author = await this.authorsService.findOneBy({
      id: id,
    });

    if (!author) throw new NotFoundException('Không tìm thấy tác giả');

    return plainToInstance(PublicAuthorResponseDto, author);
  }
}