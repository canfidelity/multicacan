export interface OutboundWebhook {
  id: string;
  workspace_id: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface OutboundWebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  status: "pending" | "delivered" | "failed";
  status_code: number | null;
  error: string | null;
  attempt: number;
  created_at: string;
  delivered_at: string | null;
}

export interface CreateOutboundWebhookRequest {
  url: string;
  events: string[];
  secret?: string;
}

export interface UpdateOutboundWebhookRequest {
  url?: string;
  events?: string[];
  secret?: string;
  is_active?: boolean;
}

export const OUTBOUND_WEBHOOK_EVENTS = [
  "issue.created",
  "issue.updated",
  "issue.status_changed",
  "comment.created",
  "task.completed",
  "task.failed",
] as const;

export type OutboundWebhookEvent = (typeof OUTBOUND_WEBHOOK_EVENTS)[number];
