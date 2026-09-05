import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { AdminOrdersController } from '@app/apis/v1/admin/orders/admin-orders.controller';
import { PuclicOrdersController } from '@app/apis/v1/public/orders/public-orders.controller';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem]),
    NotificationsModule,
    MailModule
  ],
  controllers: [AdminOrdersController, PuclicOrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}