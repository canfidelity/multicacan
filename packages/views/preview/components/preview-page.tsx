"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Globe,
  RefreshCw,
  ExternalLink,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { PageHeader } from "../../layout/page-header";
import { useWorkspaceId } from "@multica/core/hooks";

interface PortEntry {
  port: number;
}

export default function WebPreviewPage() {
  const workspaceId = useWorkspaceId();
  const [ports, setPorts] = useState<PortEntry[]>([]);
  const [selectedPort, setSelectedPort] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const proxyBase =
    workspaceId && selectedPort
      ? `/api/webpreview/${workspaceId}/${selectedPort}`
      : null;

  const fetchStatus = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const res = await fetch(
        `/api/webpreview/status?workspace_id=${workspaceId}`,
        { credentials: "include" },
      );
      const data: PortEntry[] = await res.json();
      setPorts(Array.isArray(data) ? data : []);
      setSelectedPort((prev) => {
        if (prev && data.some((p) => p.port === prev)) return prev;
        return data.length > 0 ? data[0].port : null;
      });
    } catch {
      setPorts([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const handleRefresh = () => {
    setIframeKey((k) => k + 1);
    fetchStatus();
  };

  return (
    <>
      <PageHeader>
        <Globe className="size-4 mr-2 text-muted-foreground" />
        <h1 className="text-sm font-medium">Web Preview</h1>

        <div className="ml-auto flex items-center gap-2">
          {ports.length > 0 && (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1.5"
                onClick={() => setDropdownOpen((o) => !o)}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {selectedPort ? `Port ${selectedPort}` : "Select port"}
                <ChevronDown className="size-3" />
              </Button>

              {dropdownOpen && (
                <div
                  className="absolute right-0 top-full mt-1 z-50 min-w-[120px] rounded-md border border-border bg-popover shadow-md py-1"
                  onMouseLeave={() => setDropdownOpen(false)}
                >
                  {ports.map((p) => (
                    <button
                      key={p.port}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2 ${selectedPort === p.port ? "font-semibold text-primary" : ""}`}
                      onClick={() => {
                        setSelectedPort(p.port);
                        setDropdownOpen(false);
                        setIframeKey((k) => k + 1);
                      }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                      Port {p.port}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {proxyBase && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => window.open(proxyBase, "_blank")}
            >
              <ExternalLink className="size-3 mr-1" />
              Open
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleRefresh}
          >
            <RefreshCw className="size-3 mr-1" />
            Refresh
          </Button>
        </div>
      </PageHeader>

      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading...
          </div>
        ) : proxyBase ? (
          <iframe
            key={iframeKey}
            src={proxyBase}
            className="w-full h-full border-0"
            title="Web Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          />
        ) : (
          <EmptyState onRefresh={handleRefresh} />
        )}
      </div>
    </>
  );
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
      <div className="rounded-xl bg-muted/30 p-4">
        <Globe className="size-10 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">No Dev Server Running</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Start a dev server on the runtime and the daemon will connect
          automatically.
        </p>
        <code className="block mt-3 text-xs bg-muted/50 rounded-md px-3 py-2 font-mono">
          npm run dev &nbsp;/&nbsp; vite preview &nbsp;/&nbsp; npx serve dist
        </code>
      </div>
      <Button variant="outline" size="sm" onClick={onRefresh}>
        <RefreshCw className="size-3.5 mr-1.5" />
        Refresh
      </Button>
    </div>
  );
}
