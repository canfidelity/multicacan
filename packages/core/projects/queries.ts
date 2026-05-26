import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const projectKeys = {
  all: (wsId: string) => ["projects", wsId] as const,
  list: (wsId: string) => [...projectKeys.all(wsId), "list"] as const,
  detail: (wsId: string, id: string) =>
    [...projectKeys.all(wsId), "detail", id] as const,
};

export function projectListOptions(wsId: string) {
  return queryOptions({
    queryKey: projectKeys.list(wsId),
    queryFn: () => api.listProjects(),
    select: (data) => data.projects,
  });
}

export function projectDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: projectKeys.detail(wsId, id),
    queryFn: () => api.getProject(id),
  });
}

export const projectSquadsOptions = (wsId: string, projectId: string) =>
  queryOptions({
    queryKey: [...projectKeys.detail(wsId, projectId), 'squads'],
    queryFn: () => api.listProjectSquads(projectId),
  });

export const squadProjectsOptions = (wsId: string, squadId: string) =>
  queryOptions({
    queryKey: ['squads', wsId, 'projects', squadId],
    queryFn: () => api.listProjectsForSquad(squadId),
  });

export const projectMilestonesOptions = (wsId: string, projectId: string) =>
  queryOptions({
    queryKey: [...projectKeys.detail(wsId, projectId), 'milestones'],
    queryFn: () => api.listProjectMilestones(projectId),
  });
