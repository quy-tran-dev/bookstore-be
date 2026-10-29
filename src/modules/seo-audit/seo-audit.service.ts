import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { SeoAudit } from './entities/seo-audit.entity';
import { Product } from '../products/entities/product.entity';
import { AiService } from '../ai/ai.service';
import {
  AnalyzeSeoDraftDto,
  AuditProductOptionsDto,
} from './dto/audit-content.dto';
import {
  SeoAuditChecklist,
  SeoAuditResult,
  SeoCriterionScore,
  SeoGrade,
  SeoSectionFeedback,
} from './interfaces/seo-audit-result.interface';
import { SectionBlock } from '../products/interfaces/section.interface';

@Injectable()
export class SeoAuditService {
  private readonly logger = new Logger(SeoAuditService.name);

  constructor(
    @InjectRepository(SeoAudit)
    private readonly seoAuditRepository: Repository<SeoAudit>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly aiService: AiService,
  ) {}

  /**
   * 1. Phân tích & chấm điểm SEO trực tiếp từ dữ liệu nháp (Draft) do Admin gửi lên từ trình soạn thảo.
   * Không lưu vào Database để Admin có thể bấm kiểm tra liên tục trong lúc chỉnh sửa.
   */
  async analyzeDraft(dto: AnalyzeSeoDraftDto): Promise<SeoAuditResult> {
    const title = (dto.title || '').trim();
    const shortDescribe = (dto.shortDescribe || '').trim();
    const sections = Array.isArray(dto.sections) ? dto.sections : [];
    const fallbackDescribe = (dto.describe || '').trim();

    // Nếu Admin không nhập từ khóa trọng tâm, tự động trích xuất cụm từ chính từ tiêu đề sách
    const focusKeyword = this.resolveFocusKeyword(dto.focusKeyword, title);

    const sectionFeedbacks: SeoSectionFeedback[] = [];
    const weakPoints: string[] = [];

    // Bóc tách toàn bộ văn bản từ các khối Section (hoặc từ describe cũ nếu chưa có section)
    const extracted = this.extractContentFromSections(
      sections,
      fallbackDescribe,
    );

    // =========================================================================
    // TIÊU CHÍ 1: TIÊU ĐỀ & TỪ KHÓA TRỌNG TÂM (Tối đa 20 điểm)
    // - Độ dài tiêu đề: 10 điểm (Lý tưởng: 40 - 65 ký tự; Chấp nhận được: 25 - 39 hoặc 66 - 75 ký tự)
    // - Sự xuất hiện của từ khóa trọng tâm trong tiêu đề: 10 điểm
    // =========================================================================
    const titleAndKeyword = this.evaluateTitleAndKeyword(
      title,
      focusKeyword,
      sectionFeedbacks,
      weakPoints,
    );

    // =========================================================================
    // TIÊU CHÍ 2: MÔ TẢ NGẮN - SHORT DESCRIBE / META DESCRIPTION (Tối đa 15 điểm)
    // - Độ dài mô tả ngắn: 10 điểm (Lý tưởng: 120 - 160 ký tự; Chấp nhận được: 80 - 119 hoặc 161 - 220 ký tự)
    // - Có chứa từ khóa trọng tâm trong mô tả ngắn: 5 điểm
    // =========================================================================
    const metaDescription = this.evaluateMetaDescription(
      shortDescribe,
      focusKeyword,
      sectionFeedbacks,
      weakPoints,
    );

    // =========================================================================
    // TIÊU CHÍ 3: CẤU TRÚC SECTION & ĐỘ SÂU NỘI DUNG (Tối đa 20 điểm)
    // - Có sử dụng thẻ tiêu đề phụ (Heading H2/H3) để chia bố cục bài viết: 10 điểm
    // - Tổng độ dài văn bản bài viết (Word Count): 10 điểm (Đạt chuẩn >= 250 từ; Trung bình 120 - 249 từ)
    // =========================================================================
    const sectionStructure = this.evaluateSectionStructure(
      sections,
      extracted,
      sectionFeedbacks,
      weakPoints,
    );

    // =========================================================================
    // TIÊU CHÍ 4: PHÂN BỔ & MẬT ĐỘ TỪ KHÓA TRONG BÀI VIẾT (Tối đa 15 điểm)
    // - Mật độ từ khóa (Keyword Density = số lần xuất hiện * số từ của keyword / tổng số từ): 10 điểm
    //   + Lý tưởng: 0.8% - 2.5% (10đ)
    //   + Hơi thấp (0.3% - 0.79%) hoặc hơi cao (2.51% - 3.5%): 5đ
    //   + Quá thấp (< 0.3%) hoặc nhồi nhét từ khóa (> 3.5%): 0đ
    // - Vị trí xuất hiện: Từ khóa có mặt ở đoạn mở đầu hoặc trong ít nhất 1 Heading phụ: 5 điểm
    // =========================================================================
    const keywordDistribution = this.evaluateKeywordDistribution(
      focusKeyword,
      extracted,
      sectionFeedbacks,
      weakPoints,
    );

    // =========================================================================
    // TIÊU CHÍ 5: TỐI ƯU ĐA PHƯƠNG TIỆN - IMAGE ALT TEXT (Tối đa 15 điểm)
    // - Gom toàn bộ ảnh từ Album sản phẩm và các khối block.type === 'image' trong Sections
    // - Tính tỷ lệ phần trăm số ảnh có khai báo thuộc tính mô tả altText (>= 5 ký tự)
    // =========================================================================
    const mediaOptimization = this.evaluateMediaOptimization(
      dto.albumImages || [],
      sections,
      sectionFeedbacks,
      weakPoints,
    );

    // =========================================================================
    // TIÊU CHÍ 6: ĐỘ TƯƠNG ĐỒNG NGỮ NGHĨA - SEMANTIC RELEVANCE (Tối đa 15 điểm)
    // - Sử dụng mô hình ngôn ngữ đa ngữ MiniLM-L12-v2 tạo 2 vector 384 chiều:
    //   + Vector A: Ngữ cảnh cốt lõi của sách (Tiêu đề + Mô tả ngắn shortDescribe)
    //   + Vector B: Toàn bộ nội dung bài viết chi tiết trong các khối Section
    // - Tính Cosine Similarity để kiểm tra bài viết chi tiết có bám sát chủ đề hay bị lan man:
    //   + Similarity >= 0.60: 15 điểm (Bám sát chủ đề)
    //   + Similarity 0.45 - 0.59: 8 điểm (Tương đối liên quan nhưng còn dàn trải)
    //   + Similarity < 0.45: 0 điểm (Nội dung chi tiết lệch trọng tâm so với tiêu đề/mô tả ngắn)
    // =========================================================================
    const semanticRelevance = await this.evaluateSemanticRelevance(
      title,
      shortDescribe,
      extracted.fullPlainText,
      sectionFeedbacks,
      weakPoints,
    );

    // Tổng hợp điểm số của cả 6 tiêu chí (Thang điểm 100)
    const checklist: SeoAuditChecklist = {
      titleAndKeyword,
      metaDescription,
      sectionStructure,
      keywordDistribution,
      mediaOptimization,
      semanticRelevance,
    };

    const totalScore =
      titleAndKeyword.score +
      metaDescription.score +
      sectionStructure.score +
      keywordDistribution.score +
      mediaOptimization.score +
      semanticRelevance.score;

    const grade = this.determineGrade(totalScore);
    const summary = this.buildOverallSummary(totalScore, grade);

    // Nếu Admin bật tùy chọn gợi ý AI (includeAiAdvice = true) và bài viết còn điểm yếu,
    // gọi Ollama (qwen2.5:1.5b) để diễn giải hướng dẫn chỉnh sửa tự nhiên bằng tiếng Việt
    const actionableGuidance =
      dto.includeAiAdvice && weakPoints.length > 0
        ? await this.aiService.generateSeoAuditAdvice(weakPoints, {
            title,
            focusKeyword,
            totalScore,
          })
        : weakPoints.length > 0
          ? weakPoints
          : [
              'Bài viết đã đạt chuẩn tối ưu hóa SEO trên cả 6 nhóm tiêu chí đánh giá.',
            ];

    return {
      focusKeyword,
      totalScore,
      grade,
      summary,
      checklist,
      sectionFeedbacks,
      actionableGuidance,
    };
  }

  /**
   * 2. Chấm điểm SEO cho một sản phẩm đã có trong Database và lưu lịch sử vào bảng seo_audits.
   * Lưu ý: Hàm này hoàn toàn độc lập, KHÔNG chặn quyền lưu sản phẩm của Admin dù điểm cao hay thấp.
   */
  async auditProductById(
    productId: string,
    options?: AuditProductOptionsDto,
    currentUserId?: string,
  ): Promise<SeoAuditResult> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: {
        bookDetail: true,
        albums: { media: true },
      },
    });

    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm để kiểm tra SEO.');
    }

    // Trích xuất từ khóa ưu tiên: từ khóa Admin truyền vào -> từ khóa đầu tiên trong seoKeywords -> tên sách
    const defaultKeyword = product.seoKeywords
      ? product.seoKeywords.split(',')[0].trim()
      : product.name || '';
    const focusKeyword = options?.focusKeyword?.trim() || defaultKeyword;

    // Chuẩn bị danh sách ảnh từ Album sản phẩm
    const albumImages =
      product.albums?.map((al) => ({
        url: al.media?.fileUrl,
        altText: al.media?.altText,
      })) || [];

    // Chạy bộ phân tích 6 tiêu chí
    const auditResult = await this.analyzeDraft({
      title: product.name || product.bookDetail?.title || '',
      shortDescribe: product.shortDescribe || '',
      focusKeyword,
      sections: product.bookDetail?.sections || [],
      describe: product.bookDetail?.describe || '',
      albumImages,
      includeAiAdvice: options?.includeAiAdvice ?? true,
    });

    const auditedVersion = product.bookDetail?.version ?? 1;

    // Lưu bản ghi kết quả đánh giá vào bảng seo_audits
    const entity = this.seoAuditRepository.create({
      id: uuidv7(),
      productId: product.id,
      focusKeyword: auditResult.focusKeyword,
      totalScore: auditResult.totalScore,
      grade: auditResult.grade,
      auditedVersion,
      summary: auditResult.summary,
      checklist: auditResult.checklist,
      sectionFeedbacks: auditResult.sectionFeedbacks,
      actionableGuidance: auditResult.actionableGuidance,
      createBy: currentUserId,
      updateBy: currentUserId,
    });

    const saved = await this.seoAuditRepository.save(entity);

    return {
      ...auditResult,
      auditId: saved.id,
      productId: product.id,
      auditedVersion,
      createdAt: saved.createdAt,
    };
  }

  /**
   * 3. Lấy báo cáo SEO mới nhất của một sản phẩm
   */
  async getLatestAuditByProductId(productId: string): Promise<SeoAudit | null> {
    return this.seoAuditRepository.findOne({
      where: { productId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 4. Lấy danh sách lịch sử các lần chấm điểm SEO của một sản phẩm
   */
  async getAuditHistoryByProductId(
    productId: string,
    limit: number = 10,
  ): Promise<SeoAudit[]> {
    return this.seoAuditRepository.find({
      where: { productId },
      order: { createdAt: 'DESC' },
      take: Math.min(50, Math.max(1, limit)),
    });
  }

  // ===========================================================================
  // CÁC HÀM LOGIC CHẤM ĐIỂM CHI TIẾT CHO TỪNG TIÊU CHÍ
  // ===========================================================================

  /**
   * Chấm điểm Tiêu chí 1: Tiêu đề & Từ khóa trọng tâm (Tối đa 20 điểm)
   */
  private evaluateTitleAndKeyword(
    title: string,
    focusKeyword: string,
    sectionFeedbacks: SeoSectionFeedback[],
    weakPoints: string[],
  ): SeoCriterionScore {
    const maxScore = 20;
    const length = title.length;
    let lengthScore = 0;
    let keywordScore = 0;
    const notes: string[] = [];

    // 1.1. Chấm điểm độ dài tiêu đề (Tối đa 10 điểm)
    // Tiêu đề từ 40 - 65 ký tự hiển thị trọn vẹn trên SERP của Google mà không bị cắt dấu "..."
    if (length >= 40 && length <= 65) {
      lengthScore = 10;
      notes.push(`Độ dài tiêu đề đạt chuẩn tối ưu (${length} ký tự).`);
    } else if ((length >= 25 && length < 40) || (length > 65 && length <= 75)) {
      lengthScore = 5;
      const msg =
        length < 40
          ? `Tiêu đề hơi ngắn (${length} ký tự), nên mở rộng lên khoảng 40 - 65 ký tự để tăng sức hút và chứa thêm từ khóa phụ.`
          : `Tiêu đề hơi dài (${length} ký tự), có nguy cơ bị cắt bớt trên kết quả tìm kiếm (khuyến nghị 40 - 65 ký tự).`;
      notes.push(msg);
      weakPoints.push(msg);
      sectionFeedbacks.push({
        field: 'title',
        severity: 'WARNING',
        message: msg,
      });
    } else {
      lengthScore = 0;
      const msg =
        length < 25
          ? `Tiêu đề quá ngắn (${length} ký tự), chưa đủ thông tin mô tả sách (cần tối thiểu 40 - 65 ký tự).`
          : `Tiêu đề quá dài (${length} ký tự), vượt quá giới hạn hiển thị chuẩn của Google (khuyến nghị 40 - 65 ký tự).`;
      notes.push(msg);
      weakPoints.push(msg);
      sectionFeedbacks.push({
        field: 'title',
        severity: 'FAILED',
        message: msg,
      });
    }

    // 1.2. Kiểm tra sự xuất hiện của từ khóa trọng tâm trong tiêu đề (Tối đa 10 điểm)
    const normalizedTitle = title.toLowerCase();
    const normalizedKeyword = focusKeyword.toLowerCase();

    if (normalizedKeyword && normalizedTitle.includes(normalizedKeyword)) {
      keywordScore = 10;
      notes.push(`Tiêu đề đã chứa từ khóa trọng tâm "${focusKeyword}".`);
    } else {
      keywordScore = 0;
      const msg = `Tiêu đề chưa chứa từ khóa trọng tâm "${focusKeyword}". Hãy đưa từ khóa này vào tiêu đề (ưu tiên đặt ở nửa đầu tiêu đề).`;
      notes.push(msg);
      weakPoints.push(msg);
      sectionFeedbacks.push({
        field: 'title',
        severity: 'FAILED',
        message: msg,
      });
    }

    const score = lengthScore + keywordScore;
    return {
      score,
      maxScore,
      status: this.resolveCriterionStatus(score, maxScore),
      details: notes.join(' '),
      metrics: {
        titleLength: length,
        containsFocusKeyword: keywordScore === 10,
      },
    };
  }

  /**
   * Chấm điểm Tiêu chí 2: Mô tả ngắn - shortDescribe / Meta Description (Tối đa 15 điểm)
   */
  private evaluateMetaDescription(
    shortDescribe: string,
    focusKeyword: string,
    sectionFeedbacks: SeoSectionFeedback[],
    weakPoints: string[],
  ): SeoCriterionScore {
    const maxScore = 15;
    const length = shortDescribe.length;

    if (!shortDescribe) {
      const msg =
        'Chưa có mô tả ngắn (shortDescribe). Cần bổ sung đoạn tóm tắt từ 120 - 160 ký tự chứa từ khóa chính để hiển thị trên Google.';
      weakPoints.push(msg);
      sectionFeedbacks.push({
        field: 'shortDescribe',
        severity: 'FAILED',
        message: msg,
      });
      return {
        score: 0,
        maxScore,
        status: 'FAILED',
        details: msg,
        metrics: { length: 0, containsFocusKeyword: false },
      };
    }

    let lengthScore = 0;
    let keywordScore = 0;
    const notes: string[] = [];

    // 2.1. Chấm điểm độ dài shortDescribe (Tối đa 10 điểm)
    // Khoảng 120 - 160 ký tự là độ dài hiển thị tốt nhất cho cả giao diện Desktop và Mobile
    if (length >= 120 && length <= 160) {
      lengthScore = 10;
      notes.push(`Độ dài mô tả ngắn (shortDescribe) lý tưởng (${length} ký tự).`);
    } else if (
      (length >= 80 && length < 120) ||
      (length > 160 && length <= 220)
    ) {
      lengthScore = 5;
      const msg =
        length < 120
          ? `Mô tả ngắn (shortDescribe) hơi ngắn (${length} ký tự). Nên viết trong khoảng 120 - 160 ký tự để tóm tắt trọn vẹn giá trị cuốn sách.`
          : `Mô tả ngắn (shortDescribe) hơi dài (${length} ký tự). Nên rút gọn về khoảng 120 - 160 ký tự để tránh bị cắt cụt trên trang tìm kiếm.`;
      notes.push(msg);
      weakPoints.push(msg);
      sectionFeedbacks.push({
        field: 'shortDescribe',
        severity: 'WARNING',
        message: msg,
      });
    } else {
      lengthScore = 0;
      const msg =
        length < 80
          ? `Mô tả ngắn (shortDescribe) quá sơ sài (${length} ký tự). Hãy viết đoạn giới thiệu từ 120 - 160 ký tự.`
          : `Mô tả ngắn (shortDescribe) quá dài (${length} ký tự). Mô tả ngắn chỉ nên cô đọng trong 120 - 160 ký tự, phần chi tiết hãy đưa vào các khối Section.`;
      notes.push(msg);
      weakPoints.push(msg);
      sectionFeedbacks.push({
        field: 'shortDescribe',
        severity: 'FAILED',
        message: msg,
      });
    }

    // 2.2. Kiểm tra từ khóa trọng tâm trong shortDescribe (Tối đa 5 điểm)
    const containsKeyword =
      Boolean(focusKeyword) &&
      shortDescribe.toLowerCase().includes(focusKeyword.toLowerCase());

    if (containsKeyword) {
      keywordScore = 5;
      notes.push(
        `Mô tả ngắn đã chứa từ khóa trọng tâm "${focusKeyword}".`,
      );
    } else {
      keywordScore = 0;
      const msg = `Mô tả ngắn (shortDescribe) chưa chứa từ khóa trọng tâm "${focusKeyword}". Hãy lồng ghép tự nhiên từ khóa này vào câu mô tả.`;
      notes.push(msg);
      weakPoints.push(msg);
      sectionFeedbacks.push({
        field: 'shortDescribe',
        severity: 'WARNING',
        message: msg,
      });
    }

    const score = lengthScore + keywordScore;
    return {
      score,
      maxScore,
      status: this.resolveCriterionStatus(score, maxScore),
      details: notes.join(' '),
      metrics: {
        length,
        containsFocusKeyword: containsKeyword,
      },
    };
  }

  /**
   * Chấm điểm Tiêu chí 3: Cấu trúc Section & Độ sâu nội dung (Tối đa 20 điểm)
   * - Kiểm tra việc phân chia bố cục bằng các khối Heading (H2/H3): 10 điểm
   * - Kiểm tra tổng số từ (Word Count) của toàn bài viết: 10 điểm
   */
  private evaluateSectionStructure(
    sections: SectionBlock[],
    extracted: {
      fullPlainText: string;
      wordCount: number;
      headingBlocks: SectionBlock[];
      paragraphBlocks: SectionBlock[];
    },
    sectionFeedbacks: SeoSectionFeedback[],
    weakPoints: string[],
  ): SeoCriterionScore {
    const maxScore = 20;
    let headingScore = 0;
    let wordCountScore = 0;
    const notes: string[] = [];

    // 3.1. Đánh giá cấu trúc Heading (Tối đa 10 điểm)
    // Bài viết chuẩn SEO nên có ít nhất 1 - 2 thẻ Heading H2/H3 để chia nhỏ nội dung, tránh viết 1 khối văn bản đặc kín
    const h2h3Count = extracted.headingBlocks.filter(
      (b) => b.heading?.level === 2 || b.heading?.level === 3,
    ).length;
    const h1Count = extracted.headingBlocks.filter(
      (b) => b.heading?.level === 1,
    ).length;

    if (h2h3Count >= 2) {
      headingScore = 10;
      notes.push(
        `Bố cục bài viết tốt, sử dụng ${h2h3Count} tiêu đề phụ (H2/H3) để phân tách các phần nội dung.`,
      );
    } else if (h2h3Count === 1 || extracted.headingBlocks.length >= 1) {
      headingScore = 5;
      const msg =
        'Bài viết mới chỉ có 1 tiêu đề phụ (Heading). Nên chia nội dung thành ít nhất 2 - 3 mục H2/H3 (ví dụ: Giới thiệu nội dung, Điểm nổi bật, Đối tượng đọc giả).';
      notes.push(msg);
      weakPoints.push(msg);
      sectionFeedbacks.push({
        field: 'section',
        severity: 'WARNING',
        message: msg,
      });
    } else {
      headingScore = 0;
      const msg =
        'Bài viết chưa sử dụng khối tiêu đề phụ (Heading H2/H3) nào trong danh sách Section. Cần thêm các khối Heading để cấu trúc bài viết rõ ràng hơn cho cả người đọc và Google Bot.';
      notes.push(msg);
      weakPoints.push(msg);
      sectionFeedbacks.push({
        field: 'section',
        severity: 'FAILED',
        message: msg,
      });
    }

    // Cảnh báo phụ nếu lạm dụng nhiều thẻ H1 trong phần thân bài (vì tên sản phẩm trên trang đã là H1)
    if (h1Count > 1) {
      const h1Msg = `Phát hiện ${h1Count} khối Heading đang để cấp H1. Tên sách trên trang đã là thẻ H1 chính, các tiêu đề mục trong Section nên chuyển về H2 hoặc H3.`;
      weakPoints.push(h1Msg);
      extracted.headingBlocks
        .filter((b) => b.heading?.level === 1)
        .forEach((b) => {
          sectionFeedbacks.push({
            blockId: b.id,
            blockType: 'heading',
            field: 'section',
            severity: 'WARNING',
            message:
              'Không nên dùng nhiều thẻ H1 trong bài viết chi tiết, hãy đổi cấp độ khối này sang H2 hoặc H3.',
          });
        });
    }

    // Kiểm tra các đoạn văn (paragraph) quá dài (> 180 từ trong 1 block duy nhất) gây mỏi mắt khi đọc
    extracted.paragraphBlocks.forEach((pBlock) => {
      const pWords = this.countWords(pBlock.content || '');
      if (pWords > 180) {
        sectionFeedbacks.push({
          blockId: pBlock.id,
          blockType: 'paragraph',
          field: 'section',
          severity: 'WARNING',
          message: `Đoạn văn này khá dài (${pWords} từ). Nên tách thành 2 khối paragraph nhỏ hơn để độc giả dễ theo dõi.`,
        });
      }
    });

    // 3.2. Đánh giá tổng độ dài bài viết (Word Count - Tối đa 10 điểm)
    // Đối với trang chi tiết sản phẩm sách, độ dài từ 250 từ trở lên cung cấp đủ chiều sâu thông tin
    const wordCount = extracted.wordCount;
    if (wordCount >= 250) {
      wordCountScore = 10;
      notes.push(`Độ dài nội dung bài viết đạt chuẩn (${wordCount} từ).`);
    } else if (wordCount >= 120) {
      wordCountScore = 5;
      const msg = `Nội dung chi tiết hiện có ${wordCount} từ, hơi ngắn so với mức khuyến nghị (tối thiểu 250 từ). Hãy bổ sung thêm thông tin về nội dung sách hoặc trích dẫn nổi bật.`;
      notes.push(msg);
      weakPoints.push(msg);
      sectionFeedbacks.push({
        field: 'section',
        severity: 'WARNING',
        message: msg,
      });
    } else {
      wordCountScore = 0;
      const msg = `Nội dung bài viết quá ngắn (${wordCount} từ). Cần biên tập các khối Section đạt tối thiểu 250 từ để tránh lỗi Thin Content của Google.`;
      notes.push(msg);
      weakPoints.push(msg);
      sectionFeedbacks.push({
        field: 'section',
        severity: 'FAILED',
        message: msg,
      });
    }

    const score = headingScore + wordCountScore;
    return {
      score,
      maxScore,
      status: this.resolveCriterionStatus(score, maxScore),
      details: notes.join(' '),
      metrics: {
        totalSections: sections.length,
        headingCount: extracted.headingBlocks.length,
        h2h3Count,
        wordCount,
      },
    };
  }

  /**
   * Chấm điểm Tiêu chí 4: Phân bổ & Mật độ Từ khóa (Tối đa 15 điểm)
   * - Công thức mật độ từ khóa (Keyword Density):
   *   Density (%) = ((Số lần cụm từ khóa xuất hiện * Số từ trong cụm từ khóa) / Tổng số từ bài viết) * 100
   * - Kiểm tra vị trí xuất hiện (trong Heading phụ hoặc đoạn văn mở đầu)
   */
  private evaluateKeywordDistribution(
    focusKeyword: string,
    extracted: {
      fullPlainText: string;
      wordCount: number;
      headingBlocks: SectionBlock[];
      paragraphBlocks: SectionBlock[];
    },
    sectionFeedbacks: SeoSectionFeedback[],
    weakPoints: string[],
  ): SeoCriterionScore {
    const maxScore = 15;
    if (!focusKeyword || extracted.wordCount === 0) {
      const msg =
        'Chưa đủ dữ liệu văn bản hoặc từ khóa trọng tâm để tính toán mật độ phân bổ từ khóa.';
      weakPoints.push(msg);
      return {
        score: 0,
        maxScore,
        status: 'FAILED',
        details: msg,
        metrics: { occurrences: 0, densityPercent: 0 },
      };
    }

    const keywordWords = this.countWords(focusKeyword);
    const occurrences = this.countKeywordOccurrences(
      extracted.fullPlainText,
      focusKeyword,
    );

    // Tính tỷ lệ phần trăm từ khóa chiếm trong tổng số từ của bài viết
    const densityPercent = Number(
      (((occurrences * keywordWords) / extracted.wordCount) * 100).toFixed(2),
    );

    let densityScore = 0;
    let placementScore = 0;
    const notes: string[] = [];

    // 4.1. Chấm điểm mật độ từ khóa (Tối đa 10 điểm)
    if (densityPercent >= 0.8 && densityPercent <= 2.5) {
      densityScore = 10;
      notes.push(
        `Mật độ từ khóa "${focusKeyword}" đạt mức lý tưởng ${densityPercent}% (xuất hiện ${occurrences} lần / ${extracted.wordCount} từ).`,
      );
    } else if (
      (densityPercent >= 0.3 && densityPercent < 0.8) ||
      (densityPercent > 2.5 && densityPercent <= 3.5)
    ) {
      densityScore = 5;
      const msg =
        densityPercent < 0.8
          ? `Mật độ từ khóa hơi thấp (${densityPercent}%, xuất hiện ${occurrences} lần). Nên nhắc lại từ khóa "${focusKeyword}" thêm 1 - 2 lần một cách tự nhiên (mức lý tưởng 0.8% - 2.5%).`
          : `Mật độ từ khóa hơi cao (${densityPercent}%, xuất hiện ${occurrences} lần). Nên giảm bớt hoặc thay bằng từ đồng nghĩa để bài viết tự nhiên hơn.`;
      notes.push(msg);
      weakPoints.push(msg);
      sectionFeedbacks.push({
        field: 'keyword',
        severity: 'WARNING',
        message: msg,
      });
    } else {
      densityScore = 0;
      const msg =
        densityPercent < 0.3
          ? `Từ khóa "${focusKeyword}" xuất hiện quá ít trong bài viết (${occurrences} lần - ${densityPercent}%). Hãy bổ sung từ khóa vào các đoạn giới thiệu sách.`
          : `Cảnh báo nhồi nhét từ khóa (Keyword Stuffing): Mật độ lên tới ${densityPercent}% (${occurrences} lần). Cần lược bỏ bớt từ khóa lặp lại để tránh bị công cụ tìm kiếm đánh phạt.`;
      notes.push(msg);
      weakPoints.push(msg);
      sectionFeedbacks.push({
        field: 'keyword',
        severity: 'FAILED',
        message: msg,
      });
    }

    // 4.2. Chấm điểm vị trí đặt từ khóa (Tối đa 5 điểm)
    // Kiểm tra xem từ khóa có nằm ở đoạn paragraph đầu tiên hoặc trong ít nhất 1 thẻ Heading phụ hay không
    const kwLower = focusKeyword.toLowerCase();
    const inFirstParagraph =
      extracted.paragraphBlocks.length > 0 &&
      (extracted.paragraphBlocks[0].content || '')
        .toLowerCase()
        .includes(kwLower);
    const inAnyHeading = extracted.headingBlocks.some((h) =>
      (h.heading?.text || '').toLowerCase().includes(kwLower),
    );

    if (inFirstParagraph || inAnyHeading) {
      placementScore = 5;
      notes.push(
        'Từ khóa trọng tâm đã được đặt ở vị trí ưu tiên (đoạn mở đầu hoặc tiêu đề phụ Heading).',
      );
    } else {
      placementScore = 0;
      const msg = `Từ khóa "${focusKeyword}" chưa xuất hiện ở đoạn văn mở đầu hoặc trong các tiêu đề phụ (Heading). Nên đưa từ khóa vào ngay đoạn đầu tiên của bài viết.`;
      notes.push(msg);
      weakPoints.push(msg);
      sectionFeedbacks.push({
        blockId: extracted.paragraphBlocks[0]?.id,
        blockType: 'paragraph',
        field: 'keyword',
        severity: 'WARNING',
        message: msg,
      });
    }

    const score = densityScore + placementScore;
    return {
      score,
      maxScore,
      status: this.resolveCriterionStatus(score, maxScore),
      details: notes.join(' '),
      metrics: {
        occurrences,
        densityPercent,
        inFirstParagraph,
        inAnyHeading,
      },
    };
  }

  /**
   * Chấm điểm Tiêu chí 5: Tối ưu Đa phương tiện - Image Alt Text (Tối đa 15 điểm)
   * - Kiểm tra cả ảnh trong Album sản phẩm lẫn các khối ảnh (type === 'image') trong bài viết Section
   */
  private evaluateMediaOptimization(
    albumImages: { url?: string; altText?: string }[],
    sections: SectionBlock[],
    sectionFeedbacks: SeoSectionFeedback[],
    weakPoints: string[],
  ): SeoCriterionScore {
    const maxScore = 15;
    const sectionImageBlocks = sections.filter(
      (b) => b && b.type === 'image' && b.image?.url,
    );

    const totalImages = albumImages.length + sectionImageBlocks.length;

    if (totalImages === 0) {
      const msg =
        'Sản phẩm chưa có hình ảnh minh họa nào trong Album hoặc trong các khối Section. Cần bổ sung hình ảnh kèm thẻ mô tả Alt Text.';
      weakPoints.push(msg);
      sectionFeedbacks.push({
        field: 'image',
        severity: 'FAILED',
        message: msg,
      });
      return {
        score: 0,
        maxScore,
        status: 'FAILED',
        details: msg,
        metrics: { totalImages: 0, validAltCount: 0 },
      };
    }

    let validAltCount = 0;

    // Kiểm tra thẻ Alt của ảnh trong Album
    albumImages.forEach((img) => {
      if (img.altText && img.altText.trim().length >= 5) {
        validAltCount++;
      }
    });

    // Kiểm tra thẻ Alt của từng khối Image trong Section và gắn cảnh báo chính xác vào blockId nếu thiếu
    sectionImageBlocks.forEach((block) => {
      const alt = block.image?.altText?.trim() || '';
      if (alt.length >= 5) {
        validAltCount++;
      } else {
        sectionFeedbacks.push({
          blockId: block.id,
          blockType: 'image',
          field: 'image',
          severity: 'WARNING',
          message:
            'Khối hình ảnh này chưa có thẻ mô tả (altText) hoặc mô tả quá ngắn (< 5 ký tự). Hãy bổ sung mô tả ảnh chứa tên sách.',
        });
      }
    });

    // Tính điểm tỷ lệ thuận với số lượng ảnh có đầy đủ thẻ Alt
    const ratio = validAltCount / totalImages;
    const score = Math.round(ratio * maxScore);
    const missingCount = totalImages - validAltCount;

    let details = '';
    if (missingCount === 0) {
      details = `Tất cả ${totalImages}/${totalImages} hình ảnh (Album & Section) đều đã có thẻ mô tả Alt Text đầy đủ.`;
    } else {
      details = `Có ${validAltCount}/${totalImages} hình ảnh đạt chuẩn Alt Text (còn ${missingCount} ảnh thiếu mô tả). Cần bổ sung đầy đủ thẻ Alt để tối ưu Google Image Search.`;
      weakPoints.push(details);
    }

    return {
      score,
      maxScore,
      status: this.resolveCriterionStatus(score, maxScore),
      details,
      metrics: {
        totalImages,
        albumImageCount: albumImages.length,
        sectionImageCount: sectionImageBlocks.length,
        validAltCount,
        missingAltCount: missingCount,
      },
    };
  }

  /**
   * Chấm điểm Tiêu chí 6: Độ tương đồng Ngữ nghĩa bằng Vector MiniLM (Tối đa 15 điểm)
   * - Đo lường mức độ nhất quán về mặt ý nghĩa giữa (Tiêu đề + Mô tả ngắn) và (Nội dung chi tiết trong Sections)
   */
  private async evaluateSemanticRelevance(
    title: string,
    shortDescribe: string,
    fullPlainText: string,
    sectionFeedbacks: SeoSectionFeedback[],
    weakPoints: string[],
  ): Promise<SeoCriterionScore> {
    const maxScore = 15;
    const coreTopicText = `${title}. ${shortDescribe}`.trim();
    const bodySnippet = fullPlainText.slice(0, 2000).trim();

    if (!coreTopicText || bodySnippet.length < 30) {
      const msg =
        'Nội dung bài viết còn quá ngắn để mô hình Vector AI đánh giá độ tương đồng ngữ nghĩa với tiêu đề.';
      weakPoints.push(msg);
      return {
        score: 0,
        maxScore,
        status: 'FAILED',
        details: msg,
        metrics: { cosineSimilarity: 0 },
      };
    }

    try {
      const [topicVector, bodyVector] = await Promise.all([
        this.aiService.generateEmbedding(coreTopicText),
        this.aiService.generateEmbedding(bodySnippet),
      ]);

      const similarity = this.aiService.computeCosineSimilarity(
        topicVector,
        bodyVector,
      );

      if (similarity >= 0.6) {
        return {
          score: 15,
          maxScore,
          status: 'PASSED',
          details: `Độ tương đồng ngữ nghĩa đạt mức cao (Cosine Similarity = ${similarity}). Nội dung các khối Section bám sát chủ đề tiêu đề và mô tả ngắn.`,
          metrics: { cosineSimilarity: similarity },
        };
      }

      if (similarity >= 0.45) {
        const msg = `Độ tương đồng ngữ nghĩa ở mức trung bình (Cosine Similarity = ${similarity}). Nội dung chi tiết có liên quan nhưng còn hơi dàn trải, nên tập trung làm rõ hơn chủ đề chính của sách.`;
        weakPoints.push(msg);
        sectionFeedbacks.push({
          field: 'semantic',
          severity: 'WARNING',
          message: msg,
        });
        return {
          score: 8,
          maxScore,
          status: 'WARNING',
          details: msg,
          metrics: { cosineSimilarity: similarity },
        };
      }

      const msg = `Độ tương đồng ngữ nghĩa thấp (Cosine Similarity = ${similarity}). Nội dung bài viết trong các khối Section đang lệch trọng tâm so với tiêu đề và mô tả ngắn (shortDescribe).`;
      weakPoints.push(msg);
      sectionFeedbacks.push({
        field: 'semantic',
        severity: 'FAILED',
        message: msg,
      });
      return {
        score: 0,
        maxScore,
        status: 'FAILED',
        details: msg,
        metrics: { cosineSimilarity: similarity },
      };
    } catch (error: any) {
      this.logger.warn(
        `Không thể tính toán Vector Similarity cho SEO Audit: ${error?.message || error}`,
      );
      return {
        score: 10,
        maxScore,
        status: 'WARNING',
        details:
          'Tạm thời bỏ qua bước đối chiếu Vector ngữ nghĩa do mô hình nhúng chưa sẵn sàng.',
        metrics: { cosineSimilarity: null },
      };
    }
  }

  // ===========================================================================
  // CÁC HÀM TIỆN ÍCH BÓC TÁCH VÀ XỬ LÝ VĂN BẢN
  // ===========================================================================

  /**
   * Trích xuất toàn bộ văn bản thuần (Plain Text) và phân loại các khối từ mảng SectionBlock[]
   */
  private extractContentFromSections(
    sections: SectionBlock[],
    fallbackDescribe: string,
  ) {
    const headingBlocks: SectionBlock[] = [];
    const paragraphBlocks: SectionBlock[] = [];
    const textParts: string[] = [];

    if (sections && sections.length > 0) {
      sections.forEach((block) => {
        if (!block) return;

        if (block.type === 'heading' && block.heading?.text) {
          headingBlocks.push(block);
          textParts.push(block.heading.text);
        } else if (block.type === 'paragraph' && block.content) {
          paragraphBlocks.push(block);
          textParts.push(block.content);
        } else if (block.type === 'quote' && block.content) {
          textParts.push(block.content);
        } else if (block.type === 'list' && Array.isArray(block.list?.items)) {
          textParts.push(block.list.items.join(' '));
        }
      });
    } else if (fallbackDescribe) {
      // Tương thích ngược với các sản phẩm cũ chỉ mới lưu trong cột describe
      const cleanFallback = fallbackDescribe.replace(/<[^>]+>/g, ' ');
      textParts.push(cleanFallback);
    }

    const fullPlainText = textParts.join(' ').replace(/\s+/g, ' ').trim();
    const wordCount = this.countWords(fullPlainText);

    return {
      fullPlainText,
      wordCount,
      headingBlocks,
      paragraphBlocks,
    };
  }

  /**
   * Đếm tổng số từ trong một chuỗi văn bản tiếng Việt / tiếng Anh
   */
  private countWords(text: string): number {
    if (!text || !text.trim()) return 0;
    return text
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }

  /**
   * Đếm số lần xuất hiện của cụm từ khóa trọng tâm trong văn bản (không phân biệt hoa thường)
   */
  private countKeywordOccurrences(text: string, keyword: string): number {
    if (!text || !keyword) return 0;
    const escaped = keyword
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escaped) return 0;
    const regex = new RegExp(escaped, 'gi');
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  }

  /**
   * Tự động xác định từ khóa trọng tâm nếu Admin để trống
   */
  private resolveFocusKeyword(
    inputKeyword: string | undefined,
    title: string,
  ): string {
    if (inputKeyword && inputKeyword.trim()) {
      return inputKeyword.trim();
    }
    // Lấy phần tên chính trước dấu gạch ngang hoặc dấu hai chấm trong tiêu đề sách
    const primarySegment = title.split(/[-–—:|]/)[0].trim();
    return primarySegment || title;
  }

  /**
   * Quy đổi điểm của từng tiêu chí sang trạng thái PASSED / WARNING / FAILED
   */
  private resolveCriterionStatus(
    score: number,
    maxScore: number,
  ): 'PASSED' | 'WARNING' | 'FAILED' {
    const ratio = score / maxScore;
    if (ratio >= 0.8) return 'PASSED';
    if (ratio >= 0.4) return 'WARNING';
    return 'FAILED';
  }

  /**
   * Xếp hạng tổng điểm SEO theo thang 100
   */
  private determineGrade(totalScore: number): SeoGrade {
    if (totalScore >= 85) return 'EXCELLENT';
    if (totalScore >= 70) return 'GOOD';
    if (totalScore >= 50) return 'AVERAGE';
    return 'POOR';
  }

  /**
   * Tạo nhận xét tổng quan dựa trên điểm số và xếp hạng
   */
  private buildOverallSummary(totalScore: number, grade: SeoGrade): string {
    switch (grade) {
      case 'EXCELLENT':
        return `Điểm SEO đạt mức Tốt (${totalScore}/100). Cấu trúc Section, từ khóa và ngữ nghĩa bài viết đã được tối ưu đồng bộ.`;
      case 'GOOD':
        return `Điểm SEO đạt mức Khá (${totalScore}/100). Bài viết đã đáp ứng phần lớn tiêu chí, chỉ cần tinh chỉnh nhẹ theo các gợi ý bên dưới.`;
      case 'AVERAGE':
        return `Điểm SEO ở mức Trung bình (${totalScore}/100). Cần bổ sung thêm nội dung Section, tiêu đề phụ hoặc cải thiện mật độ từ khóa.`;
      default:
        return `Điểm SEO còn thấp (${totalScore}/100). Bài viết thiếu nhiều yếu tố quan trọng (mô tả ngắn, cấu trúc Section hoặc từ khóa trọng tâm).`;
    }
  }
}
