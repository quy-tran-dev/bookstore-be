import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { ProductsService } from '../products/products.service';
import { Product } from '../products/entities/product.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderStatus } from '@app/common/enums/order-status.enum';
import {
  ChatCartItem,
  ChatOrderSummary,
  ChatSuggestedProduct,
  StorePolicyTopic,
  ToolExecutionOutcome,
} from './interfaces/chat-assistant.interface';
import { BOOKSTORE_STORE_POLICIES } from './constants/chat-assistant.constant';
import { SectionBlock } from '../products/interfaces/section.interface';

@Injectable()
export class ChatToolsService {
  private readonly logger = new Logger(ChatToolsService.name);

  constructor(
    private readonly productsService: ProductsService,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  /**
   * TOOL 1: Tìm kiếm và gợi ý sách theo nhu cầu khách hàng (sử dụng Hybrid Search B: Cosine Vector + FTS).
   * Kết hợp lọc theo khoảng giá (minPrice / maxPrice) nếu khách đề cập ngân sách.
   */
  async executeSearchBooks(args: {
    query: string;
    minPrice?: number;
    maxPrice?: number;
    limit?: number;
  }): Promise<ToolExecutionOutcome> {
    const searchQuery = (args.query || '').trim();
    const limit = Math.min(5, Math.max(1, Number(args.limit || 5)));

    if (!searchQuery) {
      return {
        toolName: 'searchBooksTool',
        toolOutputText:
          'Khách hàng chưa cung cấp từ khóa hoặc chủ đề sách cần tìm.',
        suggestedProducts: [],
      };
    }

    try {
      // Gọi thuật toán Hybrid Search B (70% ngữ nghĩa MiniLM + 30% Full-Text Search)
      const rawResults = await this.productsService.searchHybridB(
        searchQuery,
        10,
        {
          alpha: 0.7,
          threshold: 0.68,
          minScore: 0.22,
          useOrOperator: true,
        },
      );

      // Áp dụng bộ lọc khoảng giá nếu khách hàng có yêu cầu (ví dụ: "sách dưới 150000")
      const filtered = (rawResults || []).filter((item: any) => {
        if (!item) return false;
        const effectivePrice = Number(item.finalPrice || item.price || 0);
        if (
          args.minPrice !== undefined &&
          Number(args.minPrice) > 0 &&
          effectivePrice < Number(args.minPrice)
        ) {
          return false;
        }
        if (
          args.maxPrice !== undefined &&
          Number(args.maxPrice) > 0 &&
          effectivePrice > Number(args.maxPrice)
        ) {
          return false;
        }
        return true;
      });

      const topBooks = filtered.slice(0, limit);

      const suggestedProducts: ChatSuggestedProduct[] = topBooks.map(
        (b: any) => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
          price: Number(b.price || 0),
          finalPrice: Number(b.finalPrice || b.price || 0),
          shortDescribe: b.shortDescribe || '',
          stockQuantity: Number(b.stockQuantity || 0),
          soldCount: Number(b.soldCount || 0),
          thumbnailUrl: b.albums?.[0]?.url || null,
          categories: b.categories?.map((c: any) => c.name) || [],
          authors: b.authors?.map((a: any) => a.name) || [],
        }),
      );

      if (suggestedProducts.length === 0) {
        return {
          toolName: 'searchBooksTool',
          toolOutputText: `Không tìm thấy cuốn sách nào trong kho khớp với yêu cầu "${searchQuery}"${
            args.maxPrice ? ` trong tầm giá dưới ${args.maxPrice}đ` : ''
          }. Hãy thông báo lịch sự và gợi ý khách thử chủ đề khác.`,
          suggestedProducts: [],
        };
      }

      // Tạo văn bản ngữ cảnh gọn gàng gửi cho mô hình AI để tổng hợp câu trả lời (chống bịa sách)
      const summaryLines = suggestedProducts.map(
        (p, idx) =>
          `${idx + 1}. Tên sách: "${p.name}" (Slug: ${p.slug}) | Giá bán: ${p.finalPrice.toLocaleString('vi-VN')}đ | Tồn kho: ${
            p.stockQuantity > 0 ? `Còn ${p.stockQuantity} cuốn` : 'Tạm hết hàng'
          } | Tác giả: ${p.authors?.join(', ') || 'Đang cập nhật'} | Mô tả ngắn: ${
            p.shortDescribe || 'Không có'
          }`,
      );

      return {
        toolName: 'searchBooksTool',
        toolOutputText: `Danh sách ${suggestedProducts.length} cuốn sách thực tế tìm thấy trong cửa hàng:\n${summaryLines.join('\n')}`,
        suggestedProducts,
      };
    } catch (error: any) {
      this.logger.error(
        `Lỗi khi thực thi searchBooksTool: ${error?.message || error}`,
      );
      return {
        toolName: 'searchBooksTool',
        toolOutputText: 'Hệ thống tìm kiếm sách đang bận, vui lòng thử lại sau.',
        suggestedProducts: [],
      };
    }
  }

  /**
   * TOOL 2: Tra cứu thông tin chi tiết của một cuốn sách cụ thể (bao gồm thông số xuất bản và nội dung SectionBlock[]).
   */
  async executeGetBookDetail(args: {
    slugOrName: string;
  }): Promise<ToolExecutionOutcome> {
    const keyword = (args.slugOrName || '').trim();
    if (!keyword) {
      return {
        toolName: 'getBookDetailTool',
        toolOutputText: 'Chưa xác định được tên sách hoặc đường dẫn sách cần xem chi tiết.',
        suggestedProducts: [],
      };
    }

    try {
      // 1. Ưu tiên tìm theo slug chính xác hoặc tên sách gần giống (chỉ select các cột công khai, tuyệt đối không lấy cột cost giá vốn)
      let product = await this.productRepository.findOne({
        where: [
          { slug: keyword, status: 1, isVerified: true },
          { name: ILike(`%${keyword}%`), status: 1, isVerified: true },
        ],
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          finalPrice: true,
          shortDescribe: true,
          stockQuantity: true,
          soldCount: true,
        },
        relations: {
          bookDetail: true,
          categories: true,
          authors: true,
          albums: { media: true },
        },
      });

      // 2. Nếu không khớp trực tiếp, dùng Hybrid Search để tìm cuốn sát nghĩa nhất
      if (!product) {
        const hybridMatches = await this.productsService.searchHybridB(
          keyword,
          1,
          { alpha: 0.7, threshold: 0.65, minScore: 0.25 },
        );
        if (hybridMatches && hybridMatches.length > 0 && hybridMatches[0]) {
          product = await this.productRepository.findOne({
            where: { id: hybridMatches[0].id },
            select: {
              id: true,
              name: true,
              slug: true,
              price: true,
              finalPrice: true,
              shortDescribe: true,
              stockQuantity: true,
              soldCount: true,
            },
            relations: {
              bookDetail: true,
              categories: true,
              authors: true,
              albums: { media: true },
            },
          });
        }
      }

      if (!product) {
        return {
          toolName: 'getBookDetailTool',
          toolOutputText: `Không tìm thấy cuốn sách "${keyword}" trong cửa hàng.`,
          suggestedProducts: [],
        };
      }

      // Trích xuất nội dung bài viết từ danh sách SectionBlock[] (hoặc fallback sang describe cũ)
      const sectionPreview = this.extractSectionSummary(
        product.bookDetail?.sections,
        product.bookDetail?.describe,
      );

      const suggestedProduct: ChatSuggestedProduct = {
        id: product.id,
        name: product.name || '',
        slug: product.slug || '',
        price: Number(product.price || 0),
        finalPrice: Number(product.finalPrice || product.price || 0),
        shortDescribe: product.shortDescribe || '',
        stockQuantity: Number(product.stockQuantity || 0),
        soldCount: Number(product.soldCount || 0),
        thumbnailUrl: product.albums?.[0]?.media?.fileUrl || null,
        categories: product.categories?.map((c) => c.name || '') || [],
        authors: product.authors?.map((a) => a.name || '') || [],
      };

      const detailText = [
        `Tên sách: "${product.name}" (Slug: ${product.slug})`,
        `Giá bán: ${suggestedProduct.finalPrice.toLocaleString('vi-VN')}đ (Giá gốc: ${suggestedProduct.price.toLocaleString('vi-VN')}đ)`,
        `Tình trạng kho: ${suggestedProduct.stockQuantity > 0 ? `Còn ${suggestedProduct.stockQuantity} cuốn` : 'Tạm hết hàng'}`,
        `Tác giả: ${suggestedProduct.authors?.join(', ') || 'Đang cập nhật'}`,
        `Danh mục: ${suggestedProduct.categories?.join(', ') || 'Đang cập nhật'}`,
        `Nhà xuất bản: ${product.bookDetail?.publisher || 'Đang cập nhật'} | Năm XB: ${product.bookDetail?.publishYear || 'Đang cập nhật'}`,
        `Định dạng: ${product.bookDetail?.format || 'Bìa mềm'} | Số trang: ${product.bookDetail?.pageCount || 'Đang cập nhật'}`,
        `Mô tả ngắn: ${product.shortDescribe || 'Không có'}`,
        `Nội dung chi tiết: ${sectionPreview}`,
      ].join('\n');

      return {
        toolName: 'getBookDetailTool',
        toolOutputText: detailText,
        suggestedProducts: [suggestedProduct],
      };
    } catch (error: any) {
      this.logger.error(
        `Lỗi khi thực thi getBookDetailTool: ${error?.message || error}`,
      );
      return {
        toolName: 'getBookDetailTool',
        toolOutputText: 'Không thể truy xuất thông tin chi tiết sách lúc này.',
        suggestedProducts: [],
      };
    }
  }

  /**
   * TOOL 3: Tra cứu trạng thái đơn hàng cho khách hàng.
   * Bảo mật:
   * - Nếu khách đã đăng nhập (có currentUserId): Cho phép tra cứu theo mã đơn hoặc liệt kê 3 đơn gần nhất của chính khách đó.
   * - Nếu khách chưa đăng nhập: Bắt buộc phải cung cấp đúng mã đơn hàng (ví dụ: ORD-123456-789).
   */
  async executeTrackOrder(
    args: { orderCode?: string },
    currentUserId?: string,
  ): Promise<ToolExecutionOutcome> {
    const cleanCode = (args.orderCode || '').trim().toUpperCase();

    try {
      let orders: Order[] = [];

      if (cleanCode) {
        // Tìm theo mã đơn hàng cụ thể (chỉ select các trường công khai, tuyệt đối không lấy noteAdmin hoặc thông tin nhạy cảm)
        const whereCondition: any = { code: cleanCode };
        if (currentUserId) {
          whereCondition.user = { id: currentUserId };
        }
        const found = await this.orderRepository.findOne({
          where: whereCondition,
          select: {
            id: true,
            code: true,
            status: true,
            paymentMethod: true,
            paymentStatus: true,
            finalAmount: true,
            createdAt: true,
          },
          relations: { items: true },
        });
        if (found) orders = [found];
      } else if (currentUserId) {
        // Khách đã đăng nhập hỏi chung về đơn hàng của mình -> Lấy 3 đơn gần nhất
        orders = await this.orderRepository.find({
          where: { user: { id: currentUserId } },
          select: {
            id: true,
            code: true,
            status: true,
            paymentMethod: true,
            paymentStatus: true,
            finalAmount: true,
            createdAt: true,
          },
          relations: { items: true },
          order: { createdAt: 'DESC' },
          take: 3,
        });
      } else {
        return {
          toolName: 'trackOrderTool',
          toolOutputText:
            'Khách hàng chưa đăng nhập và chưa cung cấp mã đơn hàng. Hãy hướng dẫn khách nhập mã đơn hàng (có dạng ORD-XXXXXX-XXX) hoặc đăng nhập tài khoản để kiểm tra.',
          referencedOrders: [],
        };
      }

      if (orders.length === 0) {
        return {
          toolName: 'trackOrderTool',
          toolOutputText: cleanCode
            ? `Không tìm thấy đơn hàng nào có mã "${cleanCode}". Vui lòng kiểm tra lại mã đơn hàng.`
            : 'Tài khoản của khách hàng hiện chưa có đơn hàng nào.',
          referencedOrders: [],
        };
      }

      const referencedOrders: ChatOrderSummary[] = orders.map((o) => ({
        id: o.id,
        code: o.code || '',
        status: o.status,
        statusLabel: this.translateOrderStatus(o.status),
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        finalAmount: Number(o.finalAmount || 0),
        createdAt: o.createdAt,
        items:
          o.items?.map((item) => ({
            productName: item.productName || 'Sách',
            quantity: Number(item.quantity || 1),
            unitPrice: Number(item.unitPrice || 0),
            totalPrice: Number(item.totalPrice || 0),
          })) || [],
      }));

      const orderLines = referencedOrders.map((o, idx) => {
        const itemNames = o.items
          .map((i) => `${i.productName} (x${i.quantity})`)
          .join(', ');
        return `${idx + 1}. Mã đơn: ${o.code} | Trạng thái: ${o.statusLabel} | Thanh toán: ${o.paymentMethod} (${o.paymentStatus}) | Tổng tiền: ${o.finalAmount.toLocaleString('vi-VN')}đ | Sản phẩm: ${itemNames}`;
      });

      return {
        toolName: 'trackOrderTool',
        toolOutputText: `Thông tin đơn hàng tra cứu được:\n${orderLines.join('\n')}`,
        referencedOrders,
      };
    } catch (error: any) {
      this.logger.error(
        `Lỗi khi thực thi trackOrderTool: ${error?.message || error}`,
      );
      return {
        toolName: 'trackOrderTool',
        toolOutputText: 'Không thể tra cứu đơn hàng ngay lúc này, vui lòng thử lại sau.',
        referencedOrders: [],
      };
    }
  }

  /**
   * TOOL 4: Chuẩn bị danh sách sách khách muốn thêm vào giỏ hàng nhanh (Bước 1: Kiểm tra tồn kho & Hỏi xác nhận lại).
   * Nhận mảng { slugOrName, amount }, tìm đúng sách thực tế trong DB, kiểm tra số lượng tồn kho,
   * và trả về trạng thái AWAITING_CONFIRMATION để AI hỏi lại khách trước khi chốt.
   */
  async executePrepareAddToCart(args: {
    items: { slugOrName: string; amount?: number }[];
  }): Promise<ToolExecutionOutcome> {
    const rawItems = Array.isArray(args.items) ? args.items : [];
    if (rawItems.length === 0) {
      return {
        toolName: 'prepareAddToCartTool',
        toolOutputText:
          'Chưa xác định được cuốn sách và số lượng mà khách hàng muốn thêm vào giỏ hàng.',
        cartAction: null,
      };
    }

    try {
      const preparedItems: ChatCartItem[] = [];
      const suggestedProducts: ChatSuggestedProduct[] = [];
      const outOfStockNames: string[] = [];

      for (const reqItem of rawItems) {
        const keyword = (reqItem.slugOrName || '').trim();
        if (!keyword) continue;

        const requestedAmount = Math.max(1, Math.round(Number(reqItem.amount || 1)));

        // 1. Tìm sách theo slug hoặc tên gần đúng (chỉ select trường công khai, không lấy cột cost)
        let product = await this.productRepository.findOne({
          where: [
            { slug: keyword, status: 1, isVerified: true },
            { name: ILike(`%${keyword}%`), status: 1, isVerified: true },
          ],
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            finalPrice: true,
            shortDescribe: true,
            stockQuantity: true,
            soldCount: true,
          },
          relations: {
            albums: { media: true },
            categories: true,
            authors: true,
          },
        });

        // 2. Nếu không khớp trực tiếp, dùng Hybrid Search tìm cuốn sát nhất
        if (!product) {
          const hybridMatches = await this.productsService.searchHybridB(
            keyword,
            1,
            { alpha: 0.7, threshold: 0.65, minScore: 0.25 },
          );
          if (hybridMatches && hybridMatches.length > 0 && hybridMatches[0]) {
            product = await this.productRepository.findOne({
              where: { id: hybridMatches[0].id },
              select: {
                id: true,
                name: true,
                slug: true,
                price: true,
                finalPrice: true,
                shortDescribe: true,
                stockQuantity: true,
                soldCount: true,
              },
              relations: {
                albums: { media: true },
                categories: true,
                authors: true,
              },
            });
          }
        }

        if (!product) continue;

        const stock = Number(product.stockQuantity || 0);
        if (stock <= 0) {
          outOfStockNames.push(product.name || keyword);
          continue;
        }

        // Giới hạn số lượng thêm vào giỏ không vượt quá tồn kho thực tế
        const finalAmount = Math.min(stock, requestedAmount);
        const unitPrice = Number(product.finalPrice || product.price || 0);
        const totalPrice = unitPrice * finalAmount;
        const thumbnailUrl = product.albums?.[0]?.media?.fileUrl || null;

        preparedItems.push({
          productId: product.id,
          amount: finalAmount,
          name: product.name || '',
          slug: product.slug || '',
          unitPrice,
          totalPrice,
          stockQuantity: stock,
          thumbnailUrl,
        });

        suggestedProducts.push({
          id: product.id,
          name: product.name || '',
          slug: product.slug || '',
          price: Number(product.price || 0),
          finalPrice: unitPrice,
          shortDescribe: product.shortDescribe || '',
          stockQuantity: stock,
          soldCount: Number(product.soldCount || 0),
          thumbnailUrl,
          categories: product.categories?.map((c) => c.name || '') || [],
          authors: product.authors?.map((a) => a.name || '') || [],
        });
      }

      if (preparedItems.length === 0) {
        const msg =
          outOfStockNames.length > 0
            ? `Rất tiếc, cuốn sách "${outOfStockNames.join(', ')}" hiện đang tạm hết hàng nên chưa thể thêm vào giỏ.`
            : 'Không tìm thấy cuốn sách bạn muốn thêm vào giỏ hàng trong kho của Bookstore.';
        return {
          toolName: 'prepareAddToCartTool',
          toolOutputText: msg,
          suggestedProducts: [],
          cartAction: null,
        };
      }

      const totalAmount = preparedItems.reduce(
        (sum, item) => sum + item.totalPrice,
        0,
      );

      const summaryLines = preparedItems.map(
        (item, idx) =>
          `${idx + 1}. "${item.name}" (ID: ${item.productId}) — Số lượng: ${item.amount} cuốn | Đơn giá: ${item.unitPrice.toLocaleString('vi-VN')}đ | Thành tiền: ${item.totalPrice.toLocaleString('vi-VN')}đ`,
      );

      return {
        toolName: 'prepareAddToCartTool',
        toolOutputText: `Đã chuẩn bị danh sách chờ thêm vào giỏ hàng:\n${summaryLines.join('\n')}\nTổng tạm tính: ${totalAmount.toLocaleString('vi-VN')}đ.\nHãy hỏi xác nhận lại khách hàng một lần nữa (ví dụ: "Bạn xác nhận chốt thêm vào giỏ hàng nhé?") trước khi thực hiện.`,
        suggestedProducts,
        cartAction: {
          status: 'AWAITING_CONFIRMATION',
          items: preparedItems,
          totalAmount,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Lỗi khi thực thi prepareAddToCartTool: ${error?.message || error}`,
      );
      return {
        toolName: 'prepareAddToCartTool',
        toolOutputText: 'Không thể chuẩn bị giỏ hàng ngay lúc này, vui lòng thử lại.',
        cartAction: null,
      };
    }
  }

  /**
   * TOOL 5: Cung cấp thông tin chính sách chính thức của Bookstore (Hoàn tiền & Đổi trả, Vận chuyển, Thanh toán, Bản quyền sách).
   * Giúp AI trả lời thống nhất theo quy định của cửa hàng mà không tự suy diễn sai chính sách.
   */
  async executeGetStorePolicy(args: {
    topic?: StorePolicyTopic | string;
  }): Promise<ToolExecutionOutcome> {
    const rawTopic = (args.topic || 'general').toLowerCase().trim();

    let selectedTopic: StorePolicyTopic = 'general';
    if (/(refund|hoàn tiền|đổi trả|trả hàng|sách lỗi|rách)/i.test(rawTopic)) {
      selectedTopic = 'refund';
    } else if (/(shipping|vận chuyển|giao hàng|phí ship|ship)/i.test(rawTopic)) {
      selectedTopic = 'shipping';
    } else if (/(payment|thanh toán|cod|vnpay|chuyển khoản)/i.test(rawTopic)) {
      selectedTopic = 'payment';
    } else if (/(warranty|bảo hành|bản quyền|sách thật|chính hãng)/i.test(rawTopic)) {
      selectedTopic = 'warranty';
    }

    const policyText =
      selectedTopic === 'general'
        ? [
            BOOKSTORE_STORE_POLICIES.refund,
            '',
            BOOKSTORE_STORE_POLICIES.shipping,
            '',
            BOOKSTORE_STORE_POLICIES.payment,
            '',
            BOOKSTORE_STORE_POLICIES.warranty,
          ].join('\n')
        : BOOKSTORE_STORE_POLICIES[selectedTopic];

    return {
      toolName: 'getStorePolicyTool',
      toolOutputText: policyText,
      suggestedProducts: [],
      referencedOrders: [],
      cartAction: null,
    };
  }

  /**
   * Trích xuất nội dung tóm tắt từ mảng SectionBlock[] (giới hạn 800 ký tự để tối ưu Token gửi cho LLM)
   */
  private extractSectionSummary(
    sections?: SectionBlock[],
    fallbackDescribe?: string,
  ): string {
    const parts: string[] = [];

    if (sections && Array.isArray(sections) && sections.length > 0) {
      sections.forEach((block) => {
        if (!block) return;
        if (block.type === 'heading' && block.heading?.text) {
          parts.push(`[${block.heading.text}]`);
        } else if (block.type === 'paragraph' && block.content) {
          parts.push(block.content);
        } else if (block.type === 'quote' && block.content) {
          parts.push(`"${block.content}"`);
        } else if (block.type === 'list' && Array.isArray(block.list?.items)) {
          parts.push(block.list.items.join('; '));
        }
      });
    } else if (fallbackDescribe) {
      parts.push(fallbackDescribe.replace(/<[^>]+>/g, ' '));
    }

    const combined = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (!combined) return 'Chưa có bài viết chi tiết.';
    return combined.length > 800 ? `${combined.slice(0, 800)}...` : combined;
  }

  /**
   * Quy đổi mã trạng thái đơn hàng sang tiếng Việt thân thiện cho khách hàng
   */
  private translateOrderStatus(status?: OrderStatus): string {
    switch (status) {
      case OrderStatus.PENDING:
        return 'Chờ xác nhận';
      case OrderStatus.CONFIRMED:
        return 'Đã xác nhận - Đang chuẩn bị sách';
      case OrderStatus.SHIPPING:
        return 'Đang giao hàng';
      case OrderStatus.COMPLETED:
        return 'Đã giao hàng thành công';
      case OrderStatus.CANCELLED:
        return 'Đã hủy';
      case OrderStatus.REFUNDED:
        return 'Đã hoàn tiền';
      default:
        return 'Đang xử lý';
    }
  }
}
