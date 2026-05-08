"use client";

import { X } from "lucide-react";
import { cn } from "@multicacan/ui/lib/utils";

export interface OpenFile {
  path: string;
  dirty: boolean;
}

interface EditorTabsProps {
  files: OpenFile[];
  active: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

export function EditorTabs({ files, active, onSelect, onClose }: EditorTabsProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex h-9 items-center overflow-x-auto border-b bg-muted/30 shrink-0">
      {files.map((f) => {
        const name = f.path.split("/").pop() ?? f.path;
        return (
          <button
            key={f.path}
            onClick={() => onSelect(f.path)}
            className={cn(
              "flex h-full items-center gap-1.5 border-r px-3 text-xs whitespace-nowrap transition-colors shrink-0",
              f.path === active
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:bg-background/50"
            )}
          >
            <span>{name}</span>
            {f.dirty && <span className="text-blue-400">•</span>}
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onClose(f.path); }}
              className="ml-0.5 rounded p-0.5 hover:bg-muted"
            >
              <X className="size-3" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
