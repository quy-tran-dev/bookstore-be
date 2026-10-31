import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Product } from '../products/entities/product.entity';
import { Order } from '../orders/entities/order.entity';
import { ProductsModule } from '../products/products.module';
import { ChatToolsService } from './chat-tools.service';
import { ChatAssistantService } from './chat-assistant.service';
import { PublicChatController } from '@app/apis/v1/public/chat/public-chat.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Order]),
    ProductsModule,
    JwtModule.register({}),
  ],
  controllers: [PublicChatController],
  providers: [ChatToolsService, ChatAssistantService],
  exports: [ChatAssistantService, ChatToolsService],
})
export class ChatAssistantModule {}
