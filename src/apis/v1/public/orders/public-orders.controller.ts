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
  Req,
  Request,
} from '@nestjs/common';
import { OrderStatus } from '@app/common/enums/order-status.enum';
import { OrdersService } from '@app/modules/orders/orders.service';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { CreateOrderDto } from '@app/modules/orders/dto/create-order.dto';
import { User } from '@app/modules/users/entities/user.entity';
import { DiscordService } from '@app/modules/discord/discord.service';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class PuclicOrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly discordService: DiscordService,
  ) {}

  // 1. Tạo đơn hàng (Chỉ user đăng nhập mới được đặt)
  @Post()
  async create(@Body() createOrderDto: CreateOrderDto, @Req() req: any) {
    const result = await this.ordersService.create(
      createOrderDto,
      req?.user.id,
    );
    this.discordService.sendOrder(
      'INFO',
      ` **[Public]** Vừa TẠO MỚI đơn hàng: **${result.code}**`,
      'PublicOrdersController',
    );
    return result;
  }

  // User xem lịch sử mua hàng
  // LƯU Ý: Route này phải đặt trên route ':id'
  @Get('my-orders')
  findMyOrders(
    @Req() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('status') status?: OrderStatus,
    @Query('code') code?: string,
    @Query('orderBy') orderBy?: string,
    @Query('sort') sort?: 'ASC' | 'DESC',
  ) {
    const orderCondition: any = {};
    if (orderBy) {
      orderCondition[orderBy] = sort || 'DESC';
    } else {
      orderCondition.createdAt = 'DESC';
    }

    const whereCondition: any = { user: { id: req?.user.id } };
    if (status !== undefined) {
      whereCondition.status = status;
    }

    if (code !== undefined) {
      whereCondition.code = code;
    }
    return this.ordersService.findAllByUser(
      page,
      limit,
      whereCondition,
      orderCondition,
    );
  }

  //  Xem chi tiết đơn hàng
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch('my-orders/:id/cancel')
  async cancelMyOrder(@Param('id') id: string, @Request() req: any) {
    const result = await this.ordersService.cancelMyOrder(id, req?.user.id);
    this.discordService.sendOrder(
      'WARN',
      ` **[Public]** Khách vừa HỦY đơn hàng: **${result.code}**`,
      'PublicOrdersController',
    );
    return result;
  }
}
