import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import axios from 'axios';
import { v7 as uuidv7 } from 'uuid';
import { ChatToolsService } from './chat-tools.service';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import {
  AssistantToolName,
  ChatAssistantResponse,
  ChatCartAction,
  ChatHistoryEntry,
  ToolExecutionOutcome,
} from './interfaces/chat-assistant.interface';
import {
  CHAT_ASSISTANT_REPLIES,
  CHAT_GEMINI_TOOLS,
  CHAT_MAX_HISTORY_MESSAGES,
  CHAT_PENDING_CART_TTL_MS,
  CHAT_SESSION_TTL_MS,
  CHAT_SYSTEM_INSTRUCTION,
} from './constants/chat-assistant.constant';
import { SectionSanitizeUtil } from '../products/utils/section-sanitize.util';

@Injectable()
export class ChatAssistantService {
  private readonly logger = new Logger(ChatAssistantService.name);

  constructor(
    private readonly chatToolsService: ChatToolsService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Xử lý tin nhắn của khách hàng:
   * 1. Làm sạch đầu vào, kiểm tra chống Prompt Injection & chặn câu hỏi ngoài lề (Off-Topic Guardrail)
   * 2. Tải lịch sử hội thoại từ Redis Cache
   * 3. Gọi Gemini Function Calling (hoặc tự động chuyển sang bộ định tuyến nội bộ nếu chưa cấu hình Gemini API Key)
   * 4. Lưu lại lịch sử hội thoại mới và trả kết quả kèm danh sách thẻ sản phẩm (suggestedProducts)
   */
  async handleUserMessage(
    dto: SendChatMessageDto,
    currentUserId?: string,
  ): Promise<ChatAssistantResponse> {
    const sessionId = dto.sessionId?.trim() || `chat-${uuidv7()}`;
    const sanitizedMessage = SectionSanitizeUtil.sanitizeText(dto.message);

    // 1. Chặn sớm các câu lệnh cố tình tấn công Prompt Injection
    if (this.isPromptInjectionAttempt(sanitizedMessage)) {
      return {
        sessionId,
        reply: CHAT_ASSISTANT_REPLIES.PROMPT_INJECTION_BLOCKED,
        usedTool: null,
        suggestedProducts: [],
        referencedOrders: [],
        cartAction: null,
        timestamp: new Date().toISOString(),
      };
    }

    // 2. Giới hạn quyền truy cập dữ liệu nhạy cảm (RBAC & Confidential Data Guardrail):
    // Chặn các câu hỏi dò hỏi giá vốn (cost), giá nhập, doanh thu, lợi nhuận, ghi chú nội bộ Admin hoặc dữ liệu khách hàng khác
    if (this.isConfidentialBusinessQuery(sanitizedMessage)) {
      return {
        sessionId,
        reply: CHAT_ASSISTANT_REPLIES.CONFIDENTIAL_QUERY_BLOCKED,
        usedTool: null,
        suggestedProducts: [],
        referencedOrders: [],
        cartAction: null,
        timestamp: new Date().toISOString(),
      };
    }

    // 3. Chặn sớm các câu hỏi ngoài lề không liên quan đến việc mua bán sách & đơn hàng tại Bookstore
    if (this.isOffTopicQuery(sanitizedMessage)) {
      return {
        sessionId,
        reply: CHAT_ASSISTANT_REPLIES.OFF_TOPIC_BLOCKED,
        usedTool: null,
        suggestedProducts: [],
        referencedOrders: [],
        cartAction: null,
        timestamp: new Date().toISOString(),
      };
    }

    const history = await this.getSessionHistory(sessionId);

    // 3. Kiểm tra xem phiên chat hiện tại có giỏ hàng tạm (pendingCart) đang chờ khách xác nhận hay không
    const pendingCart = await this.getPendingCart(sessionId);
    if (pendingCart && pendingCart.items.length > 0) {
      if (this.isCartConfirmationMessage(sanitizedMessage)) {
        await this.clearPendingCart(sessionId);
        const confirmedAction: ChatCartAction = {
          status: 'CONFIRMED',
          items: pendingCart.items,
          totalAmount: pendingCart.totalAmount,
        };
        const itemSummary = pendingCart.items
          .map(
            (i) =>
              `**${i.name}** (Số lượng: **${i.amount}**, Thành tiền: **${i.totalPrice.toLocaleString('vi-VN')}đ**)`,
          )
          .join(', ');
        const confirmReply = `Đã chốt! Mình đã gửi yêu cầu thêm ${itemSummary} (Tổng cộng: **${pendingCart.totalAmount.toLocaleString('vi-VN')}đ**) vào giỏ hàng của bạn.`;

        await this.appendSessionHistory(
          sessionId,
          history,
          sanitizedMessage,
          confirmReply,
        );

        return {
          sessionId,
          reply: confirmReply,
          usedTool: 'confirmAddToCartTool',
          suggestedProducts: [],
          referencedOrders: [],
          cartAction: confirmedAction,
          timestamp: new Date().toISOString(),
        };
      }

      if (this.isCartCancellationMessage(sanitizedMessage)) {
        await this.clearPendingCart(sessionId);
        const cancelReply = CHAT_ASSISTANT_REPLIES.CART_CANCELLED;

        await this.appendSessionHistory(
          sessionId,
          history,
          sanitizedMessage,
          cancelReply,
        );

        return {
          sessionId,
          reply: cancelReply,
          usedTool: null,
          suggestedProducts: [],
          referencedOrders: [],
          cartAction: {
            status: 'CANCELLED',
            items: [],
            totalAmount: 0,
          },
          timestamp: new Date().toISOString(),
        };
      }
    }

    let reply = '';
    let outcome: ToolExecutionOutcome | null = null;

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (geminiApiKey) {
      // Ưu tiên 1: Sử dụng Google Gemini Flash với tính năng Function Calling (Tool Calling)
      const geminiResult = await this.runWithGeminiFunctionCalling(
        geminiApiKey,
        sanitizedMessage,
        history,
        currentUserId,
      );
      if (geminiResult) {
        reply = geminiResult.reply;
        outcome = geminiResult.outcome;
      }
    }

    // Ưu tiên 2 (Fallback an toàn): Nếu không có GEMINI_API_KEY hoặc gọi API bên ngoài gặp sự cố,
    // sử dụng bộ phân tích ý định nội bộ (Local Intent Router) kết hợp Hybrid Search & Ollama
    if (!reply) {
      const fallbackResult = await this.runWithLocalIntentRouter(
        sanitizedMessage,
        currentUserId,
      );
      reply = fallbackResult.reply;
      outcome = fallbackResult.outcome;
    }

    // Nếu kết quả Tool trả về yêu cầu chờ xác nhận thêm giỏ hàng (AWAITING_CONFIRMATION),
    // lưu danh sách sản phẩm tạm vào Redis để bước tiếp theo khách chỉ cần nhắn "Chốt / Đồng ý"
    if (
      outcome?.cartAction &&
      outcome.cartAction.status === 'AWAITING_CONFIRMATION' &&
      outcome.cartAction.items.length > 0
    ) {
      await this.cacheManager.set(
        this.buildPendingCartCacheKey(sessionId),
        outcome.cartAction,
        CHAT_PENDING_CART_TTL_MS,
      );
    }

    const nowIso = await this.appendSessionHistory(
      sessionId,
      history,
      sanitizedMessage,
      reply,
    );

    return {
      sessionId,
      reply,
      usedTool: outcome?.toolName || null,
      suggestedProducts: outcome?.suggestedProducts || [],
      referencedOrders: outcome?.referencedOrders || [],
      cartAction: outcome?.cartAction || null,
      timestamp: nowIso,
    };
  }

  /**
   * Lấy lịch sử trò chuyện của một phiên (sessionId) từ Redis Cache
   */
  async getSessionHistory(sessionId: string): Promise<ChatHistoryEntry[]> {
    if (!sessionId) return [];
    const cached = await this.cacheManager.get<ChatHistoryEntry[]>(
      this.buildSessionCacheKey(sessionId),
    );
    return Array.isArray(cached) ? cached : [];
  }

  /**
   * Xóa lịch sử trò chuyện của một phiên (làm mới cuộc hội thoại)
   */
  async clearSessionHistory(sessionId: string): Promise<{ cleared: boolean }> {
    if (!sessionId) return { cleared: false };
    await this.cacheManager.del(this.buildSessionCacheKey(sessionId));
    return { cleared: true };
  }

  // ===========================================================================
  // TẦNG 1: TÍCH HỢP GOOGLE GEMINI FUNCTION CALLING (TOOL CALLING)
  // ===========================================================================

  private async runWithGeminiFunctionCalling(
    apiKey: string,
    userMessage: string,
    history: ChatHistoryEntry[],
    currentUserId?: string,
  ): Promise<{ reply: string; outcome: ToolExecutionOutcome | null } | null> {
    try {
      const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      // Chuyển đổi lịch sử hội thoại sang định dạng contents của Gemini
      const contents: any[] = history.map((item) => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content }],
      }));
      contents.push({
        role: 'user',
        parts: [{ text: userMessage }],
      });

      // Bước 1: Gửi tin nhắn kèm khai báo danh sách công cụ (Tools) cho Gemini
      const firstResponse = await axios.post(
        endpoint,
        {
          systemInstruction: {
            parts: [{ text: CHAT_SYSTEM_INSTRUCTION }],
          },
          contents,
          tools: CHAT_GEMINI_TOOLS,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 700,
          },
        },
        { timeout: 10000 },
      );

      const candidatePart =
        firstResponse.data?.candidates?.[0]?.content?.parts?.[0];

      if (!candidatePart) return null;

      // Trường hợp Gemini quyết định gọi Tool (Function Call)
      if (candidatePart.functionCall) {
        const fnName = candidatePart.functionCall.name as AssistantToolName;
        const fnArgs = candidatePart.functionCall.args || {};

        const outcome = await this.dispatchToolCall(
          fnName,
          fnArgs,
          currentUserId,
        );

        // Bước 2: Đưa kết quả thực thi Tool quay lại cho Gemini để diễn đạt câu trả lời hoàn chỉnh
        const secondContents = [
          ...contents,
          {
            role: 'model',
            parts: [{ functionCall: candidatePart.functionCall }],
          },
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: fnName,
                  response: {
                    result: outcome.toolOutputText,
                  },
                },
              },
            ],
          },
        ];

        const secondResponse = await axios.post(
          endpoint,
          {
            systemInstruction: {
              parts: [{ text: CHAT_SYSTEM_INSTRUCTION }],
            },
            contents: secondContents,
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 700,
            },
          },
          { timeout: 10000 },
        );

        const finalReply =
          secondResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
          this.buildDeterministicReplyFromOutcome(outcome);

        return {
          reply: finalReply,
          outcome,
        };
      }

      // Trường hợp câu chào hỏi thông thường không cần gọi Tool
      if (candidatePart.text) {
        return {
          reply: candidatePart.text.trim(),
          outcome: null,
        };
      }

      return null;
    } catch (error: any) {
      this.logger.warn(
        `Chuyển sang chế độ định tuyến nội bộ do Gemini API không khả dụng: ${error?.message || error}`,
      );
      return null;
    }
  }

  // ===========================================================================
  // TẦNG 2: BỘ ĐỊNH TUYẾN Ý ĐỊNH NỘI BỘ (LOCAL INTENT ROUTER) & FALLBACK
  // ===========================================================================

  /**
   * Tự động nhận diện ý định câu hỏi của khách hàng (Tìm sách / Chi tiết sách / Đơn hàng / Chào hỏi)
   * và gọi đúng Tool tương ứng khi chạy offline hoặc không có GEMINI_API_KEY.
   */
  private async runWithLocalIntentRouter(
    message: string,
    currentUserId?: string,
  ): Promise<{ reply: string; outcome: ToolExecutionOutcome | null }> {
    const lower = message.toLowerCase();

    // 1. Nhận diện yêu cầu tra cứu đơn hàng cụ thể (có mã ORD-... hoặc yêu cầu kiểm tra đơn hàng)
    const orderCodeMatch = message.match(/\bORD-[A-Z0-9-]+\b/i);
    const isOrderIntent =
      Boolean(orderCodeMatch) ||
      /(kiểm tra đơn|tra cứu đơn|tình trạng đơn|đơn hàng của (mình|tôi|em)|lịch sử đơn hàng)/i.test(
        lower,
      );

    if (isOrderIntent) {
      const outcome = await this.chatToolsService.executeTrackOrder(
        { orderCode: orderCodeMatch ? orderCodeMatch[0] : undefined },
        currentUserId,
      );
      return {
        reply: this.buildDeterministicReplyFromOutcome(outcome),
        outcome,
      };
    }

    // 2. Nhận diện câu hỏi về Chính sách cửa hàng (Hoàn tiền, Đổi trả, Phí ship, Giao hàng, Thanh toán, Bản quyền)
    const isStorePolicyIntent =
      /(chính sách|hoàn tiền|đổi trả|trả hàng|đổi sách|sách (bị )?(lỗi|rách|móp|hư)|phí (ship|vận chuyển|giao hàng)|giao hàng (mất )?bao lâu|bao giờ nhận được|đồng kiểm|thanh toán (như thế nào|qua đâu|bằng cách nào|cod|vnpay)|chuyển khoản|sách (giả|thật|lậu|bản quyền|chính hãng))/i.test(
        lower,
      );

    if (isStorePolicyIntent) {
      const outcome = await this.chatToolsService.executeGetStorePolicy({
        topic: message,
      });
      return {
        reply: this.buildDeterministicReplyFromOutcome(outcome),
        outcome,
      };
    }

    // 3. Nhận diện câu chào hỏi xã giao cơ bản
    if (
      /^(xin chào|chào shop|chào bạn|hello|hi|shop ơi|cho mình hỏi)$/i.test(
        lower.trim(),
      )
    ) {
      return {
        reply: CHAT_ASSISTANT_REPLIES.GREETING,
        outcome: null,
      };
    }

    // 3. Nhận diện yêu cầu thêm sách vào giỏ hàng nhanh (ví dụ: "Thêm 2 cuốn Clean Code vào giỏ hàng", "Cho mình lấy 3 quyển Thiết kế hệ thống")
    const isAddToCartIntent =
      /(thêm.*vào giỏ|bỏ.*vào giỏ|cho.*vào giỏ|lấy\s+\d+\s*(cuốn|quyển)|mua\s+\d+\s*(cuốn|quyển)|đặt\s+\d+\s*(cuốn|quyển))/i.test(
        lower,
      );

    if (isAddToCartIntent) {
      const parsedItems = this.extractCartItemsFromMessage(message);
      const outcome = await this.chatToolsService.executePrepareAddToCart({
        items: parsedItems,
      });
      return {
        reply: this.buildDeterministicReplyFromOutcome(outcome),
        outcome,
      };
    }

    // 4. Nhận diện yêu cầu xem chi tiết một cuốn sách cụ thể
    const isDetailIntent =
      /(chi tiết cuốn|thông tin cuốn|nhà xuất bản|bao nhiêu trang|số trang|năm xuất bản|tóm tắt cuốn)/i.test(
        lower,
      );

    if (isDetailIntent) {
      const cleanedTarget = message
        .replace(
          /(cho mình xem|chi tiết cuốn|thông tin cuốn|nhà xuất bản|bao nhiêu trang|số trang|năm xuất bản|tóm tắt cuốn|cuốn|quyển|sách|và|của|là gì|nhé|ạ|\?)/gi,
          ' ',
        )
        .replace(/\s+/g, ' ')
        .trim();

      const outcome = await this.chatToolsService.executeGetBookDetail({
        slugOrName: cleanedTarget || message,
      });
      return {
        reply: this.buildDeterministicReplyFromOutcome(outcome),
        outcome,
      };
    }

    // 4. Mặc định: Tìm kiếm & gợi ý sách bằng Hybrid Search (kèm bóc tách ngân sách nếu có)
    const { cleanQuery, maxPrice, minPrice } =
      this.extractSearchQueryAndPrice(message);
    const outcome = await this.chatToolsService.executeSearchBooks({
      query: cleanQuery || message,
      minPrice,
      maxPrice,
    });

    return {
      reply: this.buildDeterministicReplyFromOutcome(outcome),
      outcome,
    };
  }

  /**
   * Điều phối thực thi Tool dựa trên tên hàm mà AI yêu cầu
   */
  private async dispatchToolCall(
    toolName: AssistantToolName,
    args: Record<string, any>,
    currentUserId?: string,
  ): Promise<ToolExecutionOutcome> {
    switch (toolName) {
      case 'searchBooksTool':
        return this.chatToolsService.executeSearchBooks({
          query: String(args.query || ''),
          minPrice:
            args.minPrice !== undefined ? Number(args.minPrice) : undefined,
          maxPrice:
            args.maxPrice !== undefined ? Number(args.maxPrice) : undefined,
        });
      case 'getBookDetailTool':
        return this.chatToolsService.executeGetBookDetail({
          slugOrName: String(args.slugOrName || args.slugOrKeyword || ''),
        });
      case 'trackOrderTool':
        return this.chatToolsService.executeTrackOrder(
          {
            orderCode: args.orderCode ? String(args.orderCode) : undefined,
          },
          currentUserId,
        );
      case 'prepareAddToCartTool':
        return this.chatToolsService.executePrepareAddToCart({
          items: Array.isArray(args.items) ? args.items : [],
        });
      case 'getStorePolicyTool':
        return this.chatToolsService.executeGetStorePolicy({
          topic: args.topic ? String(args.topic) : 'general',
        });
      default:
        return this.chatToolsService.executeSearchBooks({
          query: String(args.query || ''),
        });
    }
  }

  /**
   * Bóc tách danh sách tên sách và số lượng (amount) từ câu nhắn tự nhiên của khách hàng
   * Ví dụ: "Thêm cho mình 2 cuốn Clean Code và 1 quyển Thiết kế hệ thống vào giỏ hàng"
   */
  private extractCartItemsFromMessage(
    message: string,
  ): { slugOrName: string; amount: number }[] {
    // Tách theo liên từ "và", dấu phẩy nếu khách chọn nhiều cuốn cùng lúc
    const cleanedMsg = message
      .replace(/(vào giỏ hàng|vào giỏ|giúp mình|cho mình|shop ơi|nhé|ạ|đi)/gi, ' ')
      .replace(/^(thêm|bỏ|cho|mua|lấy|đặt)\s+/i, ' ')
      .trim();

    const segments = cleanedMsg
      .split(/\s*(?:,|hoặc|\bvà\b)\s*/i)
      .map((s) => s.trim())
      .filter(Boolean);

    const items: { slugOrName: string; amount: number }[] = [];

    for (const seg of segments) {
      // Mẫu 1: "<số lượng> cuốn/quyển <tên sách>" (VD: "2 cuốn Clean Code")
      const prefixQtyMatch = seg.match(
        /^(?:thêm|lấy|mua|đặt)?\s*(\d+)\s*(?:cuốn|quyển|bộ|tập)?\s*(?:sách)?\s+(.+)$/i,
      );
      if (prefixQtyMatch) {
        const amount = Math.max(1, parseInt(prefixQtyMatch[1], 10));
        const slugOrName = prefixQtyMatch[2]
          .replace(/^(cuốn|quyển|sách)\s+/i, '')
          .trim();
        if (slugOrName) {
          items.push({ slugOrName, amount });
          continue;
        }
      }

      // Mẫu 2: "<tên sách> số lượng <số lượng>" (VD: "cuốn Clean Code số lượng 3")
      const suffixQtyMatch = seg.match(
        /^(?:cuốn|quyển|sách)?\s*(.+?)\s+(?:số lượng|sl|x)\s*(\d+)$/i,
      );
      if (suffixQtyMatch) {
        const slugOrName = suffixQtyMatch[1].trim();
        const amount = Math.max(1, parseInt(suffixQtyMatch[2], 10));
        if (slugOrName) {
          items.push({ slugOrName, amount });
          continue;
        }
      }

      // Mẫu 3: Không ghi rõ số lượng -> Mặc định amount = 1
      const fallbackName = seg
        .replace(/^(thêm|lấy|mua|đặt|cuốn|quyển|sách)\s+/gi, '')
        .trim();
      if (fallbackName) {
        items.push({ slugOrName: fallbackName, amount: 1 });
      }
    }

    return items;
  }

  /**
   * Bóc tách tầm giá (ví dụ: "dưới 150k", "dưới 200.000đ", "trên 100k") và làm sạch từ khóa tìm kiếm
   */
  private extractSearchQueryAndPrice(message: string): {
    cleanQuery: string;
    minPrice?: number;
    maxPrice?: number;
  } {
    let maxPrice: number | undefined;
    let minPrice: number | undefined;

    const underMatch = message.match(
      /(?:dưới|tối đa|không quá|nhỏ hơn)\s*(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|đ|vnđ)?/i,
    );
    if (underMatch) {
      const rawNum = parseFloat(underMatch[1].replace(/[.,]/g, ''));
      const unit = (underMatch[2] || '').toLowerCase();
      maxPrice =
        unit === 'k' || unit === 'nghìn' || unit === 'ngàn' || rawNum < 1000
          ? rawNum * 1000
          : rawNum;
    }

    const overMatch = message.match(
      /(?:trên|từ|tối thiểu|lớn hơn)\s*(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|đ|vnđ)?/i,
    );
    if (overMatch) {
      const rawNum = parseFloat(overMatch[1].replace(/[.,]/g, ''));
      const unit = (overMatch[2] || '').toLowerCase();
      minPrice =
        unit === 'k' || unit === 'nghìn' || unit === 'ngàn' || rawNum < 1000
          ? rawNum * 1000
          : rawNum;
    }

    const cleanQuery = message
      .replace(
        /(?:dưới|tối đa|không quá|nhỏ hơn|trên|từ|tối thiểu|lớn hơn)\s*\d+(?:[.,]\d+)?\s*(?:k|nghìn|ngàn|đ|vnđ)?/gi,
        ' ',
      )
      .replace(
        /(tìm giúp mình|tư vấn cho mình|gợi ý giúp|mình muốn tìm|có cuốn nào về|shop có bán)/gi,
        ' ',
      )
      .replace(/\s+/g, ' ')
      .trim();

    return {
      cleanQuery: cleanQuery || message,
      minPrice,
      maxPrice,
    };
  }

  /**
   * Tổng hợp câu trả lời tiếng Việt rõ ràng, chính xác từ kết quả thực thi Tool
   */
  private buildDeterministicReplyFromOutcome(
    outcome: ToolExecutionOutcome,
  ): string {
    if (outcome.toolName === 'searchBooksTool') {
      const books = outcome.suggestedProducts || [];
      if (books.length === 0) {
        return outcome.toolOutputText;
      }
      const lines = books.map(
        (b, idx) =>
          `${idx + 1}. **${b.name}** — Giá: **${b.finalPrice.toLocaleString('vi-VN')}đ** (${
            b.stockQuantity > 0
              ? `Còn ${b.stockQuantity} cuốn`
              : 'Tạm hết hàng'
          })${b.shortDescribe ? `\n   *${b.shortDescribe}*` : ''}`,
      );
      return `Mình tìm thấy ${books.length} cuốn sách phù hợp với nhu cầu của bạn tại Bookstore:\n\n${lines.join('\n\n')}\n\nBạn có thể nhấn vào thẻ sản phẩm bên dưới để xem chi tiết hoặc hỏi mình thêm về cuốn sách bạn quan tâm nhé!`;
    }

    if (outcome.toolName === 'getBookDetailTool') {
      const book = outcome.suggestedProducts?.[0];
      if (!book) {
        return outcome.toolOutputText;
      }
      return `Thông tin chi tiết về cuốn sách **${book.name}**:\n\n${outcome.toolOutputText}`;
    }

    if (outcome.toolName === 'trackOrderTool') {
      const orders = outcome.referencedOrders || [];
      if (orders.length === 0) {
        return outcome.toolOutputText;
      }
      const lines = orders.map(
        (o) =>
          `- Mã đơn **${o.code}**: Trạng thái **${o.statusLabel}** | Tổng thanh toán: **${o.finalAmount.toLocaleString('vi-VN')}đ** (${o.items
            .map((i) => `${i.productName} x${i.quantity}`)
            .join(', ')})`,
      );
      return `Dưới đây là thông tin đơn hàng của bạn:\n\n${lines.join('\n')}`;
    }

    if (outcome.toolName === 'prepareAddToCartTool') {
      const cart = outcome.cartAction;
      if (!cart || cart.items.length === 0) {
        return outcome.toolOutputText;
      }
      const lines = cart.items.map(
        (item, idx) =>
          `${idx + 1}. **${item.name}** — Số lượng: **${item.amount}** | Đơn giá: **${item.unitPrice.toLocaleString('vi-VN')}đ** (Tạm tính: **${item.totalPrice.toLocaleString('vi-VN')}đ**)`,
      );
      return `Mình đã kiểm tra kho và chuẩn bị danh sách sách bạn chọn:\n\n${lines.join('\n')}\n\nTổng tạm tính: **${cart.totalAmount.toLocaleString('vi-VN')}đ**.\nBạn xác nhận **Chốt / Đồng ý** để mình thêm ngay vào giỏ hàng nhé?`;
    }

    return outcome.toolOutputText;
  }

  /**
   * Kiểm tra xem tin nhắn của khách có phải là câu xác nhận chốt thêm vào giỏ hàng hay không
   */
  private isCartConfirmationMessage(text: string): boolean {
    const normalized = text.trim().toLowerCase();
    return /^(ok|oke|okay|chốt|đồng ý|xác nhận|đúng|ừ|ừm|uh|yes|thêm)(\s+(ok|oke|chốt|đơn|đồng ý|xác nhận|đúng|rồi|đi|vào|giỏ|hàng|nhé|nha|ạ|shop|luôn))*[.!?\s]*$/i.test(
      normalized,
    );
  }

  /**
   * Kiểm tra xem tin nhắn của khách có phải là câu hủy thao tác thêm vào giỏ hàng hay không
   */
  private isCartCancellationMessage(text: string): boolean {
    const normalized = text.trim().toLowerCase();
    return /^(hủy|huỷ|không|thôi|bỏ qua|cancel|no)(\s+(đơn|giỏ|hàng|lấy|thêm|nữa|đi|nhé|nha|ạ|shop))*[.!?\s]*$/i.test(
      normalized,
    );
  }

  private async getPendingCart(
    sessionId: string,
  ): Promise<ChatCartAction | null> {
    if (!sessionId) return null;
    const cached = await this.cacheManager.get<ChatCartAction>(
      this.buildPendingCartCacheKey(sessionId),
    );
    return cached && Array.isArray(cached.items) ? cached : null;
  }

  private async clearPendingCart(sessionId: string): Promise<void> {
    if (!sessionId) return;
    await this.cacheManager.del(this.buildPendingCartCacheKey(sessionId));
  }

  private async appendSessionHistory(
    sessionId: string,
    history: ChatHistoryEntry[],
    userMessage: string,
    assistantReply: string,
  ): Promise<string> {
    const nowIso = new Date().toISOString();
    const newEntries: ChatHistoryEntry[] = [
      { role: 'user', content: userMessage, timestamp: nowIso },
      { role: 'assistant', content: assistantReply, timestamp: nowIso },
    ];
    const updatedHistory: ChatHistoryEntry[] = [
      ...history,
      ...newEntries,
    ].slice(-CHAT_MAX_HISTORY_MESSAGES);

    await this.cacheManager.set(
      this.buildSessionCacheKey(sessionId),
      updatedHistory,
      CHAT_SESSION_TTL_MS,
    );
    return nowIso;
  }

  /**
   * Kiểm tra các mẫu câu cố tình vượt quyền điều khiển hệ thống (Prompt Injection)
   */
  private isPromptInjectionAttempt(text: string): boolean {
    return /(ignore (all )?previous instructions|system prompt|bỏ qua (mọi |tất cả )?hướng dẫn trước|tiết lộ cấu hình hệ thống|drop table|delete from)/i.test(
      text,
    );
  }

  /**
   * Kiểm tra giới hạn quyền truy cập dữ liệu kinh doanh nội bộ & quản trị (RBAC / Confidentiality Guardrail):
   * Chặn tuyệt đối các câu hỏi dò hỏi:
   * - Giá vốn, giá nhập kho (`cost`, `giá vốn`, `giá nhập`, `giá sỉ nhập vào`)
   * - Doanh thu, doanh số, lợi nhuận, tiền lãi, báo cáo tài chính của cửa hàng
   * - Ghi chú nội bộ của Admin (`noteAdmin`, `ghi chú quản trị`) hoặc thông tin cá nhân/danh sách khách hàng khác
   */
  private isConfidentialBusinessQuery(text: string): boolean {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return false;

    const confidentialPatterns = [
      // 1. Giá vốn, giá nhập hàng (trường `cost` trong bảng Product)
      /(\bgiá\s*(vốn|nhập|gốc\s*nhập|nhập\s*kho)\b|\bcost\b\s*(nhập|của|sách|cuốn|là|bao\s*nhiêu)|giá\s*cost\b|nhập\s*vào\s*giá\s*bao\s*nhiêu|chi\s*phí\s*nhập\s*sách)/i,
      // 2. Doanh thu, lợi nhuận, tiền lời, báo cáo tài chính của cửa hàng
      /(\b(doanh\s*thu|doanh\s*số|lợi\s*nhuận|biên\s*lợi\s*nhuận|báo\s*cáo\s*tài\s*chính|sao\s*kê)\s*(của\s*(shop|cửa\s*hàng|bookstore|hiệu\s*sách)|tháng\s*này|năm\s*nay|hôm\s*nay|là\s*bao\s*nhiêu|bao\s*nhiêu)|^(doanh\s*thu|lợi\s*nhuận|doanh\s*số)\b|shop\s*(lãi|lời|kiếm\s*được|doanh\s*thu)\s*bao\s*nhiêu|lãi\s*mỗi\s*(cuốn|quyển))/i,
      // 3. Dữ liệu quản trị nội bộ (noteAdmin, thông tin khách hàng khác, mật khẩu, khóa bí mật)
      /(\bnoteadmin\b|ghi\s*chú\s*(nội\s*bộ|admin|quản\s*trị)|danh\s*sách\s*(khách\s*hàng|người\s*mua|tài\s*khoản)|số\s*điện\s*thoại\s*(của\s*)?khách|email\s*(của\s*)?khách\s*hàng\s*khác|\b(api[_\s]*key|secret[_\s]*key|database[_\s]*url)\b)/i,
    ];

    return confidentialPatterns.some((pattern) => pattern.test(normalized));
  }

  /**
   * Kiểm tra giới hạn phạm vi tư vấn (Domain Guardrail):
   * Phát hiện các câu hỏi hoàn toàn không liên quan đến việc mua bán sách hoặc tra cứu đơn hàng
   * (ví dụ: nhờ viết code/debug, giải phương trình toán/lý/hóa, hỏi thời tiết, kết quả bóng đá, xổ số, nấu ăn, y tế, chứng khoán...).
   * Lưu ý: Nếu khách hỏi tìm sách về các chủ đề đó (VD: "tìm sách dạy nấu ăn", "mua sách toán"), hàm vẫn cho phép bình thường.
   */
  private isOffTopicQuery(text: string): boolean {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return false;

    // Nếu câu hỏi có chứa ngữ cảnh rõ ràng về sách, tác giả, xuất bản, chính sách hoặc đơn hàng thì luôn CHO PHÉP
    const hasBookstoreContext =
      /(sách|truyện|tiểu thuyết|tác phẩm|tác giả|nhà xuất bản|\bnxb\b|giỏ hàng|đơn hàng|mã đơn|\bord-|giao hàng|vận chuyển|hoàn tiền|đổi trả|thanh toán|chính sách|bookstore)/i.test(
        normalized,
      );

    if (hasBookstoreContext) {
      return false;
    }

    // Danh sách các mẫu câu hỏi ngoài lề phổ biến không thuộc nghiệp vụ bán sách
    const offTopicPatterns = [
      // 1. Nhờ viết code, giải bài tập lập trình, toán học, lý, hóa
      /(viết (đoạn |hàm |chương trình )?code|debug lỗi|fix bug|giải (phương trình|bài toán|bài tập|tích phân|đạo hàm)|làm hộ bài|tính giúp|\d+\s*[+\-*/^]\s*\d+\s*=)/i,
      // 2. Hỏi thời tiết, dự báo mưa nắng, ngày giờ
      /(thời tiết hôm nay|trời (có )?mưa không|nhiệt độ ngoài trời|dự báo thời tiết)/i,
      // 3. Bóng đá, thể thao, xổ số, lô đề, cờ bạc, tử vi, bói toán
      /(kết quả (xổ số|bóng đá)|tỷ số trận|soi cầu|lô đề|xem (bói|tử vi|ngày tốt)|ngoại hạng anh|world cup)/i,
      // 4. Công thức nấu ăn, cách chế biến món ăn (khi không hỏi mua sách nấu ăn)
      /(cách (nấu|làm món|kho|xào|chiên|nướng)|công thức nấu|nguyên liệu nấu món)/i,
      // 5. Tài chính cá nhân ngoài lề: giá vàng, tỷ giá ngoại tệ, giá bitcoin/coin, cổ phiếu
      /(giá vàng hôm nay|giá bitcoin|tỷ giá (usd|đô la)|mã cổ phiếu nào)/i,
      // 6. Y tế, kê đơn thuốc, chính trị, làm thơ, viết văn hộ
      /(uống thuốc gì|triệu chứng bệnh|làm (một )?bài thơ|viết (bài văn|đơn xin nghỉ)|dịch câu này sang)/i,
    ];

    return offTopicPatterns.some((pattern) => pattern.test(normalized));
  }

  private buildSessionCacheKey(sessionId: string): string {
    return `/chat-assistant/sessions/${sessionId}`;
  }

  private buildPendingCartCacheKey(sessionId: string): string {
    return `/chat-assistant/pending-cart/${sessionId}`;
  }
}
