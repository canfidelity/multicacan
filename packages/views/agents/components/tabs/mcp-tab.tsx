"use client";

import { useState, useEffect } from "react";
import { Loader2, Save, Trash2, Plus, Search } from "lucide-react";
import type { Agent } from "@multica/core/types";
import { Button } from "@multica/ui/components/ui/button";
import { Label } from "@multica/ui/components/ui/label";
import { Textarea } from "@multica/ui/components/ui/textarea";
import { Input } from "@multica/ui/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@multica/ui/components/ui/dialog";
import { ScrollArea } from "@multica/ui/components/ui/scroll-area";
import { toast } from "sonner";

interface PulseMcpServer {
  id: string;
  name: string;
  short_description: string | null;
  package_registry: string | null;
  package_name: string | null;
  package_canonical_name: string | null;
  github_stars: number;
}

interface PulseMcpSearchResponse {
  servers: PulseMcpServer[];
  total_count: number;
}

function parseJson(value: string): Record<string, unknown> | null {
  if (!value.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function isValidJson(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function buildMcpEntry(server: PulseMcpServer): Record<string, unknown> {
  const identifier =
    server.package_canonical_name ?? server.package_name ?? server.name;
  if (server.package_registry === "pypi") {
    return { command: "uvx", args: [identifier] };
  }
  return { command: "npx", args: ["-y", identifier] };
}

function deriveMcpKey(server: PulseMcpServer): string {
  return server.name.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
}

function AddServerDialog({
  onAdd,
}: {
  onAdd: (server: PulseMcpServer) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PulseMcpServer[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      return;
    }
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setSearching(true);
    const timer = setTimeout(() => {
      void fetch(
        `/api/mcp-registry/search?q=${encodeURIComponent(query.trim())}`,
      )
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as PulseMcpSearchResponse;
          setResults(data.servers ?? []);
        })
        .catch(() => {
          toast.error("Search failed");
        })
        .finally(() => {
          setSearching(false);
        });
    }, 400);

    return () => {
      clearTimeout(timer);
    };
  }, [query, open]);

  const handleSelect = (server: PulseMcpServer) => {
    onAdd(server);
    setOpen(false);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Sunucu Ekle
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>MCP Sunucusu Ekle</DialogTitle>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus
              placeholder="Search MCP servers…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="min-h-[200px]">
            {searching && (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm">Searching…</span>
              </div>
            )}

            {!searching && query.trim() && results.length === 0 && (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                No servers found
              </div>
            )}

            {!searching && results.length > 0 && (
              <ScrollArea className="h-[200px] -mx-4 px-4">
                <div className="space-y-1">
                  {results.map((server) => (
                    <button
                      key={server.id}
                      type="button"
                      onClick={() => handleSelect(server)}
                      className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">
                          {server.name}
                        </span>
                        {server.package_registry && (
                          <span className="text-xs text-muted-foreground shrink-0 bg-muted px-1.5 py-0.5 rounded">
                            {server.package_registry}
                          </span>
                        )}
                      </div>
                      {server.short_description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {server.short_description}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}

            {!searching && !query.trim() && (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                Type to search PulseMCP registry
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function McpTab({
  agent,
  onSave,
}: {
  agent: Agent;
  onSave: (updates: Partial<Agent>) => Promise<void>;
}) {
  const [text, setText] = useState(
    agent.mcp_config != null
      ? JSON.stringify(agent.mcp_config, null, 2)
      : "",
  );
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const originalText =
    agent.mcp_config != null
      ? JSON.stringify(agent.mcp_config, null, 2)
      : "";

  const dirty = text !== originalText;
  const jsonError = !isValidJson(text);

  const handleSave = async () => {
    if (jsonError) {
      toast.error("Invalid JSON — fix errors before saving");
      return;
    }
    setSaving(true);
    try {
      await onSave({ mcp_config: parseJson(text) });
      toast.success("MCP config saved");
    } catch {
      toast.error("Failed to save MCP config");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await onSave({ mcp_config: null });
      setText("");
      toast.success("MCP config cleared");
    } catch {
      toast.error("Failed to clear MCP config");
    } finally {
      setClearing(false);
    }
  };

  const handleAddServer = (server: PulseMcpServer) => {
    const key = deriveMcpKey(server);
    const entry = buildMcpEntry(server);

    const existing = parseJson(text) ?? {};
    const existingMcpServers =
      typeof existing.mcpServers === "object" &&
      existing.mcpServers !== null &&
      !Array.isArray(existing.mcpServers)
        ? (existing.mcpServers as Record<string, unknown>)
        : {};

    const merged: Record<string, unknown> = {
      ...existing,
      mcpServers: { ...existingMcpServers, [key]: entry },
    };

    setText(JSON.stringify(merged, null, 2));
    toast.success(`Added "${server.name}" to config`);
  };

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <Label className="text-xs text-muted-foreground">MCP Config</Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          JSON configuration for Model Context Protocol servers available to this agent.
        </p>
      </div>

      <div className="space-y-1">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'{\n  "mcpServers": {\n    "example": {\n      "command": "npx",\n      "args": ["-y", "@example/mcp-server"]\n    }\n  }\n}'}
          className={`min-h-[240px] font-mono text-xs resize-y ${jsonError && text.trim() ? "border-destructive focus-visible:ring-destructive" : ""}`}
          spellCheck={false}
        />
        {jsonError && text.trim() && (
          <p className="text-xs text-destructive">Invalid JSON object</p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          onClick={handleSave}
          disabled={!dirty || jsonError || saving}
          size="sm"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1.5" />
          )}
          Save
        </Button>
        {agent.mcp_config != null && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={clearing || saving}
          >
            {clearing ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            Clear
          </Button>
        )}
        <AddServerDialog onAdd={handleAddServer} />
      </div>
    </div>
  );
}
