"use client";

import { useCallback, useEffect, useState } from "react";
import { Code2, Loader2, TerminalSquare } from "lucide-react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@multicacan/ui/components/ui/resizable";
import { Button } from "@multicacan/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@multicacan/ui/components/ui/select";
import { PageHeader } from "../../layout/page-header";
import { useWorkspaceId } from "@multicacan/core/hooks";
import { FileTree } from "./file-tree";
import { EditorTabs, type OpenFile } from "./editor-tabs";
import { IDEEditor } from "./ide-editor";
import { IDETerminal } from "./ide-terminal";
import { IDEChatPanel } from "./ide-chat-panel";

interface Runtime {
  id: string;
  name: string;
  provider: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function runtimeDisplayName(rt: Runtime): string {
  if (!rt.name || UUID_RE.test(rt.name)) {
    return rt.provider || rt.id.slice(0, 8);
  }
  return rt.name;
}

export function NativeIDEPage() {
  const wsId = useWorkspaceId();
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [editorRefreshKey, setEditorRefreshKey] = useState(0);
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [selectedRuntimeId, setSelectedRuntimeId] = useState<string | null>(null);

  const handleAgentDone = useCallback(() => {
    setEditorRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!wsId) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/native-ide/status?workspace_id=${wsId}`);
        if (!cancelled && res.ok) {
          const data = await res.json();
          setActive(!!data.active);
        }
      } catch {
        if (!cancelled) setActive(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [wsId]);

  useEffect(() => {
    if (!wsId || !active) return;
    fetch(`/api/native-ide/${wsId}/runtimes`)
      .then((r) => r.json())
      .then((d) => {
        const list: Runtime[] = d.runtimes ?? [];
        setRuntimes(list);
        setSelectedRuntimeId((prev) => {
          if (prev && list.some((r) => r.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      })
      .catch(() => {});
  }, [wsId, active]);

  const handleFileOpen = useCallback((path: string) => {
    setOpenFiles((prev) => {
      if (prev.some((f) => f.path === path)) return prev;
      return [...prev, { path, dirty: false }];
    });
    setActiveFile(path);
  }, []);

  const handleFileClose = useCallback((path: string) => {
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f.path !== path);
      if (activeFile === path) {
        setActiveFile(next.length > 0 ? (next[next.length - 1]?.path ?? null) : null);
      }
      return next;
    });
  }, [activeFile]);

  const handleDirtyChange = useCallback((path: string, dirty: boolean) => {
    setOpenFiles((prev) =>
      prev.map((f) => (f.path === path ? { ...f, dirty } : f))
    );
  }, []);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader>
          <Code2 className="size-4 mr-2 shrink-0" />
          <span className="font-medium text-sm">Code Editor</span>
        </PageHeader>
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </div>
    );
  }

  if (!active) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader>
          <Code2 className="size-4 mr-2 shrink-0" />
          <span className="font-medium text-sm">Code Editor</span>
        </PageHeader>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Code2 className="size-10 opacity-30" />
          <p className="text-sm">Code Editor unavailable</p>
          <p className="text-xs opacity-60">
            Start the Multicacan daemon on your Mac Mini to connect.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader>
        <Code2 className="size-4 mr-2 shrink-0" />
        <span className="font-medium text-sm">Code Editor</span>
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTerminal((v) => !v)}
            className={showTerminal ? "bg-muted" : ""}
          >
            <TerminalSquare className="size-4" />
          </Button>
        </div>
      </PageHeader>

      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        {/* File Tree */}
        <ResizablePanel
          id="ide-tree"
          defaultSize={220}
          minSize={140}
          maxSize={400}
          groupResizeBehavior="preserve-pixel-size"
        >
          <div className="h-full flex flex-col overflow-hidden border-r">
            <div className="shrink-0 border-b px-2 py-1.5">
              {runtimes.length > 0 ? (
                <Select
                  value={selectedRuntimeId ?? ""}
                  onValueChange={(v) => {
                    setSelectedRuntimeId(v || null);
                    setOpenFiles([]);
                    setActiveFile(null);
                  }}
                >
                  <SelectTrigger className="h-6 text-xs border-0 shadow-none px-0 gap-1 font-medium text-muted-foreground uppercase tracking-wide focus:ring-0">
                    <SelectValue placeholder="Select agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {runtimes.map((rt) => (
                      <SelectItem key={rt.id} value={rt.id} className="text-xs">
                        {runtimeDisplayName(rt)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Files
                </span>
              )}
            </div>
            <div className="flex-1 overflow-auto py-1">
              <FileTree
                wsId={wsId!}
                onFileOpen={handleFileOpen}
              />
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Editor + Terminal */}
        <ResizablePanel id="ide-main" minSize="20%">
          <ResizablePanelGroup orientation="vertical" className="h-full">
            <ResizablePanel id="ide-editor" minSize="20%">
              <div className="flex h-full flex-col overflow-hidden">
                <EditorTabs
                  files={openFiles}
                  active={activeFile}
                  onSelect={setActiveFile}
                  onClose={handleFileClose}
                />
                <div className="flex-1 overflow-hidden">
                  {activeFile ? (
                    <IDEEditor
                      wsId={wsId!}
                      path={activeFile}
                      onDirtyChange={handleDirtyChange}
                      refreshKey={editorRefreshKey}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Select a file to open
                    </div>
                  )}
                </div>
              </div>
            </ResizablePanel>

            {showTerminal && (
              <>
                <ResizableHandle />
                <ResizablePanel id="ide-terminal" defaultSize="30%" minSize="12%">
                  <IDETerminal
                    wsId={wsId!}
                    onClose={() => setShowTerminal(false)}
                  />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle />

        {/* Agent Chat */}
        <ResizablePanel
          id="ide-chat"
          defaultSize={320}
          minSize={240}
          maxSize={560}
          groupResizeBehavior="preserve-pixel-size"
        >
          <IDEChatPanel activeFile={activeFile} onAgentDone={handleAgentDone} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
