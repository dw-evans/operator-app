export interface QualityIssue {
  id: number;
  part_id: number;
  part_batch_id: number | null;
  part_name: string;
  common_name: string | null;
  part_number: string;
  revision: string;
  iteration: string;
  batch_number: string;
  batch_code: string | null;
  subassembly: string | null;
  category: string | null;
  description: string;
  photo_filenames: string[];
  photo_urls: string[];
  operator: string;
  created_at: string;
  updated_at: string;
}
