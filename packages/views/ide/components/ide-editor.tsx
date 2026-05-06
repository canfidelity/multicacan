"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { Loader2 } from "lucide-react";

const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript",
  js: "javascript", jsx: "javascript",
  go: "go", py: "python", rs: "rust",
  json: "json", md: "markdown",
  html: "html", css: "css", scss: "css",
  sh: "shell", bash: "shell",
  yaml: "yaml", yml: "yaml",
  toml: "toml", sql: "sql",
  rb: "ruby", java: "java", kt: "kotlin",
  swift: "swift", c: "c", cpp: "cpp",
  cs: "csharp", php: "php",
};

function langFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? "plaintext";
}

interface IDEEditorProps {
  wsId: string;
  path: string;
  onDirtyChange: (path: string, dirty: boolean) => void;
  /** Increment to force a reload from disk (e.g. after agent edits the file). */
  refreshKey?: number;
}

export function IDEEditor({ wsId, path, onDirtyChange, refreshKey }: IDEEditorProps) {
  const [value, setValue] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const savedRef = useRef<string>("");
  const dirtyRef = useRef(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/native-ide/${wsId}/file?path=${encodeURIComponent(path)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        const text = atob(d.content ?? "");
        setValue(text);
        savedRef.current = text;
        dirtyRef.current = false;
        onDirtyChange(path, false);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [wsId, path, refreshKey]);

  const save = useCallback(async (content: string) => {
    const encoded = btoa(unescape(encodeURIComponent(content)));
    await fetch(`/api/native-ide/${wsId}/file?path=${encodeURIComponent(path)}`, {
      method: "PUT",
      body: encoded,
    });
    savedRef.current = content;
    dirtyRef.current = false;
    onDirtyChange(path, false);
  }, [wsId, path, onDirtyChange]);

  const handleChange = useCallback((v: string | undefined) => {
    const content = v ?? "";
    setValue(content);
    const isDirty = content !== savedRef.current;
    if (isDirty !== dirtyRef.current) {
      dirtyRef.current = isDirty;
      onDirtyChange(path, isDirty);
    }
  }, [path, onDirtyChange]);

  const handleMount = useCallback((editor: any, monaco: any) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      save(editor.getValue());
    });
  }, [save]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      theme="vs-dark"
      language={langFromPath(path)}
      value={value}
      onChange={handleChange}
      onMount={handleMount}
      options={{
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: "on",
        tabSize: 2,
        renderWhitespace: "none",
      }}
      loading={
        <div className="flex h-full items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      }
    />
  );
}
