import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { pipeline } from '@xenova/transformers';
import axios from 'axios';

@Injectable()
export class AiService implements OnModuleInit {
  private extractor: any;
  private readonly logger = new Logger(AiService.name);

  async onModuleInit() {
    this.logger.log('Đang tải mô hình nhúng Vector (MiniLM) vào RAM...');
    this.extractor = await pipeline(
      'feature-extraction', 
      'Xenova/paraphrase-multilingual-MiniLM-L12-v2', 
      { quantized: true }
    );
    this.logger.log('Mô hình nhúng Vector đã sẵn sàng!');
  }

  private readonly embeddingCache = new Map<string, number[]>();

  // Tạo vector 384 chiều (kèm bộ nhớ đệm RAM để tối ưu tốc độ)
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || !this.extractor) return [];
    const normalizedText = text.trim();
    if (this.embeddingCache.has(normalizedText)) {
      return this.embeddingCache.get(normalizedText)!;
    }

    const output = await this.extractor(normalizedText, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data) as number[];
    this.embeddingCache.set(normalizedText, vector);
    return vector;
  }

  // Gọi Ollama LLM để bóc từ khóa
  async generateSeoKeywords(title: string, description: string, categories: string): Promise<string> {
    if (!description) return '';

    try {
      const prompt = `
      Bạn là chuyên gia SEO E-commerce. Hãy trích xuất 10 từ khóa quan trọng nhất từ Tên sách, Danh mục và Mô tả dưới đây.
      Yêu cầu: Chỉ trả về từ khóa, cách nhau bằng dấu phẩy. Không giải thích, không gạch đầu dòng.
      
      Tên sách: ${title}
      Danh mục: ${categories}
      Mô tả: ${description}
      `;

      const response = await axios.post('http://ollama_ai:11434/api/generate', {
        model: 'qwen2.5:1.5b',
        prompt: prompt,
        stream: false,
        options: {
          num_ctx: 8192
        }
      });

      return response.data.response.trim();
    } catch (error: any) { 
      this.logger.error('Lỗi khi gọi Ollama', error?.message || error);
      return title; 
    }
  }

  /**
   * Tính độ tương đồng ngữ nghĩa Cosine (Cosine Similarity) giữa 2 vector 384 chiều của MiniLM.
   * Vì vector đầu ra của MiniLM đã được chuẩn hóa (normalize: true), tích vô hướng (dot product)
   * chính là giá trị Cosine Similarity nằm trong khoảng [-1, 1].
   */
  computeCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA?.length || !vecB?.length || vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return Number((dotProduct / denominator).toFixed(4));
  }

  /**
   * Gọi mô hình ngôn ngữ cục bộ Ollama (qwen2.5:1.5b) để tổng hợp lời khuyên định hướng SEO
   * dựa trên danh sách các tiêu chí chưa đạt từ bộ chấm điểm Rule-Based.
   * Nếu dịch vụ Ollama không phản hồi, hàm trả về nguyên vẹn các khuyến nghị định lượng mặc định.
   */
  async generateSeoAuditAdvice(
    weakPoints: string[],
    context: { title: string; focusKeyword: string; totalScore: number },
  ): Promise<string[]> {
    if (!weakPoints || weakPoints.length === 0) {
      return [
        'Bài viết sản phẩm đã đáp ứng đầy đủ các tiêu chí tối ưu hóa công cụ tìm kiếm (On-Page SEO).',
      ];
    }

    try {
      const ollamaUrl =
        process.env.OLLAMA_API_URL || 'http://ollama_ai:11434/api/generate';

      const prompt = `Bạn là trợ lý biên tập nội dung SEO cho website bán sách.
Dựa trên kết quả kiểm tra SEO tự động dưới đây, hãy viết 3 đến 4 câu gợi ý ngắn gọn, rõ ràng bằng tiếng Việt để hướng dẫn quản trị viên cách chỉnh sửa bài viết (KHÔNG tự ý viết lại bài viết mới).

Thông tin sách:
- Tiêu đề: "${context.title}"
- Từ khóa trọng tâm: "${context.focusKeyword}"
- Điểm hiện tại: ${context.totalScore}/100

Các điểm yếu cần khắc phục:
${weakPoints.map((w, idx) => `${idx + 1}. ${w}`).join('\n')}

Yêu cầu định dạng: Trả về mỗi gợi ý trên một dòng bắt đầu bằng dấu "- ".`;

      const response = await axios.post(
        ollamaUrl,
        {
          model: 'qwen2.5:1.5b',
          prompt,
          stream: false,
          options: {
            num_ctx: 4096,
            temperature: 0.3,
          },
        },
        { timeout: 8000 },
      );

      const rawText: string = response.data?.response || '';
      const lines = rawText
        .split('\n')
        .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
        .filter((line) => line.length > 10);

      return lines.length > 0 ? lines.slice(0, 5) : weakPoints;
    } catch (error: any) {
      this.logger.warn(
        `Không thể kết nối Ollama để sinh gợi ý SEO nâng cao, sử dụng gợi ý chuẩn từ hệ thống: ${error?.message || error}`,
      );
      return weakPoints;
    }
  }
}