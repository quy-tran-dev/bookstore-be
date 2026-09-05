import { Global, Module } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';
import { JwtModule } from '@nestjs/jwt';

@Global()
@Module({
  imports: [JwtModule.register({})], 
  providers: [NotificationsGateway],
  exports: [NotificationsGateway],
})
export class NotificationsModule {}