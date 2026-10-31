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
  | 'trackOrderTool'
  | 'prepareAddToCartTool'
  | 'confirmAddToCartTool';

/**
 * Trạng thái thao tác thêm giỏ hàng nhanh qua Trợ lý AI:
 * - AWAITING_CONFIRMATION: AI đã tìm thấy sách & kiểm tra tồn kho, đang hỏi khách xác nhận lần cuối
 * - CONFIRMED: Khách đã chốt, trả về danh sách { productId, amount } để Frontend thêm thẳng vào giỏ hàng
 * - CANCELLED: Khách hủy thao tác thêm vào giỏ hàng
 */
export type CartActionStatus =
  | 'AWAITING_CONFIRMATION'
  | 'CONFIRMED'
  | 'CANCELLED';

/**
 * Thông tin từng sản phẩm và số lượng (amount) trong yêu cầu thêm giỏ hàng nhanh
 */
export interface ChatCartItem {
  productId: string;
  amount: number;
  name: string;
  slug: string;
  unitPrice: number;
  totalPrice: number;
  stockQuantity: number;
  thumbnailUrl?: string | null;
}

/**
 * Dữ liệu hành động giỏ hàng gửi về cho Frontend xử lý tự động
 */
export interface ChatCartAction {
  status: CartActionStatus;
  items: ChatCartItem[];
  totalAmount: number;
}

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
  cartAction?: ChatCartAction | null;
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
  cartAction?: ChatCartAction | null;
  timestamp: string;
}
