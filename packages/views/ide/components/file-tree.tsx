"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Loader2,
} from "lucide-react";

interface Entry {
  name: string;
  dir: boolean;
  size: number;
}

interface FileTreeNodeProps {
  wsId: string;
  path: string;
  name: string;
  isDir: boolean;
  depth: number;
  onFileOpen: (path: string) => void;
}

function FileTreeNode({ wsId, path, name, isDir, depth, onFileOpen }: FileTreeNodeProps) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(async () => {
    if (!isDir) {
      onFileOpen(path);
      return;
    }
    if (!open && children.length === 0) {
      setLoading(true);
      try {
        const res = await fetch(`/api/native-ide/${wsId}/files?path=${encodeURIComponent(path)}`);
        if (res.ok) {
          const data = await res.json();
          setChildren((data.entries ?? []).sort((a: Entry, b: Entry) => {
            if (a.dir !== b.dir) return a.dir ? -1 : 1;
            return a.name.localeCompare(b.name);
          }));
        }
      } finally {
        setLoading(false);
      }
    }
    setOpen((v) => !v);
  }, [isDir, open, children.length, wsId, path, onFileOpen]);

  return (
    <div>
      <button
        onClick={toggle}
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-muted transition-colors"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {isDir ? (
          open ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="size-3 shrink-0" />
        )}
        {isDir ? (
          open ? (
            <FolderOpen className="size-3.5 shrink-0 text-blue-400" />
          ) : (
            <Folder className="size-3.5 shrink-0 text-blue-400" />
          )
        ) : (
          <File className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{name}</span>
        {loading && <Loader2 className="size-3 animate-spin ml-auto shrink-0 text-muted-foreground" />}
      </button>
      {open && (
        <div>
          {children.map((c) => (
            <FileTreeNode
              key={c.name}
              wsId={wsId}
              path={`${path}/${c.name}`}
              name={c.name}
              isDir={c.dir}
              depth={depth + 1}
              onFileOpen={onFileOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FileTreeProps {
  wsId: string;
  rootPath?: string;
  onFileOpen: (path: string) => void;
}

export function FileTree({ wsId, rootPath, onFileOpen }: FileTreeProps) {
  const [roots, setRoots] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const base = rootPath ?? "/";

  useEffect(() => {
    setLoading(true);
    setRoots([]);
    fetch(`/api/native-ide/${wsId}/files?path=${encodeURIComponent(base)}`)
      .then((r) => r.json())
      .then((d) => {
        setRoots(
          (d.entries ?? []).sort((a: Entry, b: Entry) => {
            if (a.dir !== b.dir) return a.dir ? -1 : 1;
            return a.name.localeCompare(b.name);
          })
        );
      })
      .finally(() => setLoading(false));
  }, [wsId, base]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (roots.length === 0) {
    return (
      <div className="flex items-center justify-center p-4 text-xs text-muted-foreground">
        No files
      </div>
    );
  }

  return (
    <div className="overflow-auto p-1">
      {roots.map((e) => (
        <FileTreeNode
          key={e.name}
          wsId={wsId}
          path={`${base === "/" ? "" : base}/${e.name}`}
          name={e.name}
          isDir={e.dir}
          depth={0}
          onFileOpen={onFileOpen}
        />
      ))}
    </div>
  );
}
