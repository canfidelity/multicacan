import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const outboundWebhookKeys = {
  all: (wsId: string) => ["outbound-webhooks", wsId] as const,
  list: (wsId: string) => [...outboundWebhookKeys.all(wsId), "list"] as const,
  deliveries: (wsId: string, id: string) =>
    [...outboundWebhookKeys.all(wsId), id, "deliveries"] as const,
};

export const outboundWebhookListOptions = (wsId: string) =>
  queryOptions({
    queryKey: outboundWebhookKeys.list(wsId),
    queryFn: () => api.listOutboundWebhooks(),
    enabled: !!wsId,
  });

export const outboundWebhookDeliveriesOptions = (wsId: string, id: string) =>
  queryOptions({
    queryKey: outboundWebhookKeys.deliveries(wsId, id),
    queryFn: () => api.listOutboundWebhookDeliveries(id, { limit: 50 }),
    enabled: !!wsId && !!id,
  });
