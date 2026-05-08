export interface WorkspaceAsset {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  tags: string[];
  url: string;
  download_url: string;
  content_type: string;
  size_bytes: number;
  uploaded_by_type: string;
  uploaded_by_id: string;
  created_at: string;
}
