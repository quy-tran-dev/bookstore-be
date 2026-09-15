import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Payment } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { VnpayService } from './vnpay.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { DiscordService } from '../discord/discord.service';
import { PaymentMethod } from '@app/common/enums/payment-method.enum';
import { PaymentStatus } from '@app/common/enums/payment-status.enum';
import { OrderStatus } from '@app/common/enums/order-status.enum';
import { CreateVnpayUrlDto } from './dto/create-vnpay-url.dto';
import type { Response } from 'express';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly vnpayService: VnpayService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly discordService: DiscordService,
    private readonly configService: ConfigService,
  ) {}

  // ==========================================
  // 1. TẠO URL THANH TOÁN VNPAY CHO ĐƠN HÀNG
  // ==========================================
  async createVnpayPaymentUrl(
    dto: CreateVnpayUrlDto,
    userId: string,
    ipAddr: string,
  ) {
    const order = await this.orderRepo.findOne({
      where: { id: dto.orderId },
      relations: { user: true },
    });

    if (!order) {
      throw new NotFoundException('Đơn hàng không tồn tại');
    }

    if (order.user?.id && order.user.id !== userId) {
      throw new ForbiddenException(
        'Bạn không có quyền thanh toán đơn hàng này',
      );
    }

    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Đơn hàng này đã được thanh toán rồi');
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Đơn hàng đã bị hủy, không thể thanh toán');
    }

    // Ghi nhận một lượt thanh toán mới ở trạng thái UNPAID
    const payment = this.paymentRepo.create({
      order: { id: order.id } as Order,
      amount: order.finalAmount || 0,
      method: PaymentMethod.VNPAY,
      status: PaymentStatus.UNPAID,
      createBy: userId,
    });
    await this.paymentRepo.save(payment);

    // Cập nhật phương thức thanh toán của đơn sang VNPAY nếu trước đó chưa phải
    if (order.paymentMethod !== PaymentMethod.VNPAY) {
      order.paymentMethod = PaymentMethod.VNPAY;
      await this.orderRepo.save(order);
    }

    // Sinh link VNPAY
    const paymentUrl = this.vnpayService.buildPaymentUrl(
      order,
      ipAddr,
      dto.bankCode,
      dto.language || 'vn',
    );

    return {
      orderCode: order.code,
      amount: order.finalAmount,
      paymentUrl,
    };
  }

  // ==========================================
  // 2. XỬ LÝ WEBHOOK IPN (SERVER-TO-SERVER)
  // ==========================================
  async handleVnpayIpn(query: Record<string, any>) {
    this.logger.log(`Nhận IPN từ VNPAY: ${JSON.stringify(query)}`);

    // 1. Kiểm tra chữ ký (Checksum)
    const { isValid, data } = this.vnpayService.verifyChecksum(query);
    if (!isValid) {
      this.logger.warn('IPN thất bại: Sai mã chữ ký (Checksum failed)');
      return { RspCode: '97', Message: 'Checksum failed' };
    }

    const orderCode = data.vnp_TxnRef;
    const vnpAmount = Number(data.vnp_Amount);
    const responseCode = data.vnp_ResponseCode;
    const transactionNo = data.vnp_TransactionNo;
    const bankCode = data.vnp_BankCode;
    const bankTranNo = data.vnp_BankTranNo;
    const cardType = data.vnp_CardType;
    const orderInfo = data.vnp_OrderInfo;
    const payDateStr = data.vnp_PayDate; // YYYYMMDDHHmmss

    // 2. Tìm đơn hàng theo vnp_TxnRef (orderCode)
    const order = await this.orderRepo.findOne({
      where: { code: orderCode },
      relations: { user: true },
    });

    if (!order) {
      this.logger.warn(`IPN thất bại: Không tìm thấy đơn hàng [${orderCode}]`);
      return { RspCode: '01', Message: 'Order not found' };
    }

    // 3. Kiểm tra số tiền đối soát (VNPAY tính amount * 100)
    const expectedAmount = Math.round(Number(order.finalAmount || 0) * 100);
    if (vnpAmount !== expectedAmount) {
      this.logger.warn(
        `IPN thất bại: Số tiền không khớp [Nhận: ${vnpAmount}, Kỳ vọng: ${expectedAmount}]`,
      );
      return { RspCode: '04', Message: 'Invalid amount' };
    }

    // 4. Kiểm tra xem đơn hàng đã hoàn tất thanh toán trước đó chưa
    if (order.paymentStatus === PaymentStatus.PAID) {
      this.logger.log(
        `IPN: Đơn hàng [${orderCode}] đã được xác nhận thanh toán trước đó`,
      );
      return { RspCode: '02', Message: 'Order already confirmed' };
    }

    // Chuyển đổi chuỗi ngày vnp_PayDate sang Date object
    let paidAt: Date | null = null;
    if (payDateStr && payDateStr.length === 14) {
      const year = parseInt(payDateStr.substring(0, 4), 10);
      const month = parseInt(payDateStr.substring(4, 6), 10) - 1;
      const day = parseInt(payDateStr.substring(6, 8), 10);
      const hour = parseInt(payDateStr.substring(8, 10), 10);
      const minute = parseInt(payDateStr.substring(10, 12), 10);
      const second = parseInt(payDateStr.substring(12, 14), 10);
      paidAt = new Date(Date.UTC(year, month, day, hour - 7, minute, second));
    }

    // 5. Ghi nhận chi tiết vào bảng Payment
    let payment = await this.paymentRepo.findOne({
      where: { order: { id: order.id }, status: PaymentStatus.UNPAID },
      order: { createdAt: 'DESC' },
    });

    if (!payment) {
      payment = this.paymentRepo.create({
        order: { id: order.id } as Order,
        amount: order.finalAmount || 0,
        method: PaymentMethod.VNPAY,
      });
    }

    payment.transactionNo = transactionNo;
    payment.bankCode = bankCode;
    payment.bankTranNo = bankTranNo;
    payment.cardType = cardType;
    payment.orderInfo = orderInfo;
    payment.paidAt = paidAt || new Date();
    payment.responseCode = responseCode;
    payment.rawResponse = query;

    const oldStatus = order.status as OrderStatus;

    if (responseCode === '00') {
      // --- THANH TOÁN THÀNH CÔNG ---
      payment.status = PaymentStatus.PAID;
      await this.paymentRepo.save(payment);

      order.paymentStatus = PaymentStatus.PAID;
      order.status = OrderStatus.CONFIRMED; // Tự động xác nhận đơn khi đã thanh toán thành công
      const savedOrder = await this.orderRepo.save(order);

      this.logger.log(
        `Thanh toán VNPAY THÀNH CÔNG cho đơn hàng: ${order.code}`,
      );

      // Bắn Socket.io thông báo cho người dùng
      if (order.user?.id) {
        this.notificationsGateway.notifyUserOrderStatus(
          order.user.id,
          savedOrder,
          oldStatus,
        );
      }

      // Bắn thông báo Discord
      this.discordService.sendOrder(
        'INFO',
        ` 💳 **[VNPAY]** Đơn hàng **${order.code}** đã thanh toán thành công **${order.finalAmount?.toLocaleString('vi-VN')} VNĐ** (Mã GD: \`${transactionNo}\`, Ngân hàng: \`${bankCode}\`)`,
        'PaymentService',
      );

      return { RspCode: '00', Message: 'Confirm Success' };
    } else {
      // --- THANH TOÁN THẤT BẠI HOẶC KHÁCH HỦY ---
      payment.status = PaymentStatus.FAILED;
      await this.paymentRepo.save(payment);

      order.paymentStatus = PaymentStatus.FAILED;
      await this.orderRepo.save(order);

      this.logger.warn(
        `Thanh toán VNPAY THẤT BẠI cho đơn hàng: ${order.code}, ResponseCode: ${responseCode}`,
      );

      return { RspCode: '00', Message: 'Confirm Success' };
    }
  }

  // ==========================================
  // 3. XỬ LÝ TRÌNH DUYỆT RETURN URL
  // ==========================================
  async handleVnpayReturn(query: Record<string, any>, res: Response) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const { isValid, data } = this.vnpayService.verifyChecksum(query);
    const orderCode = data.vnp_TxnRef || '';
    const responseCode = data.vnp_ResponseCode;

    if (!isValid) {
      this.logger.warn('Return URL: Checksum không hợp lệ');
      return res.redirect(
        `${frontendUrl}/order/payment-result?status=CHECKSUM_FAILED&code=${orderCode}`,
      );
    }

    if (responseCode === '00') {
      // Dự phòng nếu IPN chưa kịp chạy tới nơi
      const order = await this.orderRepo.findOne({
        where: { code: orderCode },
      });
      if (order && order.paymentStatus !== PaymentStatus.PAID) {
        order.paymentStatus = PaymentStatus.PAID;
        order.status =
          order.status === OrderStatus.PENDING
            ? OrderStatus.CONFIRMED
            : order.status;
        await this.orderRepo.save(order);
      }

      return res.redirect(
        `${frontendUrl}/order/payment-result?status=PAID&code=${orderCode}&amount=${Number(data.vnp_Amount || 0) / 100}`,
      );
    } else {
      return res.redirect(
        `${frontendUrl}/order/payment-result?status=FAILED&code=${orderCode}&responseCode=${responseCode}`,
      );
    }
  }
}
