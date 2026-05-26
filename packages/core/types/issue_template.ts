export interface IssueTemplate {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  default_status: string | null;
  default_priority: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateIssueTemplateRequest {
  name: string;
  description?: string;
  default_status?: string;
  default_priority?: string;
}

export interface UpdateIssueTemplateRequest {
  name?: string;
  description?: string;
  default_status?: string;
  default_priority?: string;
}
