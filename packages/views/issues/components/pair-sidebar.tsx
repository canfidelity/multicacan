"use client";

import { useState } from "react";
import { Bot, GitBranch, Loader2, Square, Zap, Swords } from "lucide-react";
import { Switch } from "@multica/ui/components/ui/switch";
import { Label } from "@multica/ui/components/ui/label";
import { Button } from "@multica/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@multica/ui/components/ui/select";
import { ScrollArea } from "@multica/ui/components/ui/scroll-area";
import { Separator } from "@multica/ui/components/ui/separator";
import { cn } from "@multica/ui/lib/utils";
import { timeAgo } from "@multica/core/utils";
import type { Agent } from "@multica/core/types";
import type { PairSession, PairSuggestion } from "@multica/core/types/events";

interface PairSidebarProps {
  session: PairSession | null;
  suggestions: PairSuggestion[];
  isLoading: boolean;
  isStarting: boolean;
  agents: Agent[];
  onStart: (agentId: string, intervene: boolean) => Promise<void>;
  onStop: () => Promise<void>;
  className?: string;
}

export function PairSidebar({
  session,
  suggestions,
  isLoading,
  isStarting,
  agents,
  onStart,
  onStop,
  className,
}: PairSidebarProps) {
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id ?? "");
  const [intervene, setIntervene] = useState(false);

  const isActive = session?.status === "active";

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
        <Zap className="h-4 w-4 text-violet-500" />
        <span className="text-sm font-medium">Live Pair</span>
        {isActive && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-b shrink-0 space-y-2">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading…
          </div>
        ) : isActive ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-1 min-w-0">
              <Bot className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {agents.find((a) => a.id === session?.agent_id)?.name ?? "Agent"}
              </span>
              {session?.work_dir && (
                <>
                  <GitBranch className="h-3 w-3 shrink-0" />
                  <span className="truncate font-mono">{session.work_dir.split("/").slice(-2).join("/")}</span>
                </>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={onStop}
            >
              <Square className="h-3 w-3 mr-1" />
              Stop
            </Button>
          </div>
        ) : (
          <>
          <div className="flex items-center gap-2">
            <Select
              value={selectedAgentId}
              onValueChange={(v) => { if (v) setSelectedAgentId(v); }}
            >
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="Select agent">
                  {agents.find((a) => a.id === selectedAgentId)?.name ?? "Select agent"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 text-xs shrink-0"
              disabled={!selectedAgentId || isStarting}
              onClick={() => onStart(selectedAgentId, intervene)}
            >
              {isStarting ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Zap className="h-3 w-3 mr-1" />
              )}
              Start
            </Button>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Switch
              id="intervene-toggle"
              checked={intervene}
              onCheckedChange={setIntervene}
              className="scale-75 origin-left"
            />
            <Label htmlFor="intervene-toggle" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
              <Swords className="h-3 w-3" />
              Müdahale et
            </Label>
          </div>
          </>
        )}
        {!isActive && !isLoading && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            Select an agent and start a session. The agent will watch your local git changes and suggest improvements in real time.
          </p>
        )}
      </div>

      {/* Suggestions */}
      <ScrollArea className="flex-1">
        {suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-xs text-muted-foreground gap-2 px-4 text-center">
            {isActive ? (
              <>
                <Bot className="h-5 w-5 opacity-40" />
                <p>Watching for changes… Make a git commit or edit a file to see suggestions.</p>
              </>
            ) : (
              <>
                <Zap className="h-5 w-5 opacity-30" />
                <p>Start a session to see AI pair programming suggestions.</p>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {suggestions.map((s, idx) => (
              <SuggestionCard key={s.id ?? idx} suggestion={s} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: PairSuggestion }) {
  const [diffExpanded, setDiffExpanded] = useState(false);

  return (
    <div className="px-4 py-3 space-y-2">
      {/* Time */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{timeAgo(suggestion.created_at)}</span>
        {suggestion.diff_snippet && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setDiffExpanded((v) => !v)}
          >
            {diffExpanded ? "Hide diff" : "Show diff"}
          </button>
        )}
      </div>

      {/* Agent suggestion */}
      <p className="text-xs leading-relaxed whitespace-pre-wrap">{suggestion.content}</p>

      {/* Diff */}
      {diffExpanded && suggestion.diff_snippet && (
        <>
          <Separator />
          <pre className="text-[10px] font-mono leading-relaxed overflow-x-auto text-muted-foreground bg-muted/50 rounded p-2 max-h-48 overflow-y-auto">
            {suggestion.diff_snippet}
          </pre>
        </>
      )}
    </div>
  );
}