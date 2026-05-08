"use client";

import { useRef, useState } from "react";
import { Images, Upload, Trash2, Tag, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceId } from "@multicacan/core/hooks";
import { api } from "@multicacan/core/api";
import { assetListOptions, workspaceKeys } from "@multicacan/core/workspace/queries";
import type { WorkspaceAsset } from "@multicacan/core/types";
import { Button } from "@multicacan/ui/components/ui/button";
import { Input } from "@multicacan/ui/components/ui/input";
import { Badge } from "@multicacan/ui/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@multicacan/ui/components/ui/dialog";
import { PageHeader } from "../../layout/page-header";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(contentType: string) {
  return contentType.startsWith("image/");
}

// ---------------------------------------------------------------------------
// Upload dialog
// ---------------------------------------------------------------------------

function UploadDialog({
  open,
  onClose,
  wsId,
}: {
  open: boolean;
  onClose: () => void;
  wsId: string;
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const upload = useMutation({
    mutationFn: (f: File) =>
      api.uploadAsset(f, {
        name: name || f.name,
        description,
        tags: tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.assets(wsId) });
      onClose();
      setFile(null);
      setName("");
      setDescription("");
      setTagsInput("");
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      if (!name) setName(f.name);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Asset</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              {file ? file.name : "Choose file"}
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Asset name"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Tags</label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Comma-separated: template, background, brand"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!file || upload.isPending}
            onClick={() => file && upload.mutate(file)}
          >
            {upload.isPending ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Asset card
// ---------------------------------------------------------------------------

function AssetCard({
  asset,
  onDelete,
}: {
  asset: WorkspaceAsset;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="group relative rounded-lg border bg-card overflow-hidden">
      {/* Preview */}
      <div className="h-36 bg-muted flex items-center justify-center overflow-hidden">
        {isImage(asset.content_type) ? (
          <img
            src={asset.download_url}
            alt={asset.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <Images className="h-8 w-8" />
            <span className="text-xs">{asset.content_type}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <p className="text-sm font-medium truncate" title={asset.name}>
          {asset.name}
        </p>
        {asset.description && (
          <p className="text-xs text-muted-foreground truncate">{asset.description}</p>
        )}
        <div className="flex flex-wrap gap-1">
          {asset.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
              {tag}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{formatBytes(asset.size_bytes)}</p>
      </div>

      {/* Delete button */}
      <button
        type="button"
        className="absolute top-2 right-2 size-6 rounded-md bg-background/80 backdrop-blur-sm flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
        onClick={() => onDelete(asset.id)}
        aria-label="Delete asset"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      {/* Download link */}
      <a
        href={asset.download_url}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-0 left-0 right-0 top-0 opacity-0"
        aria-hidden
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AssetsPage() {
  const wsId = useWorkspaceId() ?? "";
  const queryClient = useQueryClient();
  const [tagFilter, setTagFilter] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: assets = [], isLoading } = useQuery(
    assetListOptions(wsId, tagFilter || undefined),
  );

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteAsset(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.assets(wsId) });
    },
  });

  // Collect unique tags from all assets for quick filter chips
  const allTags = [...new Set(assets.flatMap((a) => a.tags))].sort();

  return (
    <div className="flex flex-col h-full">
      <PageHeader className="justify-between px-5">
        <div className="flex items-center gap-2">
          <Images className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-medium">Assets</h1>
          {assets.length > 0 && (
            <span className="font-mono text-xs tabular-nums text-muted-foreground/70">
              {assets.length}
            </span>
          )}
        </div>
        <Button size="sm" onClick={() => setUploadOpen(true)}>
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          Upload
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-4 space-y-5">
          {/* Tag filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setTagFilter("")}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  tagFilter === ""
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-foreground/30"
                }`}
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTagFilter(tag === tagFilter ? "" : tag)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    tagFilter === tag
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            {tagFilter && (
              <button
                type="button"
                onClick={() => setTagFilter("")}
                className="ml-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Grid */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-lg border bg-muted animate-pulse h-52" />
              ))}
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Images className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm font-medium text-muted-foreground">
                {tagFilter ? `No assets tagged "${tagFilter}"` : "No assets yet"}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Upload images, templates, and other media for your agents to use
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={() => setUploadOpen(true)}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Upload first asset
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {assets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onDelete={(id) => deleteMut.mutate(id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        wsId={wsId}
      />
    </div>
  );
}
