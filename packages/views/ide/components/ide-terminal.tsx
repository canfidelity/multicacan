"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Plus, Trash2, X, TerminalSquare } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { cn } from "@multica/ui/lib/utils";

const DARK_THEME: ITheme = {
  background: "#141414",
  foreground: "#cccccc",
  cursor: "#aeafad",
  cursorAccent: "#141414",
  selectionBackground: "#264f78",
  black: "#000000",
  red: "#f44747",
  green: "#4ec9b0",
  yellow: "#dcdcaa",
  blue: "#569cd6",
  magenta: "#c678dd",
  cyan: "#4fc1ff",
  white: "#d4d4d4",
  brightBlack: "#808080",
  brightRed: "#f44747",
  brightGreen: "#4ec9b0",
  brightYellow: "#dcdcaa",
  brightBlue: "#569cd6",
  brightMagenta: "#c678dd",
  brightCyan: "#4fc1ff",
  brightWhite: "#ffffff",
};

const LIGHT_THEME: ITheme = {
  background: "#fafafa",
  foreground: "#383a42",
  cursor: "#526fff",
  cursorAccent: "#fafafa",
  selectionBackground: "rgba(56,58,66,0.15)",
  black: "#383a42",
  red: "#e45649",
  green: "#50a14f",
  yellow: "#986801",
  blue: "#4078f2",
  magenta: "#a626a4",
  cyan: "#0184bc",
  white: "#aab1be",
  brightBlack: "#696c77",
  brightRed: "#e45649",
  brightGreen: "#50a14f",
  brightYellow: "#986801",
  brightBlue: "#4078f2",
  brightMagenta: "#a626a4",
  brightCyan: "#0184bc",
  brightWhite: "#383a42",
};

interface TerminalTab {
  id: string; // also used as ptyId
  num: number;
}

interface IDETerminalProps {
  wsId: string;
  onClose?: () => void;
}

export function IDETerminal({ wsId, onClose }: IDETerminalProps) {
  const tabsKey = `ide-terminal-tabs-${wsId}`;
  const activeKey = `ide-terminal-active-${wsId}`;

  const [tabs, setTabs] = useState<TerminalTab[]>(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(tabsKey) ?? "[]") as TerminalTab[];
      if (Array.isArray(s) && s.length > 0) return s;
    } catch {}
    return [{ id: crypto.randomUUID(), num: 1 }];
  });

  const [activeId, setActiveId] = useState<string>(() => {
    const stored = sessionStorage.getItem(activeKey) ?? "";
    return tabs.find((t) => t.id === stored)?.id ?? tabs[0]!.id;
  });

  const termRefsMap = useRef<Map<string, Terminal>>(new Map());

  useEffect(() => {
    sessionStorage.setItem(tabsKey, JSON.stringify(tabs));
  }, [tabs, tabsKey]);

  useEffect(() => {
    sessionStorage.setItem(activeKey, activeId);
  }, [activeId, activeKey]);

  const handleNewTab = useCallback(() => {
    const num = Math.max(...tabs.map((t) => t.num), 0) + 1;
    const t: TerminalTab = { id: crypto.randomUUID(), num };
    setTabs((prev) => [...prev, t]);
    setActiveId(t.id);
  }, [tabs]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== tabId);
        if (next.length === 0) {
          onClose?.();
          return prev;
        }
        setActiveId((cur) => {
          if (cur !== tabId) return cur;
          const idx = prev.findIndex((t) => t.id === tabId);
          return next[Math.min(idx, next.length - 1)]!.id;
        });
        return next;
      });
    },
    [onClose],
  );

  const registerTerm = useCallback((id: string, term: Terminal | null) => {
    if (term) termRefsMap.current.set(id, term);
    else termRefsMap.current.delete(id);
  }, []);

  const handleClear = useCallback(() => {
    termRefsMap.current.get(activeId)?.clear();
  }, [activeId]);

  return (
    <div className="flex h-full flex-col border-t bg-background">
      {/* Tab bar */}
      <div className="flex h-8 shrink-0 items-center gap-1 border-b px-2">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            onClick={() => setActiveId(tab.id)}
            className={cn(
              "flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] transition-colors",
              activeId === tab.id
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <TerminalSquare className="size-3 text-green-600 dark:text-[#4ec9b0]" />
            <span>{tabs.length > 1 ? `zsh ${i + 1}` : "zsh"}</span>
            {tabs.length > 1 && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(tab.id);
                }}
                className="ml-0.5 flex size-3.5 items-center justify-center rounded-sm hover:bg-muted-foreground/20"
              >
                <X className="size-2.5" />
              </span>
            )}
          </button>
        ))}

        <button
          onClick={handleNewTab}
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="New Terminal"
        >
          <Plus className="size-3" />
        </button>

        <div className="flex-1" />

        <button
          onClick={handleClear}
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Clear"
        >
          <Trash2 className="size-3" />
        </button>
        <button
          onClick={onClose}
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Close Terminal"
        >
          <X className="size-3" />
        </button>
      </div>

      {/* Terminal panes — all mounted, only active visible */}
      <div className="relative flex-1 overflow-hidden">
        {tabs.map((tab) => (
          <TerminalPane
            key={tab.id}
            wsId={wsId}
            ptyId={tab.id}
            isActive={tab.id === activeId}
            onRegister={registerTerm}
          />
        ))}
      </div>
    </div>
  );
}

function TerminalPane({
  wsId,
  ptyId,
  isActive,
  onRegister,
}: {
  wsId: string;
  ptyId: string;
  isActive: boolean;
  onRegister: (id: string, term: Terminal | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // Lazy-mount: only initialize when first shown.
  const [shouldMount, setShouldMount] = useState(isActive);

  useEffect(() => {
    if (isActive && !shouldMount) setShouldMount(true);
  }, [isActive, shouldMount]);

  useEffect(() => {
    if (!shouldMount || !containerRef.current) return;

    const isDark = document.documentElement.classList.contains("dark");
    const term = new Terminal({
      theme: isDark ? DARK_THEME : LIGHT_THEME,
      fontFamily: "'Cascadia Code', 'Fira Code', Menlo, 'Courier New', monospace",
      fontSize: 12.5,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 2000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    fitRef.current = fit;
    onRegister(ptyId, term);

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${proto}//${window.location.host}/api/native-ide/${wsId}/terminal?pty_id=${ptyId}`,
    );
    ws.binaryType = "arraybuffer";

    ws.onopen = () => ws.send(JSON.stringify({ cols: term.cols, rows: term.rows }));
    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) term.write(new Uint8Array(e.data));
    };
    ws.onclose = () => {
      term.write("\r\n\x1b[90m[session disconnected — refresh to reconnect]\x1b[0m\r\n");
    };
    term.onData((d) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(d));
    });

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ cols: term.cols, rows: term.rows }));
        }
      } catch {}
    });
    ro.observe(containerRef.current);

    // Follow app theme changes.
    const themeObs = new MutationObserver(() => {
      term.options.theme = document.documentElement.classList.contains("dark")
        ? DARK_THEME
        : LIGHT_THEME;
    });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      ro.disconnect();
      themeObs.disconnect();
      ws.close();
      term.dispose();
      onRegister(ptyId, null);
    };
  }, [shouldMount, wsId, ptyId, onRegister]);

  // Refit when this tab becomes active.
  useEffect(() => {
    if (isActive && fitRef.current) {
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
        } catch {}
      });
    }
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, visibility: isActive ? "visible" : "hidden" }}
    />
  );
}
