"use client";

import { useState } from "react";
import { Loader2, Save, Trash2, Server } from "lucide-react";
import type { Agent } from "@multica/core/types";
import { Button } from "@multica/ui/components/ui/button";
import { Label } from "@multica/ui/components/ui/label";
import { Textarea } from "@multica/ui/components/ui/textarea";
import { toast } from "sonner";

const PLACEHOLDER = JSON.stringify(
  {
    mcpServers: {
      filesystem: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
      },
    },
  },
  null,
  2,
);

function toJsonString(value: Record<string, unknown> | null): string {
  if (!value) return "";
  return JSON.stringify(value, null, 2);
}

export function McpTab({
  agent,
  readOnly = false,
  onSave,
}: {
  agent: Agent;
  readOnly?: boolean;
  onSave: (updates: Partial<Agent>) => Promise<void>;
}) {
  const [text, setText] = useState(() => toJsonString(agent.mcp_config));
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const original = toJsonString(agent.mcp_config);
  const dirty = text !== original;

  const handleChange = (value: string) => {
    setText(value);
    if (!value.trim()) {
      setJsonError(null);
      return;
    }
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  const handleSave = async () => {
    if (!text.trim()) {
      toast.error("Enter a valid MCP config JSON or use Clear to remove it");
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
      return;
    }
    setSaving(true);
    try {
      await onSave({ mcp_config: parsed });
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
      setJsonError(null);
      toast.success("MCP config cleared");
    } catch {
      toast.error("Failed to clear MCP config");
    } finally {
      setClearing(false);
    }
  };

  if (readOnly) {
    return (
      <div className="max-w-lg space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5" />
            MCP Config
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            MCP server configuration is hidden — only the agent owner or workspace admin can view and edit it.
          </p>
        </div>
        {agent.mcp_config !== null ? (
          <p className="text-xs text-muted-foreground italic">MCP config is set (hidden).</p>
        ) : (
          <p className="text-xs text-muted-foreground italic">No MCP config configured.</p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Server className="h-3.5 w-3.5" />
          MCP Config
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          JSON object defining MCP servers passed to the agent via{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
            --mcp-config
          </code>
          . See the{" "}
          <a
            href="https://modelcontextprotocol.io/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            MCP docs
          </a>{" "}
          for available servers.
        </p>
      </div>

      <div className="space-y-1.5">
        <Textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={14}
          className="font-mono text-xs resize-none"
          spellCheck={false}
        />
        {jsonError && (
          <p className="text-xs text-destructive">{jsonError}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={handleSave}
          disabled={!dirty || saving || !!jsonError || !text.trim()}
          size="sm"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1.5" />
          )}
          Save
        </Button>
        {agent.mcp_config !== null && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={clearing}
          >
            {clearing ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
