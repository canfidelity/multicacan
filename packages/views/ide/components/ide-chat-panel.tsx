"use client";

import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronDown, Plus, Send, Square } from "lucide-react";
import { useWorkspaceId } from "@multica/core/hooks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@multica/ui/components/ui/dropdown-menu";
import { Button } from "@multica/ui/components/ui/button";
import { cn } from "@multica/ui/lib/utils";

interface IDEChatPanelProps {
  activeFile: string | null;
  onAgentDone?: () => void;
}

interface ToolCall {
  tool: string;
  input?: unknown;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

interface IDERuntime {
  id: string;
  name: string;
  provider: string;
}

function useIDERuntimes(wsId: string | null) {
  return useQuery<{ runtimes: IDERuntime[] }>({
    queryKey: ["ide-runtimes", wsId],
    queryFn: async () => {
      if (!wsId) return { runtimes: [] };
      const r = await fetch(`/api/native-ide/${wsId}/runtimes`);
      if (!r.ok) return { runtimes: [] };
      return r.json();
    },
    enabled: !!wsId,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

export function IDEChatPanel({ activeFile, onAgentDone }: IDEChatPanelProps) {
  const wsId = useWorkspaceId();

  const storageKey = wsId ? `ide-chat-${wsId}` : null;

  const { data } = useIDERuntimes(wsId);
  const runtimes = data?.runtimes ?? [];

  const [selectedRuntimeId, setSelectedRuntimeId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (!storageKey) return [];
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) ?? "[]");
    } catch {
      return [];
    }
  });
  const [streamingText, setStreamingText] = useState("");
  const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCall[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string>("");

  // Restore session_id from sessionStorage on mount.
  useEffect(() => {
    if (!storageKey) return;
    sessionIdRef.current = sessionStorage.getItem(`${storageKey}-sid`) ?? "";
  }, [storageKey]);

  // Persist messages.
  useEffect(() => {
    if (!storageKey) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {}
  }, [messages, storageKey]);

  // Auto-select first available runtime.
  useEffect(() => {
    if (!selectedRuntimeId && runtimes.length > 0) {
      setSelectedRuntimeId(runtimes[0]!.id);
    }
  }, [runtimes, selectedRuntimeId]);

  const activeRuntime =
    runtimes.find((r) => r.id === selectedRuntimeId) ?? runtimes[0] ?? null;

  // Auto-scroll on new content.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, streamingToolCalls]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleSend = useCallback(async () => {
    const raw = inputValue.trim();
    if (!raw || !activeRuntime || sending || !wsId) return;

    const content = activeFile ? `[IDE] Active file: \`${activeFile}\`\n\n${raw}` : raw;
    const userMsg: ChatMessage = { role: "user", content };
    const newMessages = [...messages, userMsg];

    setSending(true);
    setInputValue("");
    setStreamingText("");
    setStreamingToolCalls([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    setMessages(newMessages);

    const payload = {
      runtime_id: activeRuntime.id,
      session_id: sessionIdRef.current,
      messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
    };

    const abort = new AbortController();
    abortRef.current = abort;

    let wroteFile = false;
    let accText = "";
    const accToolCalls: ToolCall[] = [];

    try {
      const csrf =
        document.cookie
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("multica_csrf="))
          ?.split("=")[1] ?? "";

      const response = await fetch(`/api/native-ide/${wsId}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify(payload),
        signal: abort.signal,
      });

      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let ev: {
            type: string;
            text?: string;
            tool?: string;
            input?: unknown;
            message?: string;
            session_id?: string;
          };
          try {
            ev = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          switch (ev.type) {
            case "delta":
              accText += ev.text ?? "";
              setStreamingText(accText);
              break;
            case "tool_call":
              if (ev.tool) {
                const tc: ToolCall = { tool: ev.tool, input: ev.input };
                accToolCalls.push(tc);
                setStreamingToolCalls([...accToolCalls]);
                if (ev.tool === "write_file") wroteFile = true;
              }
              break;
            case "done": {
              if (ev.session_id) {
                sessionIdRef.current = ev.session_id;
                if (storageKey)
                  sessionStorage.setItem(`${storageKey}-sid`, ev.session_id);
              }
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: accText,
                  toolCalls: accToolCalls.length > 0 ? [...accToolCalls] : undefined,
                },
              ]);
              setStreamingText("");
              setStreamingToolCalls([]);
              if (wroteFile) onAgentDone?.();
              break;
            }
            case "error":
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `Error: ${ev.message ?? "Unknown error"}` },
              ]);
              setStreamingText("");
              setStreamingToolCalls([]);
              break;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${(err as Error).message}` },
        ]);
        setStreamingText("");
        setStreamingToolCalls([]);
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [inputValue, activeRuntime, sending, wsId, activeFile, messages, onAgentDone, storageKey]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleNewChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setStreamingText("");
    setStreamingToolCalls([]);
    setInputValue("");
    sessionIdRef.current = "";
    if (storageKey) {
      sessionStorage.removeItem(storageKey);
      sessionStorage.removeItem(`${storageKey}-sid`);
    }
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [storageKey]);

  const isStreaming = sending && (streamingText.length > 0 || streamingToolCalls.length > 0);
  const hasContent = messages.length > 0 || isStreaming;

  return (
    <div className="flex h-full flex-col border-l">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
        <Bot className="size-3.5 shrink-0 text-muted-foreground" />
        <RuntimeDropdown
          runtimes={runtimes}
          activeRuntime={activeRuntime}
          onSelect={(rt) => setSelectedRuntimeId(rt.id)}
        />
        <div className="ml-auto">
          <Button variant="ghost" size="icon-sm" onClick={handleNewChat} title="New chat">
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {!hasContent ? (
          <EmptyState runtimeName={activeRuntime?.name} />
        ) : (
          <div className="flex flex-col gap-3 p-3">
            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}
            {sending && (streamingText || streamingToolCalls.length > 0) && (
              <div className="flex flex-col gap-1.5">
                {streamingToolCalls.map((tc, i) => (
                  <ToolCallChip key={i} toolCall={tc} />
                ))}
                {streamingText && (
                  <div className="max-w-[85%] self-start rounded-lg bg-muted px-3 py-2 text-xs text-foreground whitespace-pre-wrap break-words">
                    {streamingText}
                    <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-current" />
                  </div>
                )}
              </div>
            )}
            {sending && !streamingText && streamingToolCalls.length === 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="flex gap-0.5">
                  {[0, 150, 300].map((d) => (
                    <span key={d} className="animate-bounce" style={{ animationDelay: `${d}ms` }}>
                      .
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t p-2">
        {activeFile && (
          <div className="mb-1.5 flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground w-fit max-w-full">
            <span className="shrink-0">📄</span>
            <span className="truncate font-mono">{activeFile.split("/").pop()}</span>
            <span className="shrink-0 opacity-50">in context</span>
          </div>
        )}
        <div className="flex items-end gap-2 rounded-lg border bg-background px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={activeRuntime ? `Ask ${activeRuntime.name}…` : "No runtime available…"}
            disabled={!activeRuntime}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50 min-h-[24px] max-h-[120px] leading-6"
          />
          {sending ? (
            <button
              onClick={handleStop}
              className="size-6 shrink-0 flex items-center justify-center rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              title="Stop"
            >
              <Square className="size-3 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || !activeRuntime}
              className={cn(
                "size-6 shrink-0 flex items-center justify-center rounded transition-colors",
                inputValue.trim() && activeRuntime
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "text-muted-foreground",
              )}
              title="Send (Enter)"
            >
              <Send className="size-3" />
            </button>
          )}
        </div>
        <p className="mt-1 text-center text-[10px] text-muted-foreground/50">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

function RuntimeDropdown({
  runtimes,
  activeRuntime,
  onSelect,
}: {
  runtimes: IDERuntime[];
  activeRuntime: IDERuntime | null;
  onSelect: (rt: IDERuntime) => void;
}) {
  if (runtimes.length === 0) {
    return <span className="text-xs text-muted-foreground">No runtimes</span>;
  }

  if (runtimes.length === 1 || !activeRuntime) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium">
        <ProviderIcon provider={activeRuntime?.provider ?? ""} />
        <span className="truncate max-w-28">{activeRuntime?.name ?? "—"}</span>
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs font-medium cursor-pointer outline-none transition-colors hover:bg-accent aria-expanded:bg-accent min-w-0">
        <ProviderIcon provider={activeRuntime.provider} />
        <span className="truncate max-w-28">{activeRuntime.name}</span>
        <ChevronDown className="size-3 text-muted-foreground shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" className="w-48">
        {runtimes.map((rt) => (
          <DropdownMenuItem
            key={rt.id}
            onClick={() => onSelect(rt)}
            className={cn(
              "flex items-center gap-2",
              rt.id === activeRuntime.id && "font-medium",
            )}
          >
            <ProviderIcon provider={rt.provider} />
            <span className="flex-1 truncate">{rt.name}</span>
            <span className="text-[10px] text-muted-foreground">{rt.provider}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProviderIcon({ provider }: { provider: string }) {
  const colors: Record<string, string> = {
    claude: "text-orange-500",
    opencode: "text-blue-500",
    codex: "text-green-500",
  };
  return <Bot className={cn("size-3.5 shrink-0", colors[provider] ?? "text-muted-foreground")} />;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const displayContent = isUser
    ? message.content.replace(/^\[IDE\] Active file: `[^`]+`\n\n/, "")
    : message.content;

  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="flex flex-col gap-1 w-full">
          {message.toolCalls.map((tc, i) => (
            <ToolCallChip key={i} toolCall={tc} />
          ))}
        </div>
      )}
      {displayContent && (
        <div
          className={cn(
            "max-w-[85%] rounded-lg px-3 py-2 text-xs whitespace-pre-wrap break-words",
            isUser
              ? "bg-primary text-primary-foreground self-end"
              : "bg-muted text-foreground self-start",
          )}
        >
          {displayContent}
        </div>
      )}
    </div>
  );
}

function ToolCallChip({ toolCall }: { toolCall: ToolCall }) {
  return (
    <div className="flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground w-fit max-w-full">
      <span>{getToolEmoji(toolCall.tool)}</span>
      <span className="truncate font-mono">{getToolLabel(toolCall)}</span>
    </div>
  );
}

function getToolEmoji(tool: string): string {
  switch (tool) {
    case "read_file": return "📄";
    case "write_file": return "✏️";
    case "list_files": return "📁";
    default: return "🔧";
  }
}

function getToolLabel(toolCall: ToolCall): string {
  const input = toolCall.input as Record<string, string> | undefined;
  const path = input?.path ?? "";
  const fileName = path.split("/").pop() ?? path;
  return fileName ? `${toolCall.tool}: ${fileName}` : toolCall.tool;
}

function EmptyState({ runtimeName }: { runtimeName?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
      <Bot className="size-8 text-muted-foreground/30" />
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {runtimeName ? `Chat with ${runtimeName}` : "No runtime available"}
        </p>
        <p className="text-xs text-muted-foreground">
          Ask about the code, request changes, or get help debugging.
        </p>
      </div>
    </div>
  );
}
