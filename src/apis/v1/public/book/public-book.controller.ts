import { Controller, Post, UseGuards, Get, Query, DefaultValuePipe, BadRequestException, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { Roles } from '@app/common/decorators/roles.decorator';
import { Role } from '@app/common/enums/role.enum';
import { RolesGuard } from '@app/common/guards/role.guard';
import { ProductsService } from '@app/modules/products/products.service';

@Controller('books')
export class PublicBookController {
  constructor(private readonly productsService: ProductsService) {}
  // API không có Guard -> Ai cũng xem được
  @Get()
  getAllBooks() {
    return 'Lấy danh sách sách';
  }

  // API yêu cầu Guard -> Chỉ Customer mới được đánh giá
  @Post(':id/reviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  reviewBook() {
    return 'Customer đánh giá sách';
  }
}