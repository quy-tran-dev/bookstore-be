import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Media } from './entities/media.entity';
import { MediaService } from './media.service';
import { AdminMediaController } from '@app/apis/v1/admin/media/admin-media.controller';


@Module({
  imports: [TypeOrmModule.forFeature([Media])],
  controllers: [AdminMediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}