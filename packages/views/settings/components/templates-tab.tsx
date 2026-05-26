"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useWorkspaceId } from "@multicacan/core/hooks";
import { api } from "@multicacan/core/api";
import {
  issueTemplateListOptions,
  issueTemplateKeys,
} from "@multicacan/core/issues/template-queries";
import type { IssueTemplate } from "@multicacan/core/types";
import { Button } from "@multicacan/ui/components/ui/button";
import { Input } from "@multicacan/ui/components/ui/input";
import { Textarea } from "@multicacan/ui/components/ui/textarea";
import { Card, CardContent } from "@multicacan/ui/components/ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@multicacan/ui/components/ui/alert-dialog";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@multicacan/ui/components/ui/empty";
import { toast } from "sonner";
import { useT } from "../../i18n";

interface TemplateFormState {
  name: string;
  description: string;
  default_status: string;
  default_priority: string;
}

const EMPTY_FORM: TemplateFormState = {
  name: "",
  description: "",
  default_status: "",
  default_priority: "",
};

export function TemplatesTab() {
  const { t } = useT("settings");
  const wsId = useWorkspaceId();
  const qc = useQueryClient();

  const [editing, setEditing] = useState<IssueTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<TemplateFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<IssueTemplate | null>(null);

  const { data: templates = [] } = useQuery(issueTemplateListOptions(wsId));

  const invalidate = () => qc.invalidateQueries({ queryKey: issueTemplateKeys.list(wsId) });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createIssueTemplate({
        name: form.name,
        description: form.description || undefined,
        default_status: form.default_status || undefined,
        default_priority: form.default_priority || undefined,
      }),
    onSuccess: () => {
      toast.success(t(($) => $.templates.toast_created));
      invalidate();
      setCreating(false);
      setForm(EMPTY_FORM);
    },
    onError: () => toast.error(t(($) => $.templates.toast_create_failed)),
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) =>
      api.updateIssueTemplate(id, {
        name: form.name,
        description: form.description || undefined,
        default_status: form.default_status || undefined,
        default_priority: form.default_priority || undefined,
      }),
    onSuccess: () => {
      toast.success(t(($) => $.templates.toast_updated));
      invalidate();
      setEditing(null);
      setForm(EMPTY_FORM);
    },
    onError: () => toast.error(t(($) => $.templates.toast_update_failed)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteIssueTemplate(id),
    onSuccess: () => {
      toast.success(t(($) => $.templates.toast_deleted));
      invalidate();
      setDeleteTarget(null);
    },
    onError: () => toast.error(t(($) => $.templates.toast_delete_failed)),
  });

  const startCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setCreating(true);
  };

  const startEdit = (tmpl: IssueTemplate) => {
    setCreating(false);
    setForm({
      name: tmpl.name,
      description: tmpl.description,
      default_status: tmpl.default_status ?? "",
      default_priority: tmpl.default_priority ?? "",
    });
    setEditing(tmpl);
  };

  const cancelForm = () => {
    setCreating(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">{t(($) => $.templates.section_title)}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t(($) => $.templates.description)}</p>
        </div>
        {!creating && !editing && (
          <Button size="sm" onClick={startCreate}>
            <Plus className="h-4 w-4 mr-1" />
            {t(($) => $.templates.create_button)}
          </Button>
        )}
      </div>

      {(creating || editing) && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Input
              placeholder={t(($) => $.templates.name_placeholder)}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Textarea
              placeholder={t(($) => $.templates.description_placeholder)}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={4}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!form.name.trim() || isSubmitting}
                onClick={() => (editing ? updateMutation.mutate(editing.id) : createMutation.mutate())}
              >
                {isSubmitting ? t(($) => $.templates.saving) : t(($) => $.templates.save)}
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelForm}>
                {t(($) => $.templates.cancel)}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {templates.length === 0 && !creating ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText className="h-4 w-4" />
            </EmptyMedia>
            <EmptyTitle>{t(($) => $.templates.empty)}</EmptyTitle>
            <EmptyDescription>{t(($) => $.templates.description)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          {templates.map((tmpl) => (
            <Card key={tmpl.id}>
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{tmpl.name}</p>
                  {tmpl.description && (
                    <p className="text-xs text-muted-foreground truncate">{tmpl.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t(($) => $.templates.edit_aria)}
                    onClick={() => startEdit(tmpl)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t(($) => $.templates.delete_aria)}
                    onClick={() => setDeleteTarget(tmpl)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(($) => $.templates.delete_confirm_title)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(($) => $.templates.delete_confirm_description).replace("{{name}}", deleteTarget?.name ?? "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(($) => $.templates.delete_confirm_cancel)}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {t(($) => $.templates.delete_confirm_action)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
