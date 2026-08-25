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
  Req
} from '@nestjs/common';
import { OrderStatus } from '@app/common/enums/order-status.enum';
import { OrdersService } from '@app/modules/orders/orders.service';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { CreateOrderDto } from '@app/modules/orders/dto/create-order.dto';
import { User } from '@app/modules/users/entities/user.entity';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // 1. Tạo đơn hàng (Chỉ user đăng nhập mới được đặt)
  @Post()
  create(@Body() createOrderDto: CreateOrderDto, @Req() req: any) {
    return this.ordersService.create(createOrderDto, req?.user);
  }

  // User xem lịch sử mua hàng
  // LƯU Ý: Route này phải đặt trên route ':id'
  @Get('my-orders')
  findMyOrders(
    @Req() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('status') status?: OrderStatus,
    @Query('orderBy') orderBy?: string,
    @Query('sort') sort?: 'ASC' | 'DESC',
  ) {
    return this.ordersService.findAllByUser(req?.user.id, page, limit, status, orderBy, sort);
  }


  //  Xem chi tiết đơn hàng
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

}