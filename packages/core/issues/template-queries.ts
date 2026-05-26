import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const issueTemplateKeys = {
  all: (wsId: string) => ["issue-templates", wsId] as const,
  list: (wsId: string) => [...issueTemplateKeys.all(wsId), "list"] as const,
  detail: (wsId: string, id: string) => [...issueTemplateKeys.all(wsId), id] as const,
};

export const issueTemplateListOptions = (wsId: string) =>
  queryOptions({
    queryKey: issueTemplateKeys.list(wsId),
    queryFn: () => api.listIssueTemplates(),
    enabled: !!wsId,
  });

export const issueTemplateDetailOptions = (wsId: string, id: string) =>
  queryOptions({
    queryKey: issueTemplateKeys.detail(wsId, id),
    queryFn: () => api.getIssueTemplate(id),
    enabled: !!wsId && !!id,
  });
