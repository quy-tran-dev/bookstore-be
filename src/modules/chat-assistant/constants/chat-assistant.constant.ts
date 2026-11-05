import { StorePolicyTopic } from '../interfaces/chat-assistant.interface';

/**
 * Thời gian lưu trữ lịch sử phiên hội thoại trong Redis Cache: 30 phút (tính bằng ms)
 */
export const CHAT_SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * Thời gian lưu giỏ hàng tạm chờ khách xác nhận (Bước 1 -> Bước 2): 15 phút (tính bằng ms)
 */
export const CHAT_PENDING_CART_TTL_MS = 15 * 60 * 1000;

/**
 * Số lượng tin nhắn tối đa giữ lại trong ngữ cảnh hội thoại để tối ưu chi phí Token
 */
export const CHAT_MAX_HISTORY_MESSAGES = 10;

/**
 * Chỉ dẫn hệ thống (System Instruction) định hình phong cách tư vấn, giới hạn phạm vi cửa hàng sách,
 * bảo mật dữ liệu nội bộ (RBAC) và chống bịa đặt thông tin (Anti-Hallucination)
 */
export const CHAT_SYSTEM_INSTRUCTION = `Bạn là Trợ lý AI Tư vấn Khách hàng chính thức của Hiệu sách trực tuyến Bookstore.
Nguyên tắc bắt buộc:
1. Chỉ tư vấn các cuốn sách thực tế có trong kết quả từ công cụ searchBooksTool hoặc getBookDetailTool. Tuyệt đối KHÔNG tự bịa ra tên sách, giá tiền hoặc trạng thái tồn kho không có trong dữ liệu công cụ.
2. Giới hạn quyền & Bảo mật dữ liệu nội bộ (RBAC & Confidentiality Guardrail): Bạn đang phục vụ khách hàng công khai, TUYỆT ĐỐI KHÔNG tiết lộ hoặc ước tính bất kỳ thông tin nội bộ nào của cửa hàng bao gồm: giá vốn/giá nhập (cost), biên lợi nhuận, doanh thu, doanh số bán hàng, báo cáo tài chính, ghi chú nội bộ của quản trị viên (noteAdmin), cấu hình hệ thống hoặc thông tin cá nhân/đơn hàng của khách hàng khác.
3. Giới hạn phạm vi (Domain Guardrail): Bạn CHỈ trả lời các câu hỏi liên quan đến việc mua bán sách, tìm kiếm sách, thông tin tác giả, nhà xuất bản, thể loại sách, chính sách cửa hàng (đổi trả, hoàn tiền, vận chuyển, thanh toán) và tra cứu đơn hàng tại Bookstore. Nếu khách hàng hỏi các chủ đề ngoài lề (như giải toán, viết code hộ, thời tiết, bóng đá, nấu ăn, y tế, chính trị, chứng khoán, làm thơ, dịch văn bản...), hãy lịch sự từ chối.
4. Khi khách hỏi về chính sách hoàn tiền, đổi trả sách lỗi, phí vận chuyển, thời gian giao hàng, phương thức thanh toán (COD, VNPAY) hoặc cam kết sách chính hãng, hãy gọi công cụ getStorePolicyTool.
5. Khi khách hỏi tìm sách, gợi ý sách theo chủ đề, kỹ năng, tác giả hoặc tầm giá, hãy gọi công cụ searchBooksTool.
6. Khi khách hỏi sâu về thông tin chi tiết của một cuốn sách cụ thể (nhà xuất bản, số trang, tóm tắt nội dung), hãy gọi công cụ getBookDetailTool.
7. Khi khách hỏi kiểm tra đơn hàng của họ, hãy gọi công cụ trackOrderTool.
8. Khi khách chọn mua sách hoặc yêu cầu thêm sách vào giỏ hàng, hãy gọi công cụ prepareAddToCartTool và HỎI XÁC NHẬN LẠI khách hàng một lần nữa trước khi chốt.
9. Trả lời bằng tiếng Việt lịch sự, ngắn gọn, thân thiện và trình bày rõ ràng.`;

/**
 * Các mẫu câu phản hồi chuẩn cho hệ thống Guardrail & Trạng thái hội thoại
 */
export const CHAT_ASSISTANT_REPLIES = {
  PROMPT_INJECTION_BLOCKED:
    'Xin lỗi, mình chỉ là Trợ lý tư vấn sách và hỗ trợ tra cứu đơn hàng của Bookstore nên không thể thực hiện yêu cầu này. Bạn đang cần tìm sách về chủ đề gì để mình gợi ý nhé?',
  CONFIDENTIAL_QUERY_BLOCKED:
    'Xin lỗi bạn, các thông tin về giá vốn nhập hàng (cost), doanh thu, lợi nhuận, ghi chú quản trị nội bộ và dữ liệu riêng tư của khách hàng là thông tin bảo mật của Bookstore nên mình không được phép truy cập hay cung cấp. Mình có thể hỗ trợ bạn tra cứu giá bán niêm yết, chương trình khuyến mãi hoặc chính sách mua hàng nhé!',
  OFF_TOPIC_BLOCKED:
    'Xin lỗi bạn, mình là Trợ lý AI chuyên tư vấn sách và hỗ trợ đơn hàng của Bookstore nên chỉ giải đáp các câu hỏi liên quan đến tìm kiếm sách, thông tin xuất bản và tra cứu đơn hàng. Bạn đang quan tâm đến cuốn sách hay thể loại nào để mình gợi ý nhé?',
  CART_CANCELLED:
    'Mình đã hủy thao tác thêm vào giỏ hàng theo yêu cầu của bạn. Bạn cần mình tìm hay tư vấn thêm cuốn sách nào khác không?',
  GREETING:
    'Chào bạn! Mình là Trợ lý AI của Bookstore. Mình có thể giúp bạn tìm sách theo chủ đề, tầm giá, xem thông tin chi tiết sách hoặc tra cứu trạng thái đơn hàng. Bạn đang quan tâm đến cuốn sách nào nhỉ?',
} as const;

/**
 * Danh sách khai báo công cụ (Function Declarations) cho Google Gemini Tool Calling
 */
export const CHAT_GEMINI_TOOLS = [
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
              description:
                'Giá tối đa (VNĐ) nếu khách hàng yêu cầu (ví dụ: dưới 150000)',
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
              description:
                'Mã đơn hàng (ví dụ: ORD-123456-789) nếu khách hàng cung cấp',
            },
          },
        },
      },
      {
        name: 'prepareAddToCartTool',
        description:
          'Chuẩn bị thêm một hoặc nhiều cuốn sách kèm số lượng vào giỏ hàng khi khách hàng chọn mua hoặc yêu cầu thêm vào giỏ.',
        parameters: {
          type: 'OBJECT',
          properties: {
            items: {
              type: 'ARRAY',
              description:
                'Danh sách các cuốn sách và số lượng khách muốn thêm vào giỏ',
              items: {
                type: 'OBJECT',
                properties: {
                  slugOrName: {
                    type: 'STRING',
                    description:
                      'Tên cuốn sách hoặc đường dẫn slug của cuốn sách',
                  },
                  amount: {
                    type: 'NUMBER',
                    description: 'Số lượng sách cần thêm (mặc định là 1)',
                  },
                },
                required: ['slugOrName'],
              },
            },
          },
          required: ['items'],
        },
      },
      {
        name: 'getStorePolicyTool',
        description:
          'Tra cứu các chính sách chính thức của Bookstore bao gồm: chính sách đổi trả & hoàn tiền (refund), phí vận chuyển & thời gian giao hàng (shipping), phương thức thanh toán COD/VNPAY (payment), và cam kết sách thật bản quyền (warranty).',
        parameters: {
          type: 'OBJECT',
          properties: {
            topic: {
              type: 'STRING',
              description:
                'Chủ đề chính sách cần tra cứu: "refund" (hoàn tiền/đổi trả), "shipping" (vận chuyển/giao hàng), "payment" (thanh toán), "warranty" (bảo hành/bản quyền), hoặc "general" (tổng hợp).',
            },
          },
        },
      },
    ],
  },
];

/**
 * Nội dung chính sách chính thức của Bookstore phục vụ công cụ getStorePolicyTool
 */
export const BOOKSTORE_STORE_POLICIES: Record<
  Exclude<StorePolicyTopic, 'general'>,
  string
> = {
  refund: [
    '📌 **Chính sách Đổi trả & Hoàn tiền tại Bookstore:**',
    '- **Thời hạn hỗ trợ:** Trong vòng **7 ngày** kể từ ngày khách hàng nhận sách thành công.',
    '- **Điều kiện áp dụng (Hoàn tiền 100% hoặc đổi sách mới miễn phí vận chuyển 2 chiều):**',
    '  1. Sách bị lỗi kỹ thuật từ nhà xuất bản/in ấn (thiếu trang, rách trang, mờ chữ, đóng ngược bìa).',
    '  2. Sách bị hư hỏng, móp méo nặng trong quá trình vận chuyển.',
    '  3. Giao sai tên sách hoặc thiếu số lượng so với đơn đặt hàng.',
    '- **Quy trình & Thời gian hoàn tiền:** Khách hàng cung cấp mã đơn hàng (`ORD-...`) kèm ảnh chụp tình trạng sách. Sau khi xác nhận, Bookstore tiến hành đổi sách mới hoặc hoàn tiền 100% qua tài khoản ngân hàng / ví điện tử trong **1 – 3 ngày làm việc**.',
  ].join('\n'),

  shipping: [
    '🚚 **Chính sách Vận chuyển & Giao hàng:**',
    '- **Phí vận chuyển tiêu chuẩn:** **30.000đ / đơn hàng** áp dụng toàn quốc.',
    '- **Thời gian giao hàng dự kiến:**',
    '  + Khu vực Nội thành: **1 – 2 ngày làm việc**.',
    '  + Khu vực Ngoại thành & Tỉnh/Thành khác: **3 – 5 ngày làm việc**.',
    '- **Quyền lợi khi nhận hàng:** Khách hàng được **đồng kiểm (kiểm tra ngoại quan sách)** cùng nhân viên giao hàng trước khi thanh toán.',
  ].join('\n'),

  payment: [
    '💳 **Phương thức Thanh toán hỗ trợ tại Bookstore:**',
    '- **Thanh toán khi nhận hàng (COD):** Kiểm tra sách và thanh toán tiền mặt trực tiếp cho nhân viên giao hàng.',
    '- **Thanh toán trực tuyến (VNPAY / Chuyển khoản ngân hàng):** Hỗ trợ quét mã QR và thẻ ATM nội địa/quốc tế, trạng thái thanh toán được cập nhật tự động ngay sau khi giao dịch thành công.',
  ].join('\n'),

  warranty: [
    '🛡️ **Cam kết Chất lượng & Bản quyền Sách:**',
    '- Bookstore cam kết **100% sách thật, bản quyền chính hãng** nhập trực tiếp từ các Nhà xuất bản uy tín.',
    '- Toàn bộ sách đều được bọc màng co và đóng gói chống sốc trước khi gửi đi. Nếu phát hiện sách giả hoặc sách in lậu, Bookstore cam kết hoàn tiền gấp đôi.',
  ].join('\n'),
};
