export interface DocumentManifestItem {
  slot_id: number;
  title: string;
  url: string;
  version: number;
  file_hash: string;
  file_size: number;
  upload_date: string;
}

export interface DocumentRevision {
  id: number;
  slot_id: number;
  title: string;
  filename: string;
  original_filename: string;
  file_hash: string;
  file_size: number;
  version: number;
  is_live: boolean;
  upload_date: string;
  obsolescence_date?: string | null;
  url: string;
}

export interface SlotSummary {
  slot_id: number;
  live_document?: DocumentRevision | null;
  total_revisions: number;
  total_feedback: number;
  open_feedback: number;
}

export interface FeedbackItem {
  id: string;
  station_id: string;
  slot_id: number;
  document_id?: number | null;
  page_ref: number;
  section_ref?: string | null;
  pin_x?: number | null;
  pin_y?: number | null;
  author: string;
  text_comment?: string | null;
  video_filename?: string | null;
  video_url?: string | null;
  photo_filenames: string[];
  photo_urls: string[];
  timestamp: string;
  status: 'open' | 'reviewed' | 'resolved';
}

export interface QueuedFeedback {
  id: string;
  station_id: string;
  slot_id: number;
  page_ref: number;
  section_ref?: string;
  pin_x?: number;
  pin_y?: number;
  author: string;
  text_comment?: string;
  videoBlob?: Blob;
  videoName?: string;
  photoBlobs: { blob: Blob; name: string }[];
  timestamp: string;
  status: 'pending';
}

export interface PdfPin {
  id: string;
  pageNumber: number;
  x: number; // 0 to 100 percentage
  y: number; // 0 to 100 percentage
  author?: string;
  comment?: string;
  sectionRef?: string;
  stationId?: string;
  timestamp?: string;
  status?: 'open' | 'reviewed' | 'resolved';
  photoUrls?: string[];
  videoUrl?: string;
  videoFilename?: string;
  isDraft?: boolean;
}

