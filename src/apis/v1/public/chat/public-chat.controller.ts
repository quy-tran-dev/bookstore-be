import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { ChatAssistantService } from '@app/modules/chat-assistant/chat-assistant.service';
import { SendChatMessageDto } from '@app/modules/chat-assistant/dto/send-chat-message.dto';

@Controller('chat')
export class PublicChatController {
  constructor(
    private readonly chatAssistantService: ChatAssistantService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * 1. Gửi tin nhắn tới Trợ lý AI Tư vấn Khách hàng.
   * Hỗ trợ cả khách vãng lai lẫn khách đã đăng nhập (tự động nhận diện JWT nếu có để tra cứu đơn hàng cá nhân).
   * Giới hạn tốc độ: tối đa 15 tin nhắn / 60 giây trên mỗi IP để chống spam.
   */
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Post('message')
  async sendMessage(@Body() dto: SendChatMessageDto, @Req() req: any) {
    const currentUserId = this.extractOptionalUserId(req);
    return this.chatAssistantService.handleUserMessage(dto, currentUserId);
  }

  /**
   * 2. Lấy lịch sử trò chuyện hiện tại theo sessionId
   */
  @Get('history/:sessionId')
  async getHistory(@Param('sessionId') sessionId: string) {
    const history = await this.chatAssistantService.getSessionHistory(sessionId);
    return {
      sessionId,
      history,
    };
  }

  /**
   * 3. Xóa lịch sử trò chuyện để bắt đầu phiên tư vấn mới
   */
  @Delete('history/:sessionId')
  async clearHistory(@Param('sessionId') sessionId: string) {
    return this.chatAssistantService.clearSessionHistory(sessionId);
  }

  /**
   * Trích xuất userId không bắt buộc từ Bearer Token hoặc Cookie (nếu khách hàng đã đăng nhập)
   */
  private extractOptionalUserId(req: any): string | undefined {
    try {
      const authHeader: string | undefined = req?.headers?.authorization;
      const bearerToken =
        authHeader && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7).trim()
          : undefined;
      const token = bearerToken || req?.cookies?.accessToken;

      if (!token) return undefined;

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET,
      });
      return payload?.sub || payload?.id;
    } catch {
      return undefined;
    }
  }
}
