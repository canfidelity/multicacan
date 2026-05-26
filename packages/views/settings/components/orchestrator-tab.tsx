"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceId } from "@multicacan/core/hooks";
import { useWorkspacePaths } from "@multicacan/core/paths";
import { autopilotListOptions, autopilotKeys } from "@multicacan/core/autopilots/queries";
import { api } from "@multicacan/core/api";
import { Button } from "@multicacan/ui/components/ui/button";
import { Card, CardContent } from "@multicacan/ui/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@multicacan/ui/components/ui/empty";
import { ActorAvatar } from "../../common/actor-avatar";
import { AppLink } from "../../navigation";
import { useT } from "../../i18n";

function formatDate(date: string): string {
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OrchestratorTab() {
  const { t } = useT("settings");
  const wsId = useWorkspaceId();
  const wsPaths = useWorkspacePaths();
  const qc = useQueryClient();

  const { data: autopilots = [], isLoading } = useQuery(autopilotListOptions(wsId));
  const orchestrator = autopilots.find((a) => a.is_orchestrator) ?? null;

  const disableMutation = useMutation({
    mutationFn: (id: string) =>
      api.updateAutopilot(id, { is_orchestrator: false } as Parameters<typeof api.updateAutopilot>[1]),
    onSuccess: () => {
      toast.success(t(($) => $.orchestrator.disable));
      qc.invalidateQueries({ queryKey: autopilotKeys.list(wsId) });
    },
    onError: (err) => {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to disable orchestrator");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">{t(($) => $.orchestrator.title)}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t(($) => $.orchestrator.description)}</p>
      </div>

      {orchestrator === null ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bot className="h-4 w-4" />
            </EmptyMedia>
            <EmptyTitle>{t(($) => $.orchestrator.none_title)}</EmptyTitle>
            <EmptyDescription>{t(($) => $.orchestrator.none_description)}</EmptyDescription>
          </EmptyHeader>
          <AppLink href={wsPaths.autopilots()}>
            <Button size="sm" className="mt-2">
              {t(($) => $.orchestrator.setup_cta)}
            </Button>
          </AppLink>
        </Empty>
      ) : (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t(($) => $.orchestrator.current_title)}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <ActorAvatar
                  actorType={orchestrator.assignee_type}
                  actorId={orchestrator.assignee_id}
                  size={28}
                  showStatusDot={orchestrator.assignee_type === "agent"}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{orchestrator.title}</p>
                  {orchestrator.last_run_at && (
                    <p className="text-xs text-muted-foreground">
                      Last run: {formatDate(orchestrator.last_run_at)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <AppLink href={wsPaths.autopilotDetail(orchestrator.id)}>
                  <Button size="sm" variant="outline">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    {t(($) => $.orchestrator.edit)}
                  </Button>
                </AppLink>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={disableMutation.isPending}
                  onClick={() => disableMutation.mutate(orchestrator.id)}
                >
                  {disableMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : null}
                  {t(($) => $.orchestrator.disable)}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
