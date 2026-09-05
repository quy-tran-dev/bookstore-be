import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from '../products/entities/product.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderStatus } from '@app/common/enums/order-status.enum';
import { User } from '../users/entities/user.entity';
import { MailProducer } from '../mail/mail.producer';
import { MailOrderConfirmationPayload } from '../mail/interfaces/mail-payload.interface';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PaymentStatus } from '@app/common/enums/payment-status.enum';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    // Inject thêm DataSource để quản lý Transaction bằng tay
    private dataSource: DataSource,
    private readonly mailProducer: MailProducer,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  // ==========================================
  // 1. TẠO ĐƠN HÀNG (SỬ DỤNG ATOMIC UPDATE)
  // ==========================================
  async create(
    createOrderDto: CreateOrderDto,
    currentUserId: string,
  ): Promise<Order> {
    // 1. Dùng hàm tách rời để check User
    const user = await this.validateUserForOrder(currentUserId);

    const items = createOrderDto.items || [];
    if (items.length === 0)
      throw new BadRequestException('Giỏ hàng không được để trống');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let totalAmount = 0;
      const orderItems: OrderItem[] = [];
      const items = createOrderDto.items || [];
      if (items.length === 0) {
        throw new BadRequestException('Giỏ hàng không được để trống');
      }
      const productIds = items.map((item) => item.productId);
      const products = await queryRunner.manager.find(Product, {
        where: { id: In(productIds) },
        select: {
          id: true,
          name: true,
          price: true,
          stockQuantity: true,
          finalPrice: true,
          status: true,
          isVerified: true,
        },
      });

      const productMap = new Map(products.map((p) => [p.id, p]));

      for (const item of items) {
        const product = productMap.get(item.productId as string);

        if (!product) {
          throw new NotFoundException(
            `Sản phẩm ${item.productId} không tồn tại.`,
          );
        }

        // 2. Dùng hàm tách rời để check Sản phẩm
        this.validateProductForOrder(
          product,
          item.productId as string,
          item.quantity || 1,
        );

        // Xử lý trừ kho Atomic
        const updateResult = await queryRunner.manager
          .createQueryBuilder()
          .update(Product)
          .set({
            stockQuantity: () => `"stock_quantity" - ${item.quantity}`,
            soldCount: () => `"sold_count" + ${item.quantity}`,
          })
          .where('id = :id', { id: product.id })
          .andWhere('"stock_quantity" >= :qty', { qty: item.quantity })
          .execute();

        if (updateResult.affected === 0) {
          throw new BadRequestException(
            `Sản phẩm "${product.name}" có người vừa mua mất, không đủ số lượng.`,
          );
        }

        const unitPrice = (product.finalPrice || product.price || 0) as number;
        const totalPrice = unitPrice * (item.quantity || 1);
        totalAmount += totalPrice;

        orderItems.push(
          queryRunner.manager.create(OrderItem, {
            product: { id: product.id },
            productName: product.name,
            quantity: item.quantity,
            unitPrice,
            totalPrice,
            createBy: currentUserId,
          }),
        );
      }

      const shippingFee = 30000;
      const finalAmount = totalAmount + shippingFee;
      const orderCode = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

      const newOrder = queryRunner.manager.create(Order, {
        code: orderCode,
        user: { id: currentUserId },
        customerName: createOrderDto.customerName,
        customerPhone: createOrderDto.customerPhone,
        shippingAddress: createOrderDto.shippingAddress,
        note: createOrderDto.note || '',
        noteAdmin: createOrderDto.noteAdmin || '',
        paymentMethod: createOrderDto.paymentMethod,
        totalAmount,
        shippingFee,
        finalAmount,
        items: orderItems,
        createBy: currentUserId,
      });

      const savedOrder = await queryRunner.manager.save(newOrder);
      await queryRunner.commitTransaction();

      this.sendMailOrder(createOrderDto, savedOrder, user, orderItems);
      this.notificationsGateway.notifyAdminNewOrder(savedOrder);
      this.notificationsGateway.notifyUserOrderSuccess(
        currentUserId,
        savedOrder,
      );

      return savedOrder;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ==========================================
  // 2. CẬP NHẬT TRẠNG THÁI (HOÀN KHO KHI HỦY ĐƠN)
  // ==========================================
  async updateStatus(
    id: string,
    updateDto: UpdateOrderStatusDto,
    currentUserId: string,
  ) {
    const order = await this.orderRepo.findOne({
      where: { id },
      relations: { items: { product: true }, user: true },
    });

    if (!order) throw new NotFoundException('Đơn hàng không tồn tại');

    this.validateOrderTransition(order, updateDto);

    const oldStatus = order.status as OrderStatus;
    const newStatus = updateDto.status || oldStatus;

    if (updateDto.paymentStatus) order.paymentStatus = updateDto.paymentStatus;
    if (updateDto.noteAdmin) order.noteAdmin = updateDto.noteAdmin;
    if (currentUserId) order.updateBy = currentUserId;

    if (
      oldStatus === newStatus &&
      !updateDto.paymentStatus &&
      !updateDto.noteAdmin
    ) {
      return order; // Không có gì thay đổi
    }

    // LOGIC HOÀN KHO: Nếu đơn bị HỦY
    if (
      newStatus === OrderStatus.CANCELLED &&
      oldStatus !== OrderStatus.CANCELLED
    ) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const items = order.items || [];
        if (items.length === 0)
          throw new BadRequestException('Giỏ hàng không tồn tại');

        for (const item of items) {
          if (item.product) {
            await queryRunner.manager
              .createQueryBuilder()
              .update(Product)
              .set({
                stockQuantity: () => `"stock_quantity" + ${item.quantity}`,
                soldCount: () => `"sold_count" - ${item.quantity}`,
              })
              .where('id = :id', { id: item.product.id })
              .execute();
          }
        }

        order.status = newStatus;
        const savedOrder = await queryRunner.manager.save(order);
        await queryRunner.commitTransaction();

        // BỔ SUNG LOGIC 6: Truyền thêm oldStatus vào Socket
        if (order.user || currentUserId) {
          const userIdToNotify = order.user?.id || currentUserId;
          this.notificationsGateway.notifyUserOrderStatus(
            userIdToNotify,
            savedOrder,
            oldStatus,
          );
        }
        return order;
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw new BadRequestException('Lỗi khi hoàn kho, không thể hủy đơn.');
      } finally {
        await queryRunner.release();
      }
    }

    order.status = newStatus;
    const savedOrder = await this.orderRepo.save(order);

    if (oldStatus !== newStatus) {
      const userIdToNotify = order.user?.id || currentUserId;
      this.notificationsGateway.notifyUserOrderStatus(
        userIdToNotify,
        savedOrder,
        oldStatus,
      );
    }

    return savedOrder;
  }

  async sendMailOrder(
    createOrderDto: CreateOrderDto,
    savedOrder: Order,
    currentUser: User,
    orderItems: OrderItem[],
  ) {
    const mailPayload = {
      to: currentUser.email, // Nhớ đảm bảo User entity có trường email nhé
      username: createOrderDto.customerName,
      order_id: savedOrder.code,
      // Format ngày giờ Việt Nam
      order_date: new Date().toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
      }),
      total_amount: savedOrder.finalAmount
        ? savedOrder.finalAmount.toLocaleString('vi-VN') + ' VNĐ'
        : '0 VNĐ',
      shipping_address: savedOrder.shippingAddress,
      items: orderItems.map((item) => ({
        name: item.productName,
        quantity: item.quantity,
        price: item.unitPrice
          ? item.unitPrice.toLocaleString('vi-VN') + ' VNĐ'
          : '0 VNĐ',
      })),
    };

    // Ném thẳng vào Redis Queue (Chạy ngầm cực nhanh, API return ngay lập tức không bị đơ)
    this.mailProducer.queueOrderConfirmation(
      mailPayload as MailOrderConfirmationPayload,
    );
  }

  // ==========================================
  // 3. LẤY DANH SÁCH ĐƠN HÀNG (Dành cho Admin)
  // ==========================================
  async findAll(
    page: number = 1,
    limit: number = 10,
    whereCondition?: any,
    orderCondition?: any,
  ) {
    const skip = (page - 1) * limit;

    const [orders, total] = await this.orderRepo.findAndCount({
      where: whereCondition,
      relations: {
        user: true,
      },
      order: orderCondition,
      skip,
      take: limit,
    });

    return {
      data: orders,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ==========================================
  // 4. LẤY LỊCH SỬ ĐƠN HÀNG CỦA 1 USER (Dành cho Khách hàng)
  // ==========================================
  async findAllByUser(
    page: number = 1,
    limit: number = 10,
    whereCondition?: any,
    orderCondition?: any,
  ) {
    const skip = (page - 1) * limit;
    const [orders, total] = await this.orderRepo.findAndCount({
      where: whereCondition,
      relations: {
        items: {
          product: {
            albums: { media: true },
          },
        },
      },
      order: orderCondition,
      skip,
      take: limit,
    });

    return {
      data: orders,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ==========================================
  // 5. XEM CHI TIẾT 1 ĐƠN HÀNG
  // ==========================================
  async findOne(id: string) {
    const order = await this.orderRepo.findOne({
      where: { id },
      // Kéo user (để xem ai đặt) và items.product (để load hình ảnh/slug sản phẩm)
      relations: {
        user: true,
        items: {
          product: {
            albums: { media: true },
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng');
    return order;
  }

  async cancelMyOrder(orderId: string, currentUserId: string) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, user: { id: currentUserId } }, // Đảm bảo đơn này của đúng User đó
      relations: { items: { product: true } },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng của bạn');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Bạn chỉ có thể hủy đơn hàng đang chờ xác nhận',
      );
    }

    // Tận dụng lại hàm updateStatus đã viết ở trên để nó xử lý luôn việc Hoàn Kho
    const updateDto = new UpdateOrderStatusDto();
    updateDto.status = OrderStatus.CANCELLED;

    return this.updateStatus(order.id, updateDto, currentUserId);
  }

  // ==========================================
  // HÀM BỔ TRỢ (PRIVATE METHODS) - CLEAN CODE
  // ==========================================

  private async validateUserForOrder(userId: string): Promise<User> {
    const user = await this.dataSource.manager.findOne(User, {
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    if (!user.isVerified) {
      throw new BadRequestException(
        'Vui lòng xác thực tài khoản (Verify Email) trước khi đặt hàng.',
      );
    }
    return user;
  }

  private validateProductForOrder(
    product: Product | undefined,
    productId: string,
    requestedQuantity: number,
  ) {
    if (!product) {
      throw new NotFoundException(`Sản phẩm ${productId} không tồn tại.`);
    }

    if (product.isVerified === false) {
      throw new BadRequestException(
        `Sản phẩm "${product.name}" hiện chưa bán.`,
      );
    }

    if (product.status !== 1) {
      throw new BadRequestException(
        `Sản phẩm "${product.name}" hiện tạm ngừng kinh doanh.`,
      );
    }
    if (product.stockQuantity === 0) {
      throw new BadRequestException(
        `Sản phẩm "${product.name}" hiện tại đã hết hàng.`,
      );
    }
    if (!product.stockQuantity) {
      throw new BadRequestException(
        `Sản phẩm "${product.name}" hiện tại đang nhập hàng.`,
      );
    }
    if (product.stockQuantity < requestedQuantity) {
      throw new BadRequestException(
        `Sản phẩm "${product.name}" không đủ số lượng (Chỉ còn ${product.stockQuantity}).`,
      );
    }
  }

  private validateOrderTransition(
    order: Order,
    updateDto: UpdateOrderStatusDto,
  ) {
    const oldStatus = order.status;
    const newStatus = updateDto.status || oldStatus;

    // Chặn đổi khi đã Hủy
    if (
      oldStatus === OrderStatus.CANCELLED &&
      newStatus !== OrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Không thể thay đổi trạng thái của đơn hàng đã bị hủy.',
      );
    }

    // Chặn hoàn tác thanh toán
    if (
      order.paymentStatus === PaymentStatus.PAID &&
      updateDto.paymentStatus === PaymentStatus.UNPAID
    ) {
      throw new BadRequestException(
        'Không thể chuyển đơn hàng đã thanh toán về trạng thái chưa thanh toán.',
      );
    }
  }
}
