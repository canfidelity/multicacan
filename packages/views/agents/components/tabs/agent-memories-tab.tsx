"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Agent, AgentMemory } from "@multicacan/core/types";
import { agentMemoriesOptions } from "@multicacan/core/agents/memory-queries";
import { api } from "@multicacan/core/api";
import { useWorkspaceId } from "@multicacan/core/hooks";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@multicacan/ui/components/ui/tooltip";
import { useT, useTimeAgo } from "../../../i18n";

const VALUE_TRUNCATE = 80;

interface AgentMemoriesTabProps {
  agent: Agent;
}

export function AgentMemoriesTab({ agent }: AgentMemoriesTabProps) {
  const { t } = useT("agents");
  const timeAgo = useTimeAgo();
  const wsId = useWorkspaceId();
  const qc = useQueryClient();

  const { data: memories = [], isLoading } = useQuery(
    agentMemoriesOptions(wsId, agent.id),
  );

  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(() => new Set());

  const handleDelete = async (memory: AgentMemory) => {
    if (deletingKeys.has(memory.key)) return;
    setDeletingKeys((prev) => new Set([...prev, memory.key]));
    try {
      await api.deleteAgentMemory(agent.id, memory.key);
      await qc.invalidateQueries({
        queryKey: agentMemoriesOptions(wsId, agent.id).queryKey,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete memory");
    } finally {
      setDeletingKeys((prev) => {
        const next = new Set(prev);
        next.delete(memory.key);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-xs text-muted-foreground">
        <span>Loading…</span>
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <p className="py-8 text-center text-xs italic text-muted-foreground/60">
        {t(($) => $.memories_empty)}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Key</th>
            <th className="pb-2 pr-4 font-medium">Value</th>
            <th className="pb-2 pr-4 font-medium">Description</th>
            <th className="pb-2 pr-4 font-medium whitespace-nowrap">Last Updated</th>
            <th className="pb-2 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {memories.map((mem) => {
            const truncatedValue =
              mem.value.length > VALUE_TRUNCATE
                ? `${mem.value.slice(0, VALUE_TRUNCATE)}…`
                : mem.value;
            const isDeleting = deletingKeys.has(mem.key);
            return (
              <tr
                key={mem.key}
                className={`group align-top transition-opacity ${isDeleting ? "opacity-50" : ""}`}
              >
                <td className="py-2 pr-4 font-mono font-medium text-foreground whitespace-nowrap">
                  {mem.key}
                </td>
                <td className="py-2 pr-4 text-muted-foreground max-w-[200px]">
                  {mem.value.length > VALUE_TRUNCATE ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className="cursor-default">{truncatedValue}</span>
                        }
                      />
                      <TooltipContent className="max-w-sm whitespace-pre-wrap break-all text-xs">
                        {mem.value}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span>{truncatedValue}</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-muted-foreground max-w-[180px]">
                  <span className="line-clamp-2">{mem.description || "—"}</span>
                </td>
                <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                  {timeAgo(mem.updated_at)}
                </td>
                <td className="py-2">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => handleDelete(mem)}
                          disabled={isDeleting}
                          aria-label={`Delete memory ${mem.key}`}
                        />
                      }
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </TooltipTrigger>
                    <TooltipContent>Delete</TooltipContent>
                  </Tooltip>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
