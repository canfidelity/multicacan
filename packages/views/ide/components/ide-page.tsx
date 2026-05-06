"use client";

import { useEffect, useState } from "react";
import { Code2, RefreshCw, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { PageHeader } from "../../layout/page-header";

const IDE_PORT = 18080;

export function IDEPage() {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);

  // Direct URL to openvscode-server running on the same host
  const ideUrl =
    typeof window !== "undefined"
      ? `http://${window.location.hostname}:${IDE_PORT}/`
      : null;

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/ide/status");
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
  }, []);

  return (
    <div className="flex h-full flex-col">
      <PageHeader>
        <Code2 className="size-4 mr-2 shrink-0" />
        <span className="font-medium text-sm">Code Editor</span>
        {active && ideUrl && (
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIframeKey((k) => k + 1)}
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(ideUrl, "_blank")}
            >
              <ExternalLink className="size-4" />
            </Button>
          </div>
        )}
      </PageHeader>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : !active || !ideUrl ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Code2 className="size-10 opacity-30" />
          <p className="text-sm">Code Editor unavailable</p>
          <p className="text-xs opacity-60">
            Make sure openvscode-server is running on the VPS.
          </p>
        </div>
      ) : (
        <iframe
          key={iframeKey}
          src={ideUrl}
          className="flex-1 w-full border-0"
          allow="clipboard-read; clipboard-write"
        />
      )}
    </div>
  );
}
