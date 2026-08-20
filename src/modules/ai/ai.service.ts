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

  // Tạo vector 384 chiều
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.extractor) return [];
    const output = await this.extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
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
}