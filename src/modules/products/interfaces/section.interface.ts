export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'video'
  | 'quote'
  | 'list';

export interface BlockStyle {
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  textColor?: string;
  backgroundColor?: string;
  isBold?: boolean;
  isItalic?: boolean;
}

export interface SectionBlock {
  id?: string;
  order?: number;
  type: BlockType;
  style?: BlockStyle;
  heading?: {
    level: 1 | 2 | 3 | 4;
    text: string;
  };
  content?: string;
  image?: {
    mediaId?: string;
    url: string;
    altText?: string;
    caption?: string;
    width?: number;
    height?: number;
  };
  video?: {
    provider?: 'youtube' | 'direct';
    url: string;
    caption?: string;
  };
  list?: {
    format?: 'ordered' | 'unordered';
    items: string[];
  };
}

export type DiffStatus = 'UNCHANGED' | 'MODIFIED' | 'ADDED' | 'REMOVED';

export interface SectionBlockDiff {
  blockId: string;
  type: string;
  status: DiffStatus;
  differences?: string[];
  serverVersion?: any;
  clientVersion?: any;
}

export interface ConflictDiffResponse {
  currentVersion: number;
  expectedVersion?: number;
  lastModifiedBy?: string;
  lastModifiedAt?: Date;
  diffSummary: {
    totalBlocks: number;
    unchangedCount: number;
    modifiedCount: number;
    addedCount: number;
    removedCount: number;
  };
  diffDetails: SectionBlockDiff[];
}
