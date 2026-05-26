import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const agentMemoriesOptions = (wsId: string, agentId: string) =>
  queryOptions({
    queryKey: ['agents', wsId, 'memories', agentId],
    queryFn: () => api.listAgentMemories(agentId),
  });
