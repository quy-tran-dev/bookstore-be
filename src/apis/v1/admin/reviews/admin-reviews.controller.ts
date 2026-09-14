import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
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
import { DiscordService } from '@app/modules/discord/discord.service';
import { ReviewsService } from '@app/modules/reviews/reviews.service';
import {
  AdminReplyReviewDto,
  AdminUpdateReviewDto,
  QueryAdminReviewDto,
  UpdateReviewStatusDto,
} from '@app/modules/reviews/dto/admin-review.dto';

@Controller('admin/reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly discordService: DiscordService,
  ) {}

  @Get()
  findAll(@Query() query: QueryAdminReviewDto) {
    return this.reviewsService.fetchReviewsWithQuery(query);
  }

  @Get('soft-delete/get')
  getSoftDelete(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('keyword') keyword?: string,
  ) {
    return this.reviewsService.getSoftDeletedReviews(page, limit, keyword);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reviewsService.findOneWithDetails(id);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateReviewStatusDto,
    @Req() req: any,
  ) {
    const result = await this.reviewsService.updateStatus(
      id,
      dto.status,
      req.user?.id,
    );
    this.discordService.sendNewUpdate(
      'WARN',
      ` **[Admin]** Vừa ĐỔI TRẠNG THÁI đánh giá ID \`${id}\` sang \`${dto.status}\``,
      'AdminReviewsController',
    );
    return result;
  }

  @Post(':id/reply')
  async reply(
    @Param('id') id: string,
    @Body() dto: AdminReplyReviewDto,
    @Req() req: any,
  ) {
    const result = await this.reviewsService.adminReply(
      id,
      dto,
      req.user?.id,
    );
    this.discordService.sendNewUpdate(
      'INFO',
      ` **[Admin]** Vừa PHẢN HỒI đánh giá ID \`${id}\`: "${dto.adminReply}"`,
      'AdminReviewsController',
    );
    return result;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: AdminUpdateReviewDto,
    @Req() req: any,
  ) {
    const result = await this.reviewsService.adminUpdate(
      id,
      dto,
      req.user?.id,
    );
    this.discordService.sendNewUpdate(
      'WARN',
      ` **[Admin]** Vừa CẬP NHẬT đánh giá ID \`${id}\``,
      'AdminReviewsController',
    );
    return result;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    await this.reviewsService.softDelete(id, req.user?.id);
    this.discordService.sendNewUpdate(
      'WARN',
      ` **[Admin]** Vừa XÓA TẠM (Soft Delete) đánh giá ID: \`${id}\``,
      'AdminReviewsController',
    );
    return { message: 'Đã xóa đánh giá vào thùng rác' };
  }

  @Post('restore/:id')
  async restore(@Param('id') id: string, @Req() req: any) {
    await this.reviewsService.restore(id, req.user?.id);
    this.discordService.sendNewUpdate(
      'WARN',
      ` **[Admin]** Vừa KHÔI PHỤC đánh giá ID: \`${id}\``,
      'AdminReviewsController',
    );
    return { message: 'Đã khôi phục đánh giá thành công' };
  }

  @Delete('hard/:id')
  async hardRemove(@Param('id') id: string) {
    await this.reviewsService.hardDelete(id);
    this.discordService.sendNewUpdate(
      'WARN',
      ` **[Admin]** Vừa XÓA VĨNH VIỄN đánh giá ID: \`${id}\``,
      'AdminReviewsController',
    );
    return { message: 'Đã xóa vĩnh viễn đánh giá khỏi hệ thống' };
  }
}
