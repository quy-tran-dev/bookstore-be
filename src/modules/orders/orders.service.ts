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
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    // Bắt đầu Transaction (Nếu lỗi ở bất kỳ khâu nào, mọi dữ liệu sẽ được quay ngược lại như cũ)
    await queryRunner.startTransaction();

    try {
      let totalAmount = 0;
      const orderItems: OrderItem[] = [];

      // 1. FIX LỖI TYPESCRIPT VÀ BẮT LỖI MẢNG RỖNG
      const items = createOrderDto.items || [];
      if (items.length === 0) {
        throw new BadRequestException('Giỏ hàng không được để trống');
      }

      // 2. TỐI ƯU NHẤT: Lấy TẤT CẢ sản phẩm trong 1 câu Query duy nhất (Tránh N+1 SELECT)
      const productIds = items.map((item) => item.productId);
      const products = await queryRunner.manager.find(Product, {
        where: { id: In(productIds) },
        // select: ['id', 'name', 'price', 'stockQuantity'],
        select: {
          id: true,
          name: true,
          price: true,
          stockQuantity: true,
          finalPrice: true,
        },
      });

      // Tạo một Map trên RAM để tra cứu sản phẩm cực nhanh (O(1)) thay vì dùng mảng .find()
      const productMap = new Map(products.map((p) => [p.id, p]));

      // 3. Xử lý từng sản phẩm trong giỏ hàng
      for (const item of items) {
        // Lấy sản phẩm từ RAM ra (Cực nhanh, không đụng DB)
        const product = productMap.get(item.productId as string);

        if (!product) {
          throw new NotFoundException(
            `Sản phẩm ${item.productId} không tồn tại`,
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

        // Bắt lỗi sớm (Fast-fail) trên RAM trước khi bắt DB chạy Update
        if (product.stockQuantity < (item.quantity || 1)) {
          throw new BadRequestException(
            `Sản phẩm "${product.name}" đã hết hàng hoặc không đủ số lượng.`,
          );
        }

        // 4. ATOMIC UPDATE (Vẫn giữ nguyên để đảm bảo chống Race Condition)
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

        // 5. Tạo Snapshot
        const unitPrice = (product.finalPrice || product.price || 0) as number;
        const totalPrice = unitPrice * (item.quantity || 1);
        totalAmount += totalPrice;

        const orderItem = queryRunner.manager.create(OrderItem, {
          product: { id: product.id },
          productName: product.name,
          quantity: item.quantity,
          unitPrice,
          totalPrice,
          createBy: currentUserId,
        });

        orderItems.push(orderItem);
      }

      // B4: Tính tổng tiền & Tạo mã đơn hàng (VD: ORD-170884-999)
      const shippingFee = 30000; // Hardcode tạm 30k
      const finalAmount = totalAmount + shippingFee;
      const orderCode = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

      // B5: Lưu toàn bộ Order và OrderItems xuống DB
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

      // Mọi thứ hoàn hảo -> Xác nhận lưu vào Database thật
      await queryRunner.commitTransaction();

      // 1. Lấy thông tin User để lấy email gửi thư
      const user = await this.dataSource.manager.findOne(User, {
        where: { id: currentUserId },
      });

      if (user && user.email) {
        // Đẩy job gửi mail hóa đơn cho khách vào Redis Queue
        this.sendMailOrder(createOrderDto, savedOrder, user, orderItems);
      }

      // 2. Bắn Socket báo cho Admin (Web quản trị sẽ reo chuông ngay lập tức)
      this.notificationsGateway.notifyAdminNewOrder(savedOrder);

      return savedOrder;
    } catch (error) {
      // Bất cứ lỗi gì (hết hàng, đứt cáp...) -> Xóa nháp, trả DB về như cũ
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      // Giải phóng bộ nhớ kết nối
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
      relations: { items: { product: true } },
    });

    if (!order) throw new NotFoundException('Đơn hàng không tồn tại');

    const oldStatus = order.status;
    const newStatus = updateDto.status;

    // Cập nhật trạng thái thanh toán nếu có truyền lên
    if (updateDto.paymentStatus) {
      order.paymentStatus = updateDto.paymentStatus;
    }

    if (updateDto.noteAdmin) {
      order.noteAdmin = updateDto.noteAdmin;
    }

    if (currentUserId) {
      order.updateBy = currentUserId;
    }

    if (oldStatus === newStatus) return order;

    // LOGIC HOÀN KHO: Nếu đơn bị HỦY, phải trả lại sách vào kho
    if (
      newStatus === OrderStatus.CANCELLED &&
      oldStatus !== OrderStatus.CANCELLED
    ) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // Cộng lại số lượng tồn kho cho từng sản phẩm
        const items = order.items || [];
        if (items.length === 0) {
          throw new BadRequestException('Giỏ hàng không tồn tại');
        }

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

        // Bắn Socket báo cho khách biết đơn đã hoàn tất Hủy
        if (order.user || currentUserId) {
          const userIdToNotify = order.user?.id || currentUserId;
          this.notificationsGateway.notifyUserOrderStatus(
            userIdToNotify,
            savedOrder,
          );
        }
        return order;
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw new BadRequestException(
          'Lỗi khi hoàn kho, không thể hủy đơn. Vui lòng thử lại sau ít phút.',
        );
      } finally {
        await queryRunner.release();
      }
    }

    // Nếu không phải thao tác hủy đơn thì chỉ cần save status bình thường
    order.status = newStatus;
    const savedOrder = await this.orderRepo.save(order);

    // Bắn Socket báo cho khách biết đơn đang được Gói/Giao
    if (order.user || currentUserId) {
      const userIdToNotify = order.user?.id || currentUserId;
      this.notificationsGateway.notifyUserOrderStatus(
        userIdToNotify,
        savedOrder,
      );
    }
    return this.orderRepo.save(order);
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
}
