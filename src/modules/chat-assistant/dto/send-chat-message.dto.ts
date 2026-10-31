import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  Matches,
} from 'class-validator';

/**
 * DTO nhận tin nhắn từ khách hàng gửi tới Trợ lý AI
 */
export class SendChatMessageDto {
  // Nội dung câu hỏi của khách hàng (giới hạn tối đa 500 ký tự để tránh lạm dụng Token và Prompt Injection dài)
  @IsString({ message: 'Nội dung tin nhắn phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Vui lòng nhập nội dung câu hỏi' })
  @MaxLength(500, {
    message: 'Tin nhắn không được vượt quá 500 ký tự',
  })
  message!: string;

  // Mã phiên trò chuyện (nếu khách chưa có, Backend sẽ tự cấp mã sessionId mới)
  @IsString()
  @IsOptional()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Mã phiên trò chuyện (sessionId) chỉ được chứa chữ cái, số, gạch ngang và gạch dưới',
  })
  sessionId?: string;
}
