import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  Ip,
} from '@nestjs/common';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { PaymentService } from '@app/modules/payment/payment.service';
import { CreateVnpayUrlDto } from '@app/modules/payment/dto/create-vnpay-url.dto';
import type { Request, Response } from 'express';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // 1. Khách hàng tạo URL thanh toán VNPAY cho đơn hàng của mình
  @Post('vnpay/create-url')
  @UseGuards(JwtAuthGuard)
  createPaymentUrl(
    @Body() dto: CreateVnpayUrlDto,
    @Req() req: any,
    @Ip() ip: string,
  ) {
    const clientIp =
      req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
      ip ||
      req.socket?.remoteAddress ||
      '127.0.0.1';

    return this.paymentService.createVnpayPaymentUrl(dto, req.user?.id, clientIp);
  }

  // 2. Webhook IPN Server-to-Server từ VNPAY (qua Localtunnel / Domain)
  @Get('vnpay/ipn')
  handleIpn(@Query() query: Record<string, any>) {
    return this.paymentService.handleVnpayIpn(query);
  }

  // 3. Trình duyệt của khách quay về sau khi thao tác trên giao diện VNPAY
  @Get('vnpay/return')
  handleReturn(
    @Query() query: Record<string, any>,
    @Res() res: Response,
  ) {
    return this.paymentService.handleVnpayReturn(query, res);
  }
}
