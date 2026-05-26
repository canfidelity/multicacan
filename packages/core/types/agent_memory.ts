export interface AgentMemory {
  id: string;
  agent_id: string;
  workspace_id: string;
  key: string;
  value: string;
  description: string;
  issue_id: string | null;
  created_at: string;
  updated_at: string;
}
