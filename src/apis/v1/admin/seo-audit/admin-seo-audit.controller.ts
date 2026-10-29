import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { Roles } from '@app/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Role } from '@app/common/enums/role.enum';
import { SeoAuditService } from '@app/modules/seo-audit/seo-audit.service';
import {
  AnalyzeSeoDraftDto,
  AuditProductOptionsDto,
} from '@app/modules/seo-audit/dto/audit-content.dto';

@Controller('admin/seo-audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminSeoAuditController {
  constructor(private readonly seoAuditService: SeoAuditService) {}

  /**
   * 1. Chấm điểm SEO trực tiếp trên bản nháp (Draft) khi Admin đang gõ trên trình soạn thảo Section.
   * Không lưu vào Database để hỗ trợ kiểm tra nhanh theo thời gian thực.
   */
  @Post('analyze-draft')
  analyzeDraft(@Body() dto: AnalyzeSeoDraftDto) {
    return this.seoAuditService.analyzeDraft(dto);
  }

  /**
   * 2. Chạy kiểm tra SEO cho một sản phẩm đã có trong Database và lưu kết quả vào bảng seo_audits.
   * Hoàn toàn độc lập, không chặn quyền lưu sách của Admin.
   */
  @Post('products/:productId')
  auditProduct(
    @Param('productId') productId: string,
    @Body() options: AuditProductOptionsDto,
    @Req() req: any,
  ) {
    return this.seoAuditService.auditProductById(
      productId,
      options,
      req.user?.id,
    );
  }

  /**
   * 3. Lấy báo cáo chấm điểm SEO gần nhất của sản phẩm
   */
  @Get('products/:productId/latest')
  getLatestProductAudit(@Param('productId') productId: string) {
    return this.seoAuditService.getLatestAuditByProductId(productId);
  }

  /**
   * 4. Xem lịch sử các lần chấm điểm SEO của sản phẩm theo từng phiên bản chỉnh sửa
   */
  @Get('products/:productId/history')
  getProductAuditHistory(
    @Param('productId') productId: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.seoAuditService.getAuditHistoryByProductId(productId, limit);
  }
}
