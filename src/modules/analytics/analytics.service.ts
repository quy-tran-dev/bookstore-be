import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { Category } from '../categories/entities/category.entity';
import { Payment } from '../payment/entities/payment.entity';
import { OrderStatus } from '@app/common/enums/order-status.enum';
import { PaymentMethod } from '@app/common/enums/payment-method.enum';
import { PaymentStatus } from '@app/common/enums/payment-status.enum';
import { Role } from '@app/common/enums/role.enum';
import { AnalyticsPeriod, QueryAnalyticsDto } from './dto/query-analytics.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly dataSource: DataSource,
  ) {}

  // --- HELPER: XỬ LÝ KHOẢNG THỜI GIAN ---
  private parseDateRange(startDate?: string, endDate?: string, defaultDays: number = 30) {
    const end = endDate ? new Date(`${endDate}T23:59:59.999Z`) : new Date();
    const start = startDate
      ? new Date(`${startDate}T00:00:00.000Z`)
      : new Date(end.getTime() - defaultDays * 24 * 60 * 60 * 1000);
    return { start, end };
  }

  // --- HELPER: TÍNH TỶ LỆ TĂNG TRƯỞNG ---
  private calculateGrowth(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return Number((((current - previous) / previous) * 100).toFixed(2));
  }

  // =========================================================================
  // 1. TỔNG QUAN KPI DASHBOARD (STAT CARDS)
  // =========================================================================
  async getOverview(startDate?: string, endDate?: string) {
    const { start: currentStart, end: currentEnd } = this.parseDateRange(
      startDate,
      endDate,
      30,
    );

    // Tính khoảng thời gian kỳ trước đó có cùng độ dài
    const duration = currentEnd.getTime() - currentStart.getTime();
    const prevEnd = new Date(currentStart.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - duration);

    // 1.1 Doanh thu & Số đơn hàng (Kỳ hiện tại)
    const currentOrdersQuery = await this.orderRepo
      .createQueryBuilder('order')
      .select('COUNT(order.id)', 'totalOrders')
      .addSelect(
        `COALESCE(SUM(CASE WHEN order.status = :completedStatus THEN order.totalAmount ELSE 0 END), 0)`,
        'totalRevenue',
      )
      .where('order.createdAt BETWEEN :start AND :end', {
        start: currentStart,
        end: currentEnd,
        completedStatus: OrderStatus.COMPLETED,
      })
      .andWhere('order.status != :cancelledStatus', {
        cancelledStatus: OrderStatus.CANCELLED,
      })
      .getRawOne();

    // 1.2 Doanh thu & Số đơn hàng (Kỳ trước)
    const prevOrdersQuery = await this.orderRepo
      .createQueryBuilder('order')
      .select('COUNT(order.id)', 'totalOrders')
      .addSelect(
        `COALESCE(SUM(CASE WHEN order.status = :completedStatus THEN order.totalAmount ELSE 0 END), 0)`,
        'totalRevenue',
      )
      .where('order.createdAt BETWEEN :start AND :end', {
        start: prevStart,
        end: prevEnd,
        completedStatus: OrderStatus.COMPLETED,
      })
      .andWhere('order.status != :cancelledStatus', {
        cancelledStatus: OrderStatus.CANCELLED,
      })
      .getRawOne();

    // 1.3 Khách hàng mới
    const [curCustCount, prevCustCount] = await Promise.all([
      this.userRepo
        .createQueryBuilder('u')
        .where('u.role = :role', { role: Role.CUSTOMER })
        .andWhere('u.createdAt BETWEEN :start AND :end', {
          start: currentStart,
          end: currentEnd,
        })
        .getCount(),
      this.userRepo
        .createQueryBuilder('u')
        .where('u.role = :role', { role: Role.CUSTOMER })
        .andWhere('u.createdAt BETWEEN :start AND :end', {
          start: prevStart,
          end: prevEnd,
        })
        .getCount(),
    ]);

    // 1.4 Số lượng sách đã bán (Tổng items trong các đơn COMPLETED)
    const [curBooksQuery, prevBooksQuery] = await Promise.all([
      this.orderItemRepo
        .createQueryBuilder('item')
        .innerJoin('item.order', 'order')
        .select('COALESCE(SUM(item.quantity), 0)', 'totalQuantity')
        .where('order.status = :completedStatus', {
          completedStatus: OrderStatus.COMPLETED,
        })
        .andWhere('order.createdAt BETWEEN :start AND :end', {
          start: currentStart,
          end: currentEnd,
        })
        .getRawOne(),
      this.orderItemRepo
        .createQueryBuilder('item')
        .innerJoin('item.order', 'order')
        .select('COALESCE(SUM(item.quantity), 0)', 'totalQuantity')
        .where('order.status = :completedStatus', {
          completedStatus: OrderStatus.COMPLETED,
        })
        .andWhere('order.createdAt BETWEEN :start AND :end', {
          start: prevStart,
          end: prevEnd,
        })
        .getRawOne(),
    ]);

    const curRevenue = Number(currentOrdersQuery?.totalRevenue || 0);
    const prevRevenue = Number(prevOrdersQuery?.totalRevenue || 0);
    const curOrders = Number(currentOrdersQuery?.totalOrders || 0);
    const prevOrders = Number(prevOrdersQuery?.totalOrders || 0);
    const curBooks = Number(curBooksQuery?.totalQuantity || 0);
    const prevBooks = Number(prevBooksQuery?.totalQuantity || 0);

    const curAov = curOrders > 0 ? Math.round(curRevenue / curOrders) : 0;
    const prevAov = prevOrders > 0 ? Math.round(prevRevenue / prevOrders) : 0;

    return {
      revenue: {
        current: curRevenue,
        previous: prevRevenue,
        growthRate: this.calculateGrowth(curRevenue, prevRevenue),
      },
      orders: {
        current: curOrders,
        previous: prevOrders,
        growthRate: this.calculateGrowth(curOrders, prevOrders),
      },
      customers: {
        current: curCustCount,
        previous: prevCustCount,
        growthRate: this.calculateGrowth(curCustCount, prevCustCount),
      },
      booksSold: {
        current: curBooks,
        previous: prevBooks,
        growthRate: this.calculateGrowth(curBooks, prevBooks),
      },
      averageOrderValue: {
        current: curAov,
        previous: prevAov,
        growthRate: this.calculateGrowth(curAov, prevAov),
      },
    };
  }

  // =========================================================================
  // 2. DOANH THU & LỢI NHUẬN THEO THỜI GIAN (AREA / MULTI-LINE CHART)
  // =========================================================================
  async getRevenueAnalytics(query: QueryAnalyticsDto) {
    const period = query.period || AnalyticsPeriod.MONTH;
    const defaultDays = period === AnalyticsPeriod.DAY ? 30 : 180;
    const { start, end } = this.parseDateRange(
      query.startDate,
      query.endDate,
      defaultDays,
    );

    let trunc = 'month';
    let format = 'YYYY-MM';

    if (period === AnalyticsPeriod.DAY) {
      trunc = 'day';
      format = 'YYYY-MM-DD';
    } else if (period === AnalyticsPeriod.WEEK) {
      trunc = 'week';
      format = 'YYYY-"W"IW';
    } else if (period === AnalyticsPeriod.YEAR) {
      trunc = 'year';
      format = 'YYYY';
    }

    const rawData = await this.dataSource.query(
      `
      SELECT 
        TO_CHAR(DATE_TRUNC($1, o.created_at), $2) AS "date",
        COALESCE(SUM(o."totalAmount"), 0)::numeric AS "revenue",
        COALESCE(SUM(oi.quantity * COALESCE(p.cost, p.price * 0.65, 0)), 0)::numeric AS "cost",
        COUNT(DISTINCT o.id)::int AS "orders"
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.status = $3
        AND o.created_at BETWEEN $4 AND $5
      GROUP BY DATE_TRUNC($1, o.created_at)
      ORDER BY DATE_TRUNC($1, o.created_at) ASC
      `,
      [trunc, format, OrderStatus.COMPLETED, start, end],
    );

    return rawData.map((item: any) => {
      const revenue = Number(item.revenue || 0);
      const cost = Number(item.cost || 0);
      const profit = Math.max(0, revenue - cost);
      return {
        date: item.date,
        revenue,
        cost,
        profit,
        orders: Number(item.orders || 0),
      };
    });
  }

  // =========================================================================
  // 3. TỶ LỆ TRẠNG THÁI ĐƠN HÀNG (DONUT / PIE CHART)
  // =========================================================================
  async getOrderStatusAnalytics(startDate?: string, endDate?: string) {
    const { start, end } = this.parseDateRange(startDate, endDate, 90);

    const rawData = await this.orderRepo
      .createQueryBuilder('order')
      .select('order.status', 'status')
      .addSelect('COUNT(order.id)', 'count')
      .where('order.createdAt BETWEEN :start AND :end', { start, end })
      .groupBy('order.status')
      .getRawMany();

    const STATUS_LABELS: Record<string, string> = {
      [OrderStatus.COMPLETED]: 'Hoàn thành',
      [OrderStatus.SHIPPING]: 'Đang giao hàng',
      [OrderStatus.CONFIRMED]: 'Đã xác nhận',
      [OrderStatus.PENDING]: 'Chờ duyệt',
      [OrderStatus.CANCELLED]: 'Đã hủy',
      [OrderStatus.REFUNDED]: 'Hoàn trả/Hoàn tiền',
    };

    const totalOrders = rawData.reduce(
      (sum, item) => sum + Number(item.count || 0),
      0,
    );

    return rawData.map((item) => {
      const count = Number(item.count || 0);
      const percentage =
        totalOrders > 0 ? Number(((count / totalOrders) * 100).toFixed(1)) : 0;
      return {
        status: item.status,
        label: STATUS_LABELS[item.status] || item.status,
        count,
        percentage,
      };
    });
  }

  // =========================================================================
  // 4. CƠ CẤU PHƯƠNG THỨC THANH TOÁN (DONUT / GAUGE CHART)
  // =========================================================================
  async getPaymentMethodAnalytics(startDate?: string, endDate?: string) {
    const { start, end } = this.parseDateRange(startDate, endDate, 90);

    const rawData = await this.orderRepo
      .createQueryBuilder('order')
      .select('order.paymentMethod', 'method')
      .addSelect('COUNT(order.id)', 'count')
      .addSelect(
        `COALESCE(SUM(CASE WHEN order.paymentStatus = :paidStatus THEN order.totalAmount ELSE 0 END), 0)`,
        'totalAmount',
      )
      .where('order.createdAt BETWEEN :start AND :end', { start, end })
      .andWhere('order.status != :cancelledStatus', {
        cancelledStatus: OrderStatus.CANCELLED,
      })
      .setParameter('paidStatus', PaymentStatus.PAID)
      .groupBy('order.paymentMethod')
      .getRawMany();

    const METHOD_LABELS: Record<string, string> = {
      [PaymentMethod.VNPAY]: 'Cổng VNPAY',
      [PaymentMethod.COD]: 'Tiền mặt khi nhận (COD)',
      [PaymentMethod.MOMO]: 'Ví MoMo',
    };

    const totalCount = rawData.reduce(
      (sum, item) => sum + Number(item.count || 0),
      0,
    );

    return rawData.map((item) => {
      const count = Number(item.count || 0);
      const totalAmount = Number(item.totalAmount || 0);
      const percentage =
        totalCount > 0 ? Number(((count / totalCount) * 100).toFixed(1)) : 0;
      return {
        method: item.method,
        label: METHOD_LABELS[item.method] || item.method,
        count,
        totalAmount,
        percentage,
      };
    });
  }

  // =========================================================================
  // 5. TOP SÁCH BÁN CHẠY NHẤT (HORIZONTAL BAR CHART / LEADERBOARD TABLE)
  // =========================================================================
  async getTopSellingBooks(
    limit: number = 10,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = this.parseDateRange(startDate, endDate, 180);

    const rawData = await this.dataSource.query(
      `
      SELECT 
        p.id AS "productId",
        p.name AS "name",
        p.slug AS "slug",
        p.stock_quantity AS "stockQuantity",
        COALESCE(SUM(oi.quantity), 0)::int AS "soldQuantity",
        COALESCE(SUM(oi."totalPrice"), 0)::numeric AS "revenue"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      WHERE o.status = $1
        AND o.created_at BETWEEN $2 AND $3
      GROUP BY p.id, p.name, p.slug, p.stock_quantity
      ORDER BY "soldQuantity" DESC
      LIMIT $4
      `,
      [OrderStatus.COMPLETED, start, end, limit],
    );

    // Lấy thêm thông tin ảnh đại diện và tác giả của các sách trong top
    const productIds = rawData.map((r: any) => r.productId);
    const productsMap = new Map<string, any>();

    if (productIds.length > 0) {
      const prods = await this.productRepo.find({
        where: productIds.map((id: string) => ({ id })),
        relations: {
          albums: { media: true },
          authors: true,
        },
      });
      for (const p of prods) {
        productsMap.set(p.id, p);
      }
    }

    return rawData.map((item: any) => {
      const prod = productsMap.get(item.productId);
      const coverUrl =
        prod?.albums && prod.albums.length > 0
          ? prod.albums[0]?.media?.fileUrl
          : null;
      const authorName =
        prod?.authors && prod.authors.length > 0
          ? prod.authors.map((a: any) => a.name).join(', ')
          : 'Đang cập nhật';

      return {
        productId: item.productId,
        name: item.name,
        slug: item.slug,
        coverUrl: coverUrl || null,
        authorName,
        soldQuantity: Number(item.soldQuantity || 0),
        revenue: Number(item.revenue || 0),
        stockQuantity: Number(item.stockQuantity || 0),
      };
    });
  }

  // =========================================================================
  // 6. DOANH THU THEO DANH MỤC SÁCH (VERTICAL BAR CHART / TREEMAP)
  // =========================================================================
  async getCategorySalesAnalytics(startDate?: string, endDate?: string) {
    const { start, end } = this.parseDateRange(startDate, endDate, 180);

    const rawData = await this.dataSource.query(
      `
      SELECT 
        c.id AS "categoryId",
        c.name AS "categoryName",
        COALESCE(SUM(oi.quantity), 0)::int AS "booksSold",
        COALESCE(SUM(oi."totalPrice"), 0)::numeric AS "revenue"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      JOIN product_categories pc ON pc.product_id = p.id
      JOIN categories c ON c.id = pc.category_id
      WHERE o.status = $1
        AND o.created_at BETWEEN $2 AND $3
      GROUP BY c.id, c.name
      ORDER BY "revenue" DESC
      `,
      [OrderStatus.COMPLETED, start, end],
    );

    const totalRevenue = rawData.reduce(
      (sum: number, item: any) => sum + Number(item.revenue || 0),
      0,
    );

    return rawData.map((item: any) => {
      const revenue = Number(item.revenue || 0);
      const percentage =
        totalRevenue > 0 ? Number(((revenue / totalRevenue) * 100).toFixed(1)) : 0;
      return {
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        booksSold: Number(item.booksSold || 0),
        revenue,
        percentage,
      };
    });
  }

  // =========================================================================
  // 7. TĂNG TRƯỞNG KHÁCH HÀNG & RETENTION (COMBO CHART: BAR + LINE)
  // =========================================================================
  async getCustomerGrowthAnalytics(startDate?: string, endDate?: string) {
    const { start, end } = this.parseDateRange(startDate, endDate, 180);

    // 7.1 Lấy số lượng khách hàng mới đăng ký theo tháng
    const newCustomersRaw = await this.dataSource.query(
      `
      SELECT 
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS "date",
        COUNT(id)::int AS "newCustomers"
      FROM users
      WHERE role = $1
        AND created_at BETWEEN $2 AND $3
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at) ASC
      `,
      [Role.CUSTOMER, start, end],
    );

    // 7.2 Lấy số lượng khách hàng quay lại mua hàng & tổng đơn theo tháng
    const ordersByMonthRaw = await this.dataSource.query(
      `
      SELECT 
        TO_CHAR(DATE_TRUNC('month', o.created_at), 'YYYY-MM') AS "date",
        COUNT(DISTINCT o.id)::int AS "totalOrders",
        COUNT(DISTINCT CASE WHEN prev.prev_order_count > 0 THEN o.user_id END)::int AS "returningCustomers"
      FROM orders o
      LEFT JOIN LATERAL (
        SELECT COUNT(id) AS prev_order_count
        FROM orders sub
        WHERE sub.user_id = o.user_id
          AND sub.created_at < DATE_TRUNC('month', o.created_at)
      ) prev ON true
      WHERE o.status != $1
        AND o.created_at BETWEEN $2 AND $3
      GROUP BY DATE_TRUNC('month', o.created_at)
      ORDER BY DATE_TRUNC('month', o.created_at) ASC
      `,
      [OrderStatus.CANCELLED, start, end],
    );

    // Ghép 2 bộ dữ liệu theo mốc tháng (date)
    const resultMap = new Map<string, any>();

    for (const item of newCustomersRaw) {
      resultMap.set(item.date, {
        date: item.date,
        newCustomers: Number(item.newCustomers || 0),
        returningCustomers: 0,
        totalOrders: 0,
      });
    }

    for (const item of ordersByMonthRaw) {
      const existing = resultMap.get(item.date) || {
        date: item.date,
        newCustomers: 0,
        returningCustomers: 0,
        totalOrders: 0,
      };
      existing.totalOrders = Number(item.totalOrders || 0);
      existing.returningCustomers = Number(item.returningCustomers || 0);
      resultMap.set(item.date, existing);
    }

    return Array.from(resultMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }
}
