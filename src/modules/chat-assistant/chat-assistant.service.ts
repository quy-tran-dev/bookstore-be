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
  ChatHistoryEntry,
  ToolExecutionOutcome,
} from './interfaces/chat-assistant.interface';
import { SectionSanitizeUtil } from '../products/utils/section-sanitize.util';

@Injectable()
export class ChatAssistantService {
  private readonly logger = new Logger(ChatAssistantService.name);

  // Thời gian lưu trữ phiên hội thoại trong Redis Cache: 30 phút (tính bằng ms)
  private static readonly SESSION_TTL_MS = 30 * 60 * 1000;
  // Số lượng tin nhắn tối đa giữ lại trong ngữ cảnh để tối ưu chi phí Token
  private static readonly MAX_HISTORY_MESSAGES = 10;

  // Chỉ dẫn hệ thống (System Instruction) định hình phong cách tư vấn và chống bịa đặt thông tin
  private static readonly SYSTEM_INSTRUCTION = `Bạn là Trợ lý AI Tư vấn Khách hàng chính thức của Hiệu sách trực tuyến Bookstore.
Nguyên tắc bắt buộc:
1. Chỉ tư vấn các cuốn sách thực tế có trong kết quả từ công cụ searchBooksTool hoặc getBookDetailTool. Tuyệt đối KHÔNG tự bịa ra tên sách, giá tiền hoặc trạng thái tồn kho không có trong dữ liệu công cụ.
2. Khi khách hỏi tìm sách, gợi ý sách theo chủ đề, kỹ năng, tác giả hoặc tầm giá, hãy gọi công cụ searchBooksTool.
3. Khi khách hỏi sâu về thông tin chi tiết của một cuốn sách cụ thể (nhà xuất bản, số trang, tóm tắt nội dung), hãy gọi công cụ getBookDetailTool.
4. Khi khách hỏi kiểm tra đơn hàng hoặc tình trạng giao hàng, hãy gọi công cụ trackOrderTool.
5. Trả lời bằng tiếng Việt lịch sự, ngắn gọn, thân thiện và trình bày rõ ràng.`;

  constructor(
    private readonly chatToolsService: ChatToolsService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Xử lý tin nhắn của khách hàng:
   * 1. Làm sạch đầu vào & kiểm tra chống Prompt Injection
   * 2. Tải lịch sử hội thoại từ Redis Cache
   * 3. Gọi Gemini Function Calling (hoặc tự động chuyển sang bộ định tuyến nội bộ + Ollama nếu chưa cấu hình Gemini API Key)
   * 4. Lưu lại lịch sử hội thoại mới và trả kết quả kèm danh sách thẻ sản phẩm (suggestedProducts)
   */
  async handleUserMessage(
    dto: SendChatMessageDto,
    currentUserId?: string,
  ): Promise<ChatAssistantResponse> {
    const sessionId = dto.sessionId?.trim() || `chat-${uuidv7()}`;
    const sanitizedMessage = SectionSanitizeUtil.sanitizeText(dto.message);

    // Chặn sớm các câu lệnh cố tình tấn công Prompt Injection
    if (this.isPromptInjectionAttempt(sanitizedMessage)) {
      return {
        sessionId,
        reply:
          'Xin lỗi, mình chỉ là Trợ lý tư vấn sách và hỗ trợ tra cứu đơn hàng của Bookstore nên không thể thực hiện yêu cầu này. Bạn đang cần tìm sách về chủ đề gì để mình gợi ý nhé?',
        usedTool: null,
        suggestedProducts: [],
        referencedOrders: [],
        timestamp: new Date().toISOString(),
      };
    }

    const history = await this.getSessionHistory(sessionId);

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

    // Cập nhật lịch sử hội thoại vào Redis Cache (giữ tối đa 10 tin nhắn gần nhất)
    const nowIso = new Date().toISOString();
    const updatedHistory: ChatHistoryEntry[] = [
      ...history,
      { role: 'user', content: sanitizedMessage, timestamp: nowIso },
      { role: 'assistant', content: reply, timestamp: nowIso },
    ].slice(-ChatAssistantService.MAX_HISTORY_MESSAGES);

    await this.cacheManager.set(
      this.buildSessionCacheKey(sessionId),
      updatedHistory,
      ChatAssistantService.SESSION_TTL_MS,
    );

    return {
      sessionId,
      reply,
      usedTool: outcome?.toolName || null,
      suggestedProducts: outcome?.suggestedProducts || [],
      referencedOrders: outcome?.referencedOrders || [],
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

      const tools = [
        {
          functionDeclarations: [
            {
              name: 'searchBooksTool',
              description:
                'Tìm kiếm và gợi ý sách trong cửa hàng dựa trên chủ đề, từ khóa, tên sách, tác giả hoặc khoảng giá.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  query: {
                    type: 'STRING',
                    description: 'Từ khóa hoặc chủ đề sách khách hàng đang tìm kiếm',
                  },
                  minPrice: {
                    type: 'NUMBER',
                    description: 'Giá tối thiểu (VNĐ) nếu khách hàng yêu cầu',
                  },
                  maxPrice: {
                    type: 'NUMBER',
                    description: 'Giá tối đa (VNĐ) nếu khách hàng yêu cầu (ví dụ: dưới 150000)',
                  },
                },
                required: ['query'],
              },
            },
            {
              name: 'getBookDetailTool',
              description:
                'Xem thông tin chi tiết của một cuốn sách cụ thể (nhà xuất bản, số trang, năm xuất bản, nội dung chi tiết).',
              parameters: {
                type: 'OBJECT',
                properties: {
                  slugOrName: {
                    type: 'STRING',
                    description: 'Tên cuốn sách hoặc đường dẫn slug của cuốn sách',
                  },
                },
                required: ['slugOrName'],
              },
            },
            {
              name: 'trackOrderTool',
              description:
                'Tra cứu trạng thái đơn hàng hoặc lịch sử đặt hàng gần nhất của khách hàng.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  orderCode: {
                    type: 'STRING',
                    description: 'Mã đơn hàng (ví dụ: ORD-123456-789) nếu khách hàng cung cấp',
                  },
                },
              },
            },
          ],
        },
      ];

      // Bước 1: Gửi tin nhắn kèm khai báo danh sách công cụ (Tools) cho Gemini
      const firstResponse = await axios.post(
        endpoint,
        {
          systemInstruction: {
            parts: [{ text: ChatAssistantService.SYSTEM_INSTRUCTION }],
          },
          contents,
          tools,
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
              parts: [{ text: ChatAssistantService.SYSTEM_INSTRUCTION }],
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

    // 1. Nhận diện yêu cầu tra cứu đơn hàng (có mã ORD-... hoặc các từ khóa đơn hàng)
    const orderCodeMatch = message.match(/\bORD-[A-Z0-9-]+\b/i);
    const isOrderIntent =
      Boolean(orderCodeMatch) ||
      /(đơn hàng|kiểm tra đơn|tra cứu đơn|tình trạng đơn|bao giờ giao|vận chuyển)/i.test(
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

    // 2. Nhận diện câu chào hỏi xã giao cơ bản
    if (
      /^(xin chào|chào shop|chào bạn|hello|hi|shop ơi|cho mình hỏi)$/i.test(
        lower.trim(),
      )
    ) {
      return {
        reply:
          'Chào bạn! Mình là Trợ lý AI của Bookstore. Mình có thể giúp bạn tìm sách theo chủ đề, tầm giá, xem thông tin chi tiết sách hoặc tra cứu trạng thái đơn hàng. Bạn đang quan tâm đến cuốn sách nào nhỉ?',
        outcome: null,
      };
    }

    // 3. Nhận diện yêu cầu xem chi tiết một cuốn sách cụ thể
    const isDetailIntent =
      /(chi tiết cuốn|thông tin cuốn|nhà xuất bản|bao nhiêu trang|số trang|năm xuất bản|tóm tắt cuốn)/i.test(
        lower,
      );

    if (isDetailIntent) {
      const cleanedTarget = message
        .replace(
          /(cho mình xem|chi tiết cuốn|thông tin cuốn|sách|nhà xuất bản|bao nhiêu trang|số trang|năm xuất bản|tóm tắt cuốn|là gì|nhé|ạ|\?)/gi,
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
      default:
        return this.chatToolsService.executeSearchBooks({
          query: String(args.query || ''),
        });
    }
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

    return outcome.toolOutputText;
  }

  /**
   * Kiểm tra các mẫu câu cố tình vượt quyền điều khiển hệ thống (Prompt Injection)
   */
  private isPromptInjectionAttempt(text: string): boolean {
    return /(ignore (all )?previous instructions|system prompt|bỏ qua (mọi |tất cả )?hướng dẫn trước|tiết lộ cấu hình hệ thống|drop table|delete from)/i.test(
      text,
    );
  }

  private buildSessionCacheKey(sessionId: string): string {
    return `/chat-assistant/sessions/${sessionId}`;
  }
}
