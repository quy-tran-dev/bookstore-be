import { DataSource } from 'typeorm';
import { Order } from '../../modules/orders/entities/order.entity';
import { OrderItem } from '../../modules/orders/entities/order-item.entity';
import { Payment } from '../../modules/payment/entities/payment.entity';
import { Review } from '../../modules/reviews/entities/review.entity';
import { User } from '../../modules/users/entities/user.entity';
import { Product } from '../../modules/products/entities/product.entity';
import { OrderStatus } from '@app/common/enums/order-status.enum';
import { PaymentMethod } from '@app/common/enums/payment-method.enum';
import { PaymentStatus } from '@app/common/enums/payment-status.enum';
import { StatusReview } from '@app/common/enums/status-review.enum';
import { Role } from '@app/common/enums/role.enum';

const CUSTOMER_NAMES = [
  'Nguyễn Văn An',
  'Trần Thị Mai',
  'Lê Hoàng Long',
  'Phạm Minh Đức',
  'Võ Thảo Vy',
  'Đặng Tuấn Anh',
  'Hoàng Bảo Ngọc',
  'Bùi Gia Huy',
  'Dương Thúy Hằng',
  'Lý Quốc Bảo',
  'Phan Thanh Thảo',
  'Ngô Hữu Phước',
  'Đỗ Quỳnh Anh',
  'Hồ Công Danh',
  'Trịnh Hoài Nam',
  'Nguyễn Thị Kim Ngân',
];

const ADDRESSES = [
  '123 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
  '45 Lê Duẩn, Quận Hải Châu, Đà Nẵng',
  '88 Cầu Giấy, Phường Quan Hoa, Quận Cầu Giấy, Hà Nội',
  '12 Đinh Tiên Hoàng, Quận Ninh Kiều, Cần Thơ',
  '78 Trần Phú, Phường Lộc Thọ, TP. Nha Trang, Khánh Hòa',
  '34 Nguyễn Thị Minh Khai, Phường Đa Kao, Quận 1, TP. Hồ Chí Minh',
  '56 Phan Đình Phùng, Phường 2, TP. Đà Lạt, Lâm Đồng',
  '99 Hoàng Diệu, Phường Thắng Lợi, TP. Buôn Ma Thuột, Đắk Lắk',
  '15 Quang Trung, Quận Gò Vấp, TP. Hồ Chí Minh',
  '204 Xã Đàn, Quận Đống Đa, Hà Nội',
];

const REVIEW_COMMENTS = [
  { rating: 5, comment: 'Sách rất hay, đóng gói đẹp và chắc chắn. Giao hàng siêu nhanh!' },
  { rating: 5, comment: 'Nội dung vô cùng sâu sắc, mở mang nhiều góc nhìn mới. Rất đáng tiền mua!' },
  { rating: 5, comment: 'Chất lượng giấy in xịn sò, font chữ dễ đọc, dịch giả hành văn rất mượt mà.' },
  { rating: 4, comment: 'Sách hay, bìa đẹp. Tuy nhiên shipper giao hơi trễ 1 ngày nhưng vẫn cho 4 sao vì nội dung tốt.' },
  { rating: 4, comment: 'Nội dung bổ ích, áp dụng được ngay vào công việc và cuộc sống.' },
  { rating: 5, comment: 'Một trong những cuốn sách hay nhất mình từng đọc trong năm nay. 10/10!' },
  { rating: 3, comment: 'Nội dung ở mức khá, có một số chương viết hơi dài dòng, nhưng nhìn chung vẫn ổn.' },
  { rating: 5, comment: 'Tuyệt vời! Đọc một mạch hết luôn trong 2 ngày nghỉ cuối tuần.' },
];

const BANK_CODES = ['NCB', 'VCB', 'MBB', 'TCB', 'ACB', 'BIDV'];

export const seedOrders = async (dataSource: DataSource) => {
  console.log('\n Đang reset dữ liệu Orders, Payments & Reviews...');

  // Reset sạch sẽ dữ liệu cũ
  await dataSource.query(
    `TRUNCATE TABLE "payments", "order_items", "orders", "reviews" CASCADE`,
  );

  console.log(' Đang lấy danh sách Users & Products...');
  const userRepo = dataSource.getRepository(User);
  const productRepo = dataSource.getRepository(Product);
  const orderRepo = dataSource.getRepository(Order);
  const paymentRepo = dataSource.getRepository(Payment);
  const reviewRepo = dataSource.getRepository(Review);

  // Lấy các user có role CUSTOMER
  let customers = await userRepo.find({ where: { role: Role.CUSTOMER } });
  if (customers.length === 0) {
    customers = await userRepo.find();
  }

  const products = await productRepo.find({
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      finalPrice: true,
      cost: true,
      stockQuantity: true,
      soldCount: true,
    }
    // select: ['id', 'name', 'slug', 'price', 'finalPrice', 'cost', 'stockQuantity', 'soldCount'],
  });

  if (products.length === 0 || customers.length === 0) {
    console.warn('⚠️ Không tìm thấy User hoặc Product để tạo Order. Hãy chạy seedUsers và seedProducts trước!');
    return;
  }

  console.log(` Tìm thấy ${customers.length} khách hàng và ${products.length} tựa sách. Bắt đầu sinh 180 đơn hàng...`);

  const now = new Date();
  const totalOrdersToGenerate = 180;
  const createdOrders: Order[] = [];
  const createdPayments: Payment[] = [];
  const createdReviews: Review[] = [];

  // Tạo 180 đơn hàng trải dài trong 180 ngày (6 tháng)
  for (let i = 0; i < totalOrdersToGenerate; i++) {
    // Phân bổ thời gian: 50% trong 60 ngày gần nhất, 30% trong 60-120 ngày, 20% trong 120-180 ngày
    let daysAgo: number;
    const rand = Math.random();
    if (rand < 0.5) {
      daysAgo = Math.floor(Math.random() * 60); // 0 - 60 ngày
    } else if (rand < 0.8) {
      daysAgo = Math.floor(60 + Math.random() * 60); // 60 - 120 ngày
    } else {
      daysAgo = Math.floor(120 + Math.random() * 60); // 120 - 180 ngày
    }

    const orderDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000 - Math.floor(Math.random() * 86400000));
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const customerName = CUSTOMER_NAMES[Math.floor(Math.random() * CUSTOMER_NAMES.length)];
    const address = ADDRESSES[Math.floor(Math.random() * ADDRESSES.length)];
    const phone = `09${Math.floor(10000000 + Math.random() * 90000000)}`;

    // Tỷ lệ trạng thái đơn hàng thực tế
    let status: OrderStatus;
    const statusRand = Math.random();
    if (statusRand < 0.70) {
      status = OrderStatus.COMPLETED;
    } else if (statusRand < 0.80) {
      status = OrderStatus.SHIPPING;
    } else if (statusRand < 0.85) {
      status = OrderStatus.CONFIRMED;
    } else if (statusRand < 0.90) {
      status = OrderStatus.PENDING;
    } else if (statusRand < 0.98) {
      status = OrderStatus.CANCELLED;
    } else {
      status = OrderStatus.REFUNDED;
    }

    // Phương thức thanh toán
    let paymentMethod: PaymentMethod;
    const payMethodRand = Math.random();
    if (payMethodRand < 0.55) {
      paymentMethod = PaymentMethod.VNPAY;
    } else if (payMethodRand < 0.95) {
      paymentMethod = PaymentMethod.COD;
    } else {
      paymentMethod = PaymentMethod.MOMO;
    }

    // Trạng thái thanh toán
    let paymentStatus: PaymentStatus;
    if (status === OrderStatus.COMPLETED) {
      paymentStatus = PaymentStatus.PAID;
    } else if (status === OrderStatus.CANCELLED) {
      paymentStatus = Math.random() < 0.5 ? PaymentStatus.FAILED : PaymentStatus.UNPAID;
    } else if (status === OrderStatus.REFUNDED) {
      paymentStatus = PaymentStatus.PAID;
    } else {
      paymentStatus = paymentMethod === PaymentMethod.VNPAY ? PaymentStatus.PAID : PaymentStatus.UNPAID;
    }

    // Chọn từ 1 đến 4 sản phẩm ngẫu nhiên cho đơn hàng
    const itemCount = Math.floor(1 + Math.random() * 3);
    const selectedProducts: Product[] = [];
    while (selectedProducts.length < itemCount) {
      const p = products[Math.floor(Math.random() * products.length)];
      if (!selectedProducts.find((item) => item.id === p.id)) {
        selectedProducts.push(p);
      }
    }

    let totalAmount = 0;
    const orderItems: OrderItem[] = [];

    for (const prod of selectedProducts) {
      const quantity = Math.floor(1 + Math.random() * 2); // 1 - 2 cuốn
      const unitPrice = Number(prod.finalPrice || prod.price || 95000);
      const totalPrice = unitPrice * quantity;
      totalAmount += totalPrice;

      const item = new OrderItem();
      item.product = prod;
      item.productName = prod.name || 'Sách hay tuyển chọn';
      item.quantity = quantity;
      item.unitPrice = unitPrice;
      item.totalPrice = totalPrice;
      item.createdAt = orderDate;
      item.updatedAt = orderDate;
      orderItems.push(item);
    }

    const shippingFee = 30000;
    const finalAmount = totalAmount + shippingFee;
    const codeSuffix = `${orderDate.getTime().toString().slice(-6)}-${i.toString().padStart(3, '0')}`;
    const orderCode = `ORD-${codeSuffix}`;

    const order = new Order();
    order.code = orderCode;
    order.user = customer;
    order.customerName = customerName;
    order.customerPhone = phone;
    order.shippingAddress = address;
    order.note = Math.random() < 0.3 ? 'Giao giờ hành chính giúp em ạ' : '';
    order.noteAdmin = '';
    order.totalAmount = totalAmount;
    order.shippingFee = shippingFee;
    order.finalAmount = finalAmount;
    order.status = status;
    order.paymentMethod = paymentMethod;
    order.paymentStatus = paymentStatus;
    order.items = orderItems;
    order.createdAt = orderDate;
    order.updatedAt = orderDate;

    createdOrders.push(order);
  }

  console.log(' Đang lưu danh sách Đơn hàng vào Database...');
  // Lưu theo batch 50 đơn một lần để tối ưu bộ nhớ
  for (let i = 0; i < createdOrders.length; i += 50) {
    const batch = createdOrders.slice(i, i + 50);
    await orderRepo.save(batch);
  }

  console.log(' Đang tạo dữ liệu Giao dịch Payments & Đánh giá Reviews...');
  // Nạp lại các đơn hàng vừa lưu để lấy ID tạo Payments và Reviews
  const savedOrders = await orderRepo.find({
    relations: { user: true, items: { product: true } },
  });

  for (const ord of savedOrders) {
    // 1. Tạo Payment record cho các đơn VNPAY
    if (ord.paymentMethod === PaymentMethod.VNPAY) {
      const payment = new Payment();
      payment.order = ord;
      payment.amount = ord.finalAmount || 0;
      payment.method = PaymentMethod.VNPAY;
      payment.status = ord.paymentStatus || PaymentStatus.PAID;
      payment.createdAt = ord.createdAt;
      payment.updatedAt = ord.createdAt;

      if (ord.paymentStatus === PaymentStatus.PAID) {
        payment.transactionNo = `VNP${ord.createdAt.getTime().toString().slice(-8)}`;
        payment.bankCode = BANK_CODES[Math.floor(Math.random() * BANK_CODES.length)];
        payment.bankTranNo = `BT${Math.floor(100000 + Math.random() * 900000)}`;
        payment.cardType = 'ATM';
        payment.orderInfo = `Thanh toan don hang ${ord.code}`;
        payment.paidAt = ord.createdAt;
        payment.responseCode = '00';
        payment.rawResponse = {
          vnp_ResponseCode: '00',
          vnp_TransactionNo: payment.transactionNo,
          vnp_BankCode: payment.bankCode,
          vnp_Amount: (ord.finalAmount || 0) * 100,
        };
      } else {
        payment.responseCode = '24'; // Khách hủy
      }
      createdPayments.push(payment);
    }

    // 2. Tạo Review cho các đơn hàng COMPLETED (tỷ lệ 30% khách để lại review)
    if (ord.status === OrderStatus.COMPLETED && ord.items && Math.random() < 0.35) {
      for (const itm of ord.items) {
        if (itm.product && ord.user) {
          const sample = REVIEW_COMMENTS[Math.floor(Math.random() * REVIEW_COMMENTS.length)];
          const review = new Review();
          review.product = itm.product;
          review.user = ord.user;
          review.order = ord;
          review.rating = sample.rating;
          review.comment = sample.comment;
          review.status = StatusReview.APPROVED;
          review.isPurchased = true;
          review.createdAt = new Date(ord.createdAt.getTime() + 86400000 * Math.floor(1 + Math.random() * 3));
          review.updatedAt = review.createdAt;
          createdReviews.push(review);
          break; // Mỗi đơn review 1 cuốn
        }
      }
    }
  }

  // Lưu Payments
  if (createdPayments.length > 0) {
    for (let i = 0; i < createdPayments.length; i += 50) {
      await paymentRepo.save(createdPayments.slice(i, i + 50));
    }
    console.log(` Đã tạo ${createdPayments.length} bản ghi Payments VNPAY!`);
  }

  // Lưu Reviews (loại bỏ trùng lặp cùng 1 user đánh giá cùng 1 product)
  const uniqueReviews: Review[] = [];
  const seenUserProduct = new Set<string>();

  for (const r of createdReviews) {
    const key = `${r.user.id}_${r.product.id}`;
    if (!seenUserProduct.has(key)) {
      seenUserProduct.add(key);
      uniqueReviews.push(r);
    }
  }

  if (uniqueReviews.length > 0) {
    for (let i = 0; i < uniqueReviews.length; i += 50) {
      await reviewRepo.save(uniqueReviews.slice(i, i + 50));
    }
    console.log(` Đã tạo ${uniqueReviews.length} bài đánh giá Reviews thực tế!`);
  }

  console.log(` Hoàn tất tạo ${savedOrders.length} Đơn hàng thành công!`);
};
