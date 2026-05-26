"use client";

import { useState } from "react";
import { ChevronRight, Plus, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Issue, IssueDependency } from "@multicacan/core/types";
import { STATUS_CONFIG } from "@multicacan/core/issues/config";
import { issueDependencyOptions } from "@multicacan/core/issues/queries";
import { useAddIssueDependency, useRemoveIssueDependency } from "@multicacan/core/issues/mutations";
import { useCurrentWorkspace, useWorkspacePaths } from "@multicacan/core/paths";
import { AppLink } from "../../navigation";
import { StatusIcon } from "./status-icon";
import { IssuePickerModal } from "../../modals/issue-picker-modal";
import { useT } from "../../i18n";

interface IssueDependenciesSectionProps {
  issue: Issue;
  wsId: string;
}

type DependencyType = "blocks" | "blocked_by" | "related";

interface DepSubsectionProps {
  label: string;
  addLabel: string;
  items: IssueDependency[];
  issuePrefix: string;
  issueId: string;
  depType: DependencyType;
  wsId: string;
  excludeIds: string[];
}

function DepSubsection({
  label,
  addLabel,
  items,
  issuePrefix,
  issueId,
  depType,
  wsId,
  excludeIds,
}: DepSubsectionProps) {
  const { t } = useT("issues");
  const paths = useWorkspacePaths();
  const [pickerOpen, setPickerOpen] = useState(false);
  const addDep = useAddIssueDependency(wsId, issueId);
  const removeDep = useRemoveIssueDependency(wsId, issueId);

  const handleSelect = (picked: Issue) => {
    addDep.mutate(
      { depends_on_issue_id: picked.id, type: depType },
      {
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to add dependency"),
      },
    );
  };

  const handleRemove = (depId: string) => {
    removeDep.mutate(depId, {
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Failed to remove dependency"),
    });
  };

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-between gap-1 py-0.5">
        <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">
          {label}
        </span>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3 w-3" />
          {addLabel}
        </button>
        <IssuePickerModal
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title={addLabel}
          description={addLabel}
          excludeIds={excludeIds}
          onSelect={handleSelect}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">
          {label}
        </span>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3 w-3" />
          {addLabel}
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        {items.map((dep) => {
          const statusCfg = STATUS_CONFIG[dep.dep_status as keyof typeof STATUS_CONFIG];
          const identifier = `${issuePrefix}-${dep.dep_number}`;
          return (
            <div
              key={dep.id}
              className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 -mx-1.5 hover:bg-accent/40 transition-colors"
            >
              <StatusIcon
                status={dep.dep_status as Parameters<typeof StatusIcon>[0]["status"]}
                className="h-3 w-3 shrink-0"
              />
              <AppLink
                href={paths.issueDetail(dep.depends_on_issue_id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-xs"
              >
                <span className="shrink-0 text-muted-foreground tabular-nums font-medium">
                  {identifier}
                </span>
                <span className={`truncate ${statusCfg ? statusCfg.iconColor : ""} group-hover:text-foreground`}>
                  {dep.dep_title}
                </span>
              </AppLink>
              <button
                type="button"
                onClick={() => handleRemove(dep.id)}
                aria-label={t(($) => $.dependencies.remove_aria)}
                className="h-4 w-4 shrink-0 flex items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
      <IssuePickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={addLabel}
        description={addLabel}
        excludeIds={excludeIds}
        onSelect={handleSelect}
      />
    </div>
  );
}

export function IssueDependenciesSection({
  issue,
  wsId,
}: IssueDependenciesSectionProps) {
  const { t } = useT("issues");
  const workspace = useCurrentWorkspace();
  const [open, setOpen] = useState(true);

  const { data } = useQuery(issueDependencyOptions(wsId, issue.id));

  const dependencies: IssueDependency[] = data?.dependencies ?? [];
  const dependents: IssueDependency[] = data?.dependents ?? [];

  // Compute per-subsection lists.
  // dependencies: this issue depends on another → "blocks" dep means this issue blocks the other.
  // dependents: another issue depends on this one → shown in the reverse subsections.
  const blocksItems = dependencies.filter((d) => d.type === "blocks");
  const blockedByItems = dependencies.filter((d) => d.type === "blocked_by");
  const relatedItems = dependencies.filter((d) => d.type === "related");

  const issuePrefix = workspace?.issue_prefix ?? "";

  // Build exclude list: current issue + all already-linked issues
  const baseExclude = [issue.id];
  const allLinkedIds = [
    ...dependencies.map((d) => d.depends_on_issue_id),
    ...dependents.map((d) => d.issue_id),
  ];
  const excludeIds = [...new Set([...baseExclude, ...allLinkedIds])];

  // Always render the section so the "Add..." buttons are available even
  // when there are no deps yet.
  return (
    <div>
      <button
        type="button"
        className={`flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors mb-2 hover:bg-accent/70 ${open ? "" : "text-muted-foreground hover:text-foreground"}`}
        onClick={() => setOpen((v) => !v)}
      >
        {t(($) => $.dependencies.section_title)}
        <ChevronRight
          className={`!size-3 shrink-0 stroke-[2.5] text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <div className="pl-2 flex flex-col gap-3">
          <DepSubsection
            label={t(($) => $.dependencies.blocks)}
            addLabel={t(($) => $.dependencies.add_blocks)}
            items={blocksItems}
            issuePrefix={issuePrefix}
            issueId={issue.id}
            depType="blocks"
            wsId={wsId}
            excludeIds={excludeIds}
          />
          <DepSubsection
            label={t(($) => $.dependencies.blocked_by)}
            addLabel={t(($) => $.dependencies.add_blocked_by)}
            items={blockedByItems}
            issuePrefix={issuePrefix}
            issueId={issue.id}
            depType="blocked_by"
            wsId={wsId}
            excludeIds={excludeIds}
          />
          <DepSubsection
            label={t(($) => $.dependencies.related)}
            addLabel={t(($) => $.dependencies.add_related)}
            items={relatedItems}
            issuePrefix={issuePrefix}
            issueId={issue.id}
            depType="related"
            wsId={wsId}
            excludeIds={excludeIds}
          />
        </div>
      )}
    </div>
  );
}
