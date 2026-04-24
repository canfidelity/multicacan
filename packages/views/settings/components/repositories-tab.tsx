"use client";

import { useEffect, useState } from "react";
import { Save, Trash2, FolderOpen, Globe } from "lucide-react";
import { Input } from "@multica/ui/components/ui/input";
import { Button } from "@multica/ui/components/ui/button";
import { Card, CardContent } from "@multica/ui/components/ui/card";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@multica/core/auth";
import { useWorkspaceId } from "@multica/core/hooks";
import { useCurrentWorkspace } from "@multica/core/paths";
import { memberListOptions, workspaceKeys } from "@multica/core/workspace/queries";
import { api } from "@multica/core/api";
import type { Workspace, WorkspaceRepo } from "@multica/core/types";

export function RepositoriesTab() {
  const user = useAuthStore((s) => s.user);
  const workspace = useCurrentWorkspace();
  const wsId = useWorkspaceId();
  const qc = useQueryClient();
  const { data: members = [] } = useQuery(memberListOptions(wsId));

  const [repos, setRepos] = useState<WorkspaceRepo[]>(workspace?.repos ?? []);
  const [saving, setSaving] = useState(false);

  const currentMember = members.find((m) => m.user_id === user?.id) ?? null;
  const canManageWorkspace = currentMember?.role === "owner" || currentMember?.role === "admin";

  useEffect(() => {
    setRepos(workspace?.repos ?? []);
  }, [workspace]);

  const handleSave = async () => {
    if (!workspace) return;
    setSaving(true);
    try {
      const updated = await api.updateWorkspace(workspace.id, { repos });
      qc.setQueryData(workspaceKeys.list(), (old: Workspace[] | undefined) =>
        old?.map((ws) => (ws.id === updated.id ? updated : ws)),
      );
      toast.success("Repositories saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save repositories");
    } finally {
      setSaving(false);
    }
  };

  const handleAddRepo = () => {
    setRepos([...repos, { url: "", description: "", type: "remote" }]);
  };

  const handleAddLocalRepo = () => {
    setRepos([...repos, { url: "", description: "", type: "local", local_path: "" }]);
  };

  const handleRemoveRepo = (index: number) => {
    setRepos(repos.filter((_, i) => i !== index));
  };

  const handleRepoChange = (index: number, field: keyof WorkspaceRepo, value: string) => {
    setRepos(repos.map((r, i) => {
      if (i !== index) return r;
      return { ...r, [field]: value };
    }));
  };

  if (!workspace) return null;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Repositories</h2>

        <Card>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Repositories associated with this workspace. Add remote repos (cloned by agents) or local repos (agents work directly in the folder).
            </p>

            {repos.map((repo, index) => (
              <div key={index} className="flex gap-2">
                <div className="flex-1 space-y-1.5">
                  {(repo.type === "local") ? (
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <Input
                        type="text"
                        value={repo.local_path ?? ""}
                        onChange={(e) => handleRepoChange(index, "local_path", e.target.value)}
                        disabled={!canManageWorkspace}
                        placeholder="/Users/you/projects/my-repo"
                        className="text-sm"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <Input
                        type="url"
                        value={repo.url}
                        onChange={(e) => handleRepoChange(index, "url", e.target.value)}
                        disabled={!canManageWorkspace}
                        placeholder="https://git.example.com/org/repo.git"
                        className="text-sm"
                      />
                    </div>
                  )}
                  <Input
                    type="text"
                    value={repo.description}
                    onChange={(e) => handleRepoChange(index, "description", e.target.value)}
                    disabled={!canManageWorkspace}
                    placeholder="Description (e.g. Go backend + Next.js frontend)"
                    className="text-sm ml-5.5"
                  />
                </div>
                {canManageWorkspace && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemoveRepo(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}

            {canManageWorkspace && (
              <div className="flex items-center justify-between pt-1">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleAddRepo}>
                    <Globe className="h-3 w-3" />
                    Remote repo
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleAddLocalRepo}>
                    <FolderOpen className="h-3 w-3" />
                    Local repo
                  </Button>
                </div>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <Save className="h-3 w-3" />
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            )}

            {!canManageWorkspace && (
              <p className="text-xs text-muted-foreground">
                Only admins and owners can manage repositories.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
