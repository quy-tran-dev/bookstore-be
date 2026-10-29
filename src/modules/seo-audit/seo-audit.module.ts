import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeoAudit } from './entities/seo-audit.entity';
import { Product } from '../products/entities/product.entity';
import { AiModule } from '../ai/ai.module';
import { SeoAuditService } from './seo-audit.service';
import { AdminSeoAuditController } from '@app/apis/v1/admin/seo-audit/admin-seo-audit.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SeoAudit, Product]), AiModule],
  controllers: [AdminSeoAuditController],
  providers: [SeoAuditService],
  exports: [SeoAuditService],
})
export class SeoAuditModule {}
