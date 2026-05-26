"use client";

import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "../../i18n";
import { projectMilestonesOptions } from "@multicacan/core/projects/queries";
import {
  useCreateProjectMilestone,
  useDeleteProjectMilestone,
  useSetProjectExecution,
} from "@multicacan/core/projects/mutations";
import type { Project, ProjectMilestone, MilestoneStatus, ProjectExecutionStatus } from "@multicacan/core/types";
import { cn } from "@multicacan/ui/lib/utils";
import { useNavigation } from "../../navigation";
import { useWorkspacePaths } from "@multicacan/core/paths";
import { ChevronRight, Plus, Trash2, Play, Pause, Square, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Button } from "@multicacan/ui/components/ui/button";

interface Props {
  wsId: string;
  project: Project;
}

const MILESTONE_STATUS_ICON: Record<MilestoneStatus, React.ReactNode> = {
  todo: <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />,
  in_progress: <Loader2 className="h-3.5 w-3.5 text-blue-500 shrink-0 animate-spin" />,
  done: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />,
};

export function ProjectRoadmapSection({ wsId, project }: Props) {
  const { t } = useT("projects");
  const { push } = useNavigation();
  const wsPaths = useWorkspacePaths();
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: milestones = [] } = useQuery(projectMilestonesOptions(wsId, project.id));
  const createMilestone = useCreateProjectMilestone(wsId, project.id);
  const deleteMilestone = useDeleteProjectMilestone(wsId, project.id);
  const setExecution = useSetProjectExecution(wsId, project.id);

  const execStatus: ProjectExecutionStatus = project.execution_status ?? "idle";

  function handleAddMilestone() {
    const title = newTitle.trim();
    if (!title) return;
    createMilestone.mutate({ title }, {
      onSuccess: () => {
        setNewTitle("");
        setAdding(false);
      },
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleAddMilestone();
    if (e.key === "Escape") { setAdding(false); setNewTitle(""); }
  }

  const execLabel = (() => {
    switch (execStatus) {
      case "running": return t(($) => $.roadmap.status_running);
      case "paused": return t(($) => $.roadmap.status_paused);
      case "stopped": return t(($) => $.roadmap.status_stopped);
      case "completed": return t(($) => $.roadmap.status_completed);
      default: return t(($) => $.roadmap.status_idle);
    }
  })();

  const execDot = (() => {
    switch (execStatus) {
      case "running": return "bg-emerald-500";
      case "paused": return "bg-amber-400";
      case "stopped": return "bg-red-400";
      case "completed": return "bg-emerald-600";
      default: return "bg-muted-foreground/40";
    }
  })();

  return (
    <div>
      <button
        className={`flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors mb-2 hover:bg-accent/70 ${open ? "" : "text-muted-foreground hover:text-foreground"}`}
        onClick={() => setOpen(!open)}
      >
        {t(($) => $.roadmap.section_title)}
        <span className={cn("ml-1 size-1.5 rounded-full", execDot)} title={execLabel} />
        <ChevronRight className={`!size-3 shrink-0 stroke-[2.5] text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="pl-2 space-y-2">
          {/* Execution controls */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground">{execLabel}</span>
            {execStatus === "idle" || execStatus === "stopped" ? (
              <Button
                size="xs"
                variant="outline"
                className="h-5 px-1.5 text-xs gap-1"
                disabled={setExecution.isPending}
                onClick={() => setExecution.mutate("running")}
              >
                <Play className="h-2.5 w-2.5" />
                {t(($) => $.roadmap.start)}
              </Button>
            ) : execStatus === "running" ? (
              <>
                <Button size="xs" variant="outline" className="h-5 px-1.5 text-xs gap-1" disabled={setExecution.isPending} onClick={() => setExecution.mutate("paused")}>
                  <Pause className="h-2.5 w-2.5" />
                  {t(($) => $.roadmap.pause)}
                </Button>
                <Button size="xs" variant="outline" className="h-5 px-1.5 text-xs gap-1 text-destructive hover:text-destructive" disabled={setExecution.isPending} onClick={() => setExecution.mutate("stopped")}>
                  <Square className="h-2.5 w-2.5" />
                  {t(($) => $.roadmap.stop)}
                </Button>
              </>
            ) : execStatus === "paused" ? (
              <>
                <Button size="xs" variant="outline" className="h-5 px-1.5 text-xs gap-1" disabled={setExecution.isPending} onClick={() => setExecution.mutate("running")}>
                  <Play className="h-2.5 w-2.5" />
                  {t(($) => $.roadmap.resume)}
                </Button>
                <Button size="xs" variant="outline" className="h-5 px-1.5 text-xs gap-1 text-destructive hover:text-destructive" disabled={setExecution.isPending} onClick={() => setExecution.mutate("stopped")}>
                  <Square className="h-2.5 w-2.5" />
                  {t(($) => $.roadmap.stop)}
                </Button>
              </>
            ) : null}
          </div>

          {/* Milestone list */}
          <div className="space-y-0.5">
            {milestones.length === 0 && !adding && (
              <p className="text-xs text-muted-foreground px-1">{t(($) => $.roadmap.no_milestones)}</p>
            )}
            {milestones.map((m) => (
              <MilestoneRow
                key={m.id}
                milestone={m}
                onDelete={() => deleteMilestone.mutate(m.id)}
                onIssueClick={m.issue_id ? () => push(wsPaths.issueDetail(m.issue_id!)) : undefined}
              />
            ))}

            {/* Add milestone input */}
            {adding ? (
              <div className="flex items-center gap-1 mt-1">
                <input
                  ref={inputRef}
                  autoFocus
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={() => { if (!newTitle.trim()) { setAdding(false); } }}
                  placeholder={t(($) => $.roadmap.milestone_placeholder)}
                  className="flex-1 text-xs bg-transparent border border-border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-ring"
                />
                <Button size="xs" className="h-6" onClick={handleAddMilestone} disabled={!newTitle.trim() || createMilestone.isPending}>
                  {t(($) => $.roadmap.add_milestone)}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                onClick={() => { setAdding(true); setTimeout(() => inputRef.current?.focus(), 0); }}
              >
                <Plus className="h-3 w-3" />
                {t(($) => $.roadmap.add_milestone)}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MilestoneRow({
  milestone,
  onDelete,
  onIssueClick,
}: {
  milestone: ProjectMilestone;
  onDelete: () => void;
  onIssueClick?: () => void;
}) {
  return (
    <div className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-accent/40 transition-colors">
      {MILESTONE_STATUS_ICON[milestone.status]}
      <span className={cn("flex-1 text-xs truncate", milestone.status === "done" && "line-through text-muted-foreground")}>
        {milestone.title}
      </span>
      {onIssueClick && (
        <button
          type="button"
          onClick={onIssueClick}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Open issue"
        >
          ↗
        </button>
      )}
      <button
        type="button"
        aria-label="Delete milestone"
        onClick={onDelete}
        className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
