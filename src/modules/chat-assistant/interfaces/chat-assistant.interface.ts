import { OrderStatus } from '@app/common/enums/order-status.enum';
import { PaymentMethod } from '@app/common/enums/payment-method.enum';
import { PaymentStatus } from '@app/common/enums/payment-status.enum';

/**
 * Vai trò trong cuộc hội thoại giữa Khách hàng và Trợ lý AI
 */
export type ChatRole = 'user' | 'assistant';

/**
 * Tên các công cụ (Function / Tool Calling) mà Trợ lý AI được phép kích hoạt
 */
export type AssistantToolName =
  | 'searchBooksTool'
  | 'getBookDetailTool'
  | 'trackOrderTool';

/**
 * Một lượt tin nhắn được lưu trong lịch sử phiên trò chuyện (Redis Cache)
 */
export interface ChatHistoryEntry {
  role: ChatRole;
  content: string;
  timestamp: string;
}

/**
 * Thông tin thẻ sản phẩm rút gọn trả về kèm câu trả lời để Frontend hiển thị Product Card
 */
export interface ChatSuggestedProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  finalPrice: number;
  shortDescribe?: string;
  stockQuantity: number;
  soldCount?: number;
  thumbnailUrl?: string | null;
  categories?: string[];
  authors?: string[];
}

/**
 * Thông tin tóm tắt đơn hàng khi khách hàng yêu cầu tra cứu trạng thái đơn
 */
export interface ChatOrderSummary {
  id: string;
  code: string;
  status?: OrderStatus;
  statusLabel: string;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  finalAmount: number;
  createdAt?: Date;
  items: {
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }[];
}

/**
 * Kết quả thực thi nội bộ của một Tool trước khi đưa lại cho mô hình ngôn ngữ tổng hợp câu trả lời
 */
export interface ToolExecutionOutcome {
  toolName: AssistantToolName;
  toolOutputText: string;
  suggestedProducts?: ChatSuggestedProduct[];
  referencedOrders?: ChatOrderSummary[];
}

/**
 * Cấu trúc dữ liệu trả về của API Trợ lý AI Tư vấn Khách hàng
 */
export interface ChatAssistantResponse {
  sessionId: string;
  reply: string;
  usedTool?: AssistantToolName | null;
  suggestedProducts: ChatSuggestedProduct[];
  referencedOrders: ChatOrderSummary[];
  timestamp: string;
}
