import {
  Controller,
  Get,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { Roles } from '@app/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Role } from '@app/common/enums/role.enum';
import { AnalyticsService } from '@app/modules/analytics/analytics.service';
import { QueryAnalyticsDto } from '@app/modules/analytics/dto/query-analytics.dto';

@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * 1. Thống kê tổng quan (KPI Stat Cards): Doanh thu, Đơn hàng, Khách mới, Sách bán, AOV và % tăng trưởng
   */
  @Get('overview')
  async getOverview(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getOverview(startDate, endDate);
  }

  /**
   * 2. Doanh thu theo chu kỳ (Area/Multi-line Chart): Doanh thu, Vốn, Lợi nhuận, Số đơn theo ngày/tuần/tháng/năm
   */
  @Get('revenue')
  async getRevenueAnalytics(@Query() query: QueryAnalyticsDto) {
    return this.analyticsService.getRevenueAnalytics(query);
  }

  /**
   * 3. Phân bố trạng thái đơn hàng (Donut Chart): Tỷ lệ và số lượng các trạng thái đơn
   */
  @Get('order-status')
  async getOrderStatusAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getOrderStatusAnalytics(startDate, endDate);
  }

  /**
   * 4. Thống kê theo phương thức thanh toán (Donut/Gauge Chart): VNPAY, COD, MOMO...
   */
  @Get('payment-methods')
  async getPaymentMethodAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getPaymentMethodAnalytics(startDate, endDate);
  }

  /**
   * 5. Top 10 sách bán chạy nhất (Leaderboard/Horizontal Bar Chart)
   */
  @Get('top-selling-books')
  async getTopSellingBooks(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getTopSellingBooks(limit, startDate, endDate);
  }

  /**
   * 6. Doanh số theo danh mục sách (Bar/Treemap Chart)
   */
  @Get('category-sales')
  async getCategorySalesAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getCategorySalesAnalytics(startDate, endDate);
  }

  /**
   * 7. Tăng trưởng khách hàng (Combo Bar + Line Chart): Khách mới vs Khách quay lại theo tháng
   */
  @Get('customer-growth')
  async getCustomerGrowthAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getCustomerGrowthAnalytics(startDate, endDate);
  }
}
