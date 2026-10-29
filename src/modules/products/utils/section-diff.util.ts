import { SectionBlock, SectionBlockDiff, ConflictDiffResponse } from '../interfaces/section.interface';

export class SectionDiffUtil {
  /**
   * So sánh đối chiếu 2 mảng Section:
   * - serverSections: Bản mới nhất dưới Database (do người khác vừa lưu)
   * - clientSections: Bản Draft mà client đang sửa và gửi lên
   */
  static computeDiff(
    serverSections: (SectionBlock | Record<string, any>)[] = [],
    clientSections: (SectionBlock | Record<string, any>)[] = [],
    metadata: {
      currentVersion: number;
      expectedVersion?: number;
      lastModifiedBy?: string;
      lastModifiedAt?: Date;
    },
  ): ConflictDiffResponse {
    const diffDetails: SectionBlockDiff[] = [];
    const serverMap = new Map<string, { block: SectionBlock; index: number }>();
    const clientMap = new Map<string, { block: SectionBlock; index: number }>();

    // 1. Lập chỉ mục theo ID của block (nếu không có ID thì dùng fallback theo index)
    serverSections.forEach((rawBlock, index) => {
      const block = rawBlock as SectionBlock;
      const id = block.id || `server-idx-${index}`;
      serverMap.set(id, { block, index });
    });

    clientSections.forEach((rawBlock, index) => {
      const block = rawBlock as SectionBlock;
      const id = block.id || `client-idx-${index}`;
      clientMap.set(id, { block, index });
    });

    let unchangedCount = 0;
    let modifiedCount = 0;
    let addedCount = 0;
    let removedCount = 0;

    // 2. Duyệt qua server blocks để phát hiện UNCHANGED, MODIFIED hoặc REMOVED (Client đã xóa)
    serverMap.forEach(({ block: sBlock }, id) => {
      if (clientMap.has(id)) {
        const { block: cBlock } = clientMap.get(id)!;
        const differences = this.compareBlocks(sBlock, cBlock);

        if (differences.length === 0) {
          unchangedCount++;
          diffDetails.push({
            blockId: id,
            type: sBlock.type,
            status: 'UNCHANGED',
            serverVersion: sBlock,
            clientVersion: cBlock,
          });
        } else {
          modifiedCount++;
          diffDetails.push({
            blockId: id,
            type: sBlock.type,
            status: 'MODIFIED',
            differences,
            serverVersion: sBlock,
            clientVersion: cBlock,
          });
        }
      } else {
        // Có trên server nhưng không có trong client payload -> Client đã xóa
        removedCount++;
        diffDetails.push({
          blockId: id,
          type: sBlock.type,
          status: 'REMOVED',
          differences: ['Khối nội dung này đã bị xóa ở bản nháp của bạn nhưng vẫn tồn tại trên server'],
          serverVersion: sBlock,
        });
      }
    });

    // 3. Duyệt qua client blocks để phát hiện ADDED (Client mới thêm vào)
    clientMap.forEach(({ block: cBlock }, id) => {
      if (!serverMap.has(id)) {
        addedCount++;
        diffDetails.push({
          blockId: id,
          type: cBlock.type,
          status: 'ADDED',
          differences: ['Khối nội dung mới do bạn tạo thêm'],
          clientVersion: cBlock,
        });
      }
    });

    return {
      currentVersion: metadata.currentVersion,
      expectedVersion: metadata.expectedVersion,
      lastModifiedBy: metadata.lastModifiedBy,
      lastModifiedAt: metadata.lastModifiedAt,
      diffSummary: {
        totalBlocks: diffDetails.length,
        unchangedCount,
        modifiedCount,
        addedCount,
        removedCount,
      },
      diffDetails,
    };
  }

  /**
   * So sánh nội dung chi tiết giữa 2 block cùng ID
   */
  private static compareBlocks(a: SectionBlock, b: SectionBlock): string[] {
    const diffs: string[] = [];

    if (a.type !== b.type) {
      diffs.push(`Kiểu khối thay đổi từ '${a.type}' sang '${b.type}'`);
    }

    if (a.content !== b.content) {
      diffs.push('Nội dung văn bản (content) khác nhau');
    }

    // So sánh Heading
    if (a.heading || b.heading) {
      if (a.heading?.level !== b.heading?.level) {
        diffs.push(`Cấp độ Heading đổi từ H${a.heading?.level} sang H${b.heading?.level}`);
      }
      if (a.heading?.text !== b.heading?.text) {
        diffs.push('Tiêu đề Heading khác nhau');
      }
    }

    // So sánh Image
    if (a.image || b.image) {
      if (a.image?.url !== b.image?.url) {
        diffs.push('Đường dẫn hình ảnh (url) khác nhau');
      }
      if (a.image?.altText !== b.image?.altText) {
        diffs.push('Thẻ mô tả hình ảnh (altText) khác nhau');
      }
    }

    // So sánh Video
    if (a.video || b.video) {
      if (a.video?.url !== b.video?.url) {
        diffs.push('Đường dẫn video khác nhau');
      }
    }

    // So sánh List items
    if (a.list || b.list) {
      const aItems = a.list?.items || [];
      const bItems = b.list?.items || [];
      if (JSON.stringify(aItems) !== JSON.stringify(bItems)) {
        diffs.push('Danh sách phần tử (list items) khác nhau');
      }
    }

    return diffs;
  }
}
