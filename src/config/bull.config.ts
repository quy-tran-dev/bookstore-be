import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SharedBullConfigurationFactory, BullRootModuleOptions } from '@nestjs/bull'; 


@Injectable()
export class BullConfigService implements SharedBullConfigurationFactory {
  constructor(private configService: ConfigService) {}

  createSharedConfiguration(): BullRootModuleOptions { 
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD');
    return {
      redis: {
        host: this.configService.get<string>('REDIS_HOST') || 'localhost',
        port: this.configService.get<number>('REDIS_PORT') || 6379,
        db: this.configService.get<number>('REDIS_DB') || 0, // Đảm bảo có db
        ...(redisPassword ? { password: redisPassword } : {}),
        // Thêm các tùy chọn khác nếu cần
      },
      // Các tùy chọn khác của Bull (nếu có)
      defaultJobOptions: {
        attempts: 3,
      },
      // limiter: {
      //   max: 1000, // Số job tối đa mỗi giây
      //   duration: 1000, // Thời gian (ms) để giới hạn
      // },
    };
  }
}
