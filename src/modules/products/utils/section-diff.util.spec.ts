import { SectionDiffUtil } from './section-diff.util';
import { SectionBlock } from '../interfaces/section.interface';

describe('SectionDiffUtil - Kiểm thử đối chiếu xung đột phiên bản Section trên Server', () => {
  it('phải phân loại chính xác các trạng thái UNCHANGED, MODIFIED, REMOVED và ADDED', () => {
    const serverSections: SectionBlock[] = [
      {
        id: 'sec-1',
        type: 'heading',
        heading: { level: 2, text: 'Giới thiệu chung' },
      },
      {
        id: 'sec-2',
        type: 'paragraph',
        content: 'Nội dung do Admin A đã lưu trên Server.',
      },
      {
        id: 'sec-3',
        type: 'image',
        image: { url: '/uploads/products/a.jpg', altText: 'Ảnh A' },
      },
    ];

    const clientSections: SectionBlock[] = [
      {
        id: 'sec-1',
        type: 'heading',
        heading: { level: 2, text: 'Giới thiệu chung' },
      },
      {
        id: 'sec-2',
        type: 'paragraph',
        content: 'Nội dung do Admin B đang sửa ở trình duyệt.',
      },
      {
        id: 'sec-4',
        type: 'quote',
        content: 'Câu trích dẫn mới do Admin B thêm vào.',
      },
    ];

    const diff = SectionDiffUtil.computeDiff(serverSections, clientSections, {
      currentVersion: 3,
      expectedVersion: 2,
      lastModifiedBy: 'admin-a-id',
    });

    expect(diff.currentVersion).toBe(3);
    expect(diff.expectedVersion).toBe(2);
    expect(diff.lastModifiedBy).toBe('admin-a-id');
    expect(diff.diffSummary).toEqual({
      totalBlocks: 4,
      unchangedCount: 1,
      modifiedCount: 1,
      addedCount: 1,
      removedCount: 1,
    });

    const byId = Object.fromEntries(
      diff.diffDetails.map((item) => [item.blockId, item]),
    );
    expect(byId['sec-1'].status).toBe('UNCHANGED');
    expect(byId['sec-2'].status).toBe('MODIFIED');
    expect(byId['sec-2'].differences).toContain(
      'Nội dung văn bản (content) khác nhau',
    );
    expect(byId['sec-3'].status).toBe('REMOVED');
    expect(byId['sec-4'].status).toBe('ADDED');
  });

  it('phải phát hiện chi tiết thay đổi ở cấp độ Heading, Image altText và List items', () => {
    const serverSections: SectionBlock[] = [
      {
        id: 'h-1',
        type: 'heading',
        heading: { level: 2, text: 'Tiêu đề cũ' },
      },
      {
        id: 'img-1',
        type: 'image',
        image: { url: '/uploads/1.png', altText: 'Mô tả cũ' },
      },
      {
        id: 'lst-1',
        type: 'list',
        list: { format: 'unordered', items: ['Mục 1', 'Mục 2'] },
      },
    ];

    const clientSections: SectionBlock[] = [
      {
        id: 'h-1',
        type: 'heading',
        heading: { level: 3, text: 'Tiêu đề mới' },
      },
      {
        id: 'img-1',
        type: 'image',
        image: { url: '/uploads/1.png', altText: 'Mô tả mới' },
      },
      {
        id: 'lst-1',
        type: 'list',
        list: { format: 'unordered', items: ['Mục 1', 'Mục 2 cập nhật'] },
      },
    ];

    const diff = SectionDiffUtil.computeDiff(serverSections, clientSections, {
      currentVersion: 2,
      expectedVersion: 1,
    });

    expect(diff.diffSummary.modifiedCount).toBe(3);
    expect(diff.diffDetails[0].differences).toEqual([
      'Cấp độ Heading đổi từ H2 sang H3',
      'Tiêu đề Heading khác nhau',
    ]);
    expect(diff.diffDetails[1].differences).toEqual([
      'Thẻ mô tả hình ảnh (altText) khác nhau',
    ]);
    expect(diff.diffDetails[2].differences).toEqual([
      'Danh sách phần tử (list items) khác nhau',
    ]);
  });
});
