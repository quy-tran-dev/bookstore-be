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
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { ILike } from 'typeorm';
import { Roles } from '@app/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Role } from '@app/common/enums/role.enum';
import { DiscordService } from '@app/modules/discord/discord.service';
import { MediaService } from '@app/modules/media/media.service';
import {
  CreateMediaDto,
  UpdateMediaDto,
} from '@app/modules/media/dto/admin-media.dto';
import { UploadMultipleImageInterceptor } from '@app/common/interceptors/upload-image.interceptor';
import { Media } from '@app/modules/media/entities/media.entity';
import * as fs from 'fs';
import { join } from 'path';

@Controller('admin/medias')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminMediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly discordService: DiscordService,
  ) {}

  // Gọi API: POST /admin/medias/upload-multiple?folder=events&subFolder=tet-2026
  @Post('upload-multiple')
  @UseInterceptors(UploadMultipleImageInterceptor('files', 10))
  async uploadMultipleFiles(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Req() req: any,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất một file');
    }

    // Lấy tên folder chuẩn xác mà Interceptor đã tính toán sẵn
    const finalFolder = req.customUploadFolder || 'general';
    const savedMedias : any[] = [];

    for (const file of files) {
      const mediaData = {
      fileName: file.originalname,
      fileUrl: `/uploads/${finalFolder}/${file.filename}`,
      folderPath: finalFolder, // <--- LƯU VÀO ĐÂY
      mimeType: file.mimetype,
      size: file.size,
      provider: 'local',
      altText: file.originalname.split('.')[0],
    };

      const saved = await this.mediaService.create(mediaData, req.user?.id);
      savedMedias.push(saved);
    }

    this.discordService.sendNewUpdate(
      'INFO',
      `**[Admin]** User ID \`${req.user?.id}\` vừa UPLOAD ${files.length} hình vào thư mục \`${finalFolder}\``,
      'AdminMediaController',
    );

    return savedMedias;
  }

  @Get('grouped')
  getGrouped() {
    return this.mediaService.getGroupedMedia();
  }

  // API này thường được gọi ngầm sau khi upload file thành công
  @Post()
  async create(@Body() dto: CreateMediaDto, @Req() req: any) {
    const result = await this.mediaService.create(dto, req.user?.id);
    this.discordService.sendNewUpdate(
      'INFO',
      `**[Admin]** User ID \`${req.user?.id}\` vừa LƯU thông tin file: **${result.fileName}**`,
      'AdminMediaController',
    );
    return result;
  }
  
  @Get('folders')
  getFolderStats() {
    return this.mediaService.getFolderStats();
  }

  // 🛠 CẬP NHẬT: Cho phép API Get All lọc hình theo Folder
 @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit: number, // 24 hình 1 trang là đẹp cho Grid
    @Query('folderPath') folderPath?: string,
    @Query('keyword') keyword?: string,
  ) {
    const whereCondition: any = {};

    if (keyword) {
      whereCondition.fileName = ILike(`%${keyword}%`);
    }

    if (folderPath) {
      // Bỏ LIKE, so sánh BẰNG trực tiếp -> Siêu tốc độ!
      whereCondition.folderPath = folderPath; 
    }

    return this.mediaService.findAllPaginated(page, limit, {
      where: whereCondition,
      order: { createdAt: 'DESC' },
    });
  }

//   @Get()
//   findAll(
//     @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
//     @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number, // Thường hiển thị dạng Grid nên lấy 12 hoặc 24
//     @Query('keyword') keyword?: string,
//     @Query('mimeType') mimeType?: string,
//   ) {
//     const whereCondition: any = {};

//     if (keyword) {
//       // Cho phép tìm theo tên file gốc
//       whereCondition.fileName = ILike(`%${keyword}%`);
//     }

//     if (mimeType) {
//       // Cho phép lọc theo loại (ví dụ: chỉ lấy image/png)
//       whereCondition.mimeType = ILike(`%${mimeType}%`);
//     }

//     return this.mediaService.findAllPaginated(page, limit, {
//       where: whereCondition,
//       order: { createdAt: 'DESC' }, // Ảnh mới up luôn hiển thị lên đầu
//     });
//   }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.mediaService.findOne({ id } as any);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMediaDto,
    @Req() req: any,
  ) {
    // Admin thường dùng hàm này để cập nhật altText cho chuẩn SEO
    const result = await this.mediaService.update(id, dto, req.user?.id);
    this.discordService.sendNewUpdate(
      'INFO',
      `**[Admin]** User ID \`${req.user?.id}\` vừa CẬP NHẬT file: **${result.fileName}**`,
      'AdminMediaController',
    );
    return result;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    // Lưu ý: Đây mới chỉ là xoá mềm record trong DB.
    // Trong thực tế, bạn cần gọi thêm logic xoá file vật lý trên ổ cứng hoặc S3 (nếu muốn xoá sạch)
    await this.mediaService.softDelete(id, req.user?.id);
    this.discordService.sendNewUpdate(
      'WARN',
      `**[Admin]** User ID \`${req.user?.id}\` vừa XÓA file ID: \`${id}\``,
      'AdminMediaController',
    );
    return { message: 'Đã xóa record file' };
  }

  // @Delete('soft/:id')
  // async softRemove(@Param('id') id: string, @Req() req: any) {
  //   // Lưu ý: Đây mới chỉ là xoá mềm record trong DB.
  //   // Trong thực tế, baise cần gọi thêm logic xoá file vật lý trên ổ cúng hoặc S3 (nếu muốn xoá sạch)
  //   await this.mediaService.softDelete(id, req.user?.id);
  //   this.discordService.sendNewUpdate(
  //     'WARN',
  //     `**[Admin]** User ID \`${req.user?.id}\` vừa XÓA file ID: \`${id}\``,
  //     'AdminMediaController',
  //   );
  //   return { message: 'Đã xóa record file' };
  // }

}
