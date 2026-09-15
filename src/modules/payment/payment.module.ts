import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { PaymentService } from './payment.service';
import { VnpayService } from './vnpay.service';
import { PaymentController } from '@app/apis/v1/public/payment/payment.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { DiscordModule } from '../discord/discord.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order]),
    NotificationsModule,
    DiscordModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService, VnpayService],
  exports: [PaymentService, VnpayService, TypeOrmModule],
})
export class PaymentModule {}
