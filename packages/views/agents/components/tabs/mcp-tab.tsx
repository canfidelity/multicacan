"use client";

import { useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import type { Agent } from "@multica/core/types";
import { Button } from "@multica/ui/components/ui/button";
import { Label } from "@multica/ui/components/ui/label";
import { Textarea } from "@multica/ui/components/ui/textarea";
import { toast } from "sonner";

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

      <div className="flex items-center gap-2">
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
      </div>
    </div>
  );
}
