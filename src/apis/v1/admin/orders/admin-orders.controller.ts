import { Roles } from '@app/common/decorators/roles.decorator';
import { OrderStatus } from '@app/common/enums/order-status.enum';
import { Role } from '@app/common/enums/role.enum';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { DiscordService } from '@app/modules/discord/discord.service';
import { CreateOrderDto } from '@app/modules/orders/dto/create-order.dto';
import { UpdateOrderStatusDto } from '@app/modules/orders/dto/update-order-status.dto';
import { OrdersService } from '@app/modules/orders/orders.service';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  Request,
} from '@nestjs/common';
import { ILike } from 'typeorm';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService, private readonly discordService: DiscordService) {}

  // 1. Tạo đơn hàng (Chỉ user đăng nhập mới được đặt)
  @Post()
  async create(@Body() createOrderDto: CreateOrderDto, @Request() req: any) {
    const result = await this.ordersService.create(createOrderDto, req?.user.id);
     this.discordService.sendOrder(
      'INFO',
      ` **[Admin]** Vừa TẠO MỚI đơn hàng cho khách: **${result.code}**`,
      'AdminOrdersController',
    );
    return result;
  }

  // 3. Admin xem tất cả đơn hàng (Có phân trang & lọc trạng thái)
  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('status') status?: OrderStatus,
    @Query('code') code?: string,
    @Query('customerName') customerName?: string,
    @Query('customerPhone') customerPhone?: string,
    @Query('orderBy') orderBy?: string,
    @Query('sort') sort?: 'ASC' | 'DESC',
  ) {
    // 1. Khởi tạo object điều kiện lọc
    const whereCondition: any = {};

    if (code !== undefined) {
      whereCondition.code = code; 
    }

    if (customerName !== undefined) {
      whereCondition.customerName = ILike(`%${customerName}%`);
    }

    if (customerPhone !== undefined) {
      whereCondition.customerPhone = ILike(`%${customerPhone}%`);
    }

    if (status !== undefined) {
      whereCondition.status = status;
    }

    // 2. Khởi tạo object sắp xếp (Order)
    const orderCondition: any = {};
    if (orderBy) {
      // Nếu có truyền orderBy (vd: name, createdAt), xếp theo chiều sort (mặc định DESC)
      orderCondition[orderBy] = sort || 'DESC';
    } else {
      // Mặc định luôn xếp mới nhất lên đầu
      orderCondition.createdAt = 'DESC';
    }

    return this.ordersService.findAll(page, limit, whereCondition, orderCondition);
  }

  // 4. Xem chi tiết đơn hàng
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  // 5. Admin cập nhật trạng thái đơn (Và tự động hoàn kho nếu hủy)
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
    @Request() req: any,
  ) {

    const result = await this.ordersService.updateStatus(id, updateOrderStatusDto, req?.user.id);
     this.discordService.sendOrder(
      'WARN',
      ` **[Admin]** Vừa CẬP NHẬT trạng thái đơn hàng: **${result.code}**`,
      'AdminOrdersController',
    );
    return result;
  }
}
