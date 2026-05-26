"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Webhook, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useWorkspaceId } from "@multicacan/core/hooks";
import { api } from "@multicacan/core/api";
import {
  outboundWebhookListOptions,
  outboundWebhookDeliveriesOptions,
  outboundWebhookKeys,
} from "@multicacan/core/issues/webhook-queries";
import type { OutboundWebhook } from "@multicacan/core/types";
import { OUTBOUND_WEBHOOK_EVENTS } from "@multicacan/core/types";
import { Button } from "@multicacan/ui/components/ui/button";
import { Input } from "@multicacan/ui/components/ui/input";
import { Card, CardContent } from "@multicacan/ui/components/ui/card";
import { Badge } from "@multicacan/ui/components/ui/badge";
import { Checkbox } from "@multicacan/ui/components/ui/checkbox";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@multicacan/ui/components/ui/dialog";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@multicacan/ui/components/ui/empty";
import { toast } from "sonner";
import { useT } from "../../i18n";
import { useTimeAgo } from "../../inbox/components/inbox-list-item";

interface WebhookFormState {
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
}

const EMPTY_FORM: WebhookFormState = {
  url: "",
  secret: "",
  events: [...OUTBOUND_WEBHOOK_EVENTS],
  is_active: true,
};

function DeliveriesDialog({ webhook, wsId, onClose }: { webhook: OutboundWebhook; wsId: string; onClose: () => void }) {
  const { t } = useT("settings");
  const timeAgo = useTimeAgo();
  const { data: deliveries = [] } = useQuery(outboundWebhookDeliveriesOptions(wsId, webhook.id));

  const STATUS_ICON = {
    delivered: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    failed: <XCircle className="h-4 w-4 text-destructive" />,
    pending: <Clock className="h-4 w-4 text-muted-foreground" />,
  } as const;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(($) => $.webhooks.deliveries_title)}</DialogTitle>
        </DialogHeader>
        {deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{t(($) => $.webhooks.deliveries_empty)}</p>
        ) : (
          <div className="space-y-2">
            {deliveries.map((d) => (
              <div key={d.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                {STATUS_ICON[d.status] ?? STATUS_ICON.pending}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{d.event}</p>
                  {d.error && <p className="text-xs text-destructive truncate">{d.error}</p>}
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {d.status_code && <span className="mr-2">{d.status_code}</span>}
                  {timeAgo(d.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function WebhooksTab() {
  const { t } = useT("settings");
  const wsId = useWorkspaceId();
  const qc = useQueryClient();

  const [editing, setEditing] = useState<OutboundWebhook | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<WebhookFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<OutboundWebhook | null>(null);
  const [viewDeliveries, setViewDeliveries] = useState<OutboundWebhook | null>(null);

  const { data: webhooks = [] } = useQuery(outboundWebhookListOptions(wsId));

  const invalidate = () => qc.invalidateQueries({ queryKey: outboundWebhookKeys.list(wsId) });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createOutboundWebhook({
        url: form.url,
        events: form.events,
        secret: form.secret || undefined,
      }),
    onSuccess: () => {
      toast.success(t(($) => $.webhooks.toast_created));
      invalidate();
      setCreating(false);
      setForm(EMPTY_FORM);
    },
    onError: () => toast.error(t(($) => $.webhooks.toast_create_failed)),
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) =>
      api.updateOutboundWebhook(id, {
        url: form.url,
        events: form.events,
        secret: form.secret || undefined,
        is_active: form.is_active,
      }),
    onSuccess: () => {
      toast.success(t(($) => $.webhooks.toast_updated));
      invalidate();
      setEditing(null);
      setForm(EMPTY_FORM);
    },
    onError: () => toast.error(t(($) => $.webhooks.toast_update_failed)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteOutboundWebhook(id),
    onSuccess: () => {
      toast.success(t(($) => $.webhooks.toast_deleted));
      invalidate();
      setDeleteTarget(null);
    },
    onError: () => toast.error(t(($) => $.webhooks.toast_delete_failed)),
  });

  const startCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setCreating(true);
  };

  const startEdit = (wh: OutboundWebhook) => {
    setCreating(false);
    setForm({ url: wh.url, secret: "", events: wh.events, is_active: wh.is_active });
    setEditing(wh);
  };

  const cancelForm = () => {
    setCreating(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const toggleEvent = (ev: string) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev],
    }));
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">{t(($) => $.webhooks.section_title)}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t(($) => $.webhooks.description)}</p>
        </div>
        {!creating && !editing && (
          <Button size="sm" onClick={startCreate}>
            <Plus className="h-4 w-4 mr-1" />
            {t(($) => $.webhooks.create_button)}
          </Button>
        )}
      </div>

      {(creating || editing) && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Input
              placeholder={t(($) => $.webhooks.url_placeholder)}
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            />
            <Input
              type="password"
              placeholder={t(($) => $.webhooks.secret_placeholder)}
              value={form.secret}
              onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">{t(($) => $.webhooks.secret_hint)}</p>
            <div>
              <p className="text-sm font-medium mb-2">{t(($) => $.webhooks.events_label)}</p>
              <div className="grid grid-cols-2 gap-2">
                {OUTBOUND_WEBHOOK_EVENTS.map((ev) => (
                  <label key={ev} className="flex items-center gap-2 cursor-pointer select-none">
                    <Checkbox
                      checked={form.events.includes(ev)}
                      onCheckedChange={() => toggleEvent(ev)}
                    />
                    <span className="text-sm">{t(($) => ($.webhooks.events as Record<string, string>)[ev] ?? ev)}</span>
                  </label>
                ))}
              </div>
            </div>
            {editing && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: !!v }))}
                />
                <span className="text-sm">{t(($) => $.webhooks.active_label)}</span>
              </label>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!form.url.trim() || form.events.length === 0 || isSubmitting}
                onClick={() => (editing ? updateMutation.mutate(editing.id) : createMutation.mutate())}
              >
                {isSubmitting ? t(($) => $.webhooks.saving) : t(($) => $.webhooks.save)}
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelForm}>
                {t(($) => $.webhooks.cancel)}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {webhooks.length === 0 && !creating ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Webhook className="h-4 w-4" />
            </EmptyMedia>
            <EmptyTitle>{t(($) => $.webhooks.empty)}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          {webhooks.map((wh) => (
            <Card key={wh.id}>
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm truncate">{wh.url}</p>
                  <div className="flex gap-1 flex-wrap mt-1">
                    {!wh.is_active && (
                      <Badge variant="secondary" className="text-xs">inactive</Badge>
                    )}
                    {wh.events.slice(0, 3).map((ev) => (
                      <Badge key={ev} variant="outline" className="text-xs">{ev}</Badge>
                    ))}
                    {wh.events.length > 3 && (
                      <Badge variant="outline" className="text-xs">+{wh.events.length - 3}</Badge>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setViewDeliveries(wh)}
                  >
                    {t(($) => $.webhooks.deliveries_title)}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t(($) => $.webhooks.edit_aria)}
                    onClick={() => startEdit(wh)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t(($) => $.webhooks.delete_aria)}
                    onClick={() => setDeleteTarget(wh)}
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
            <AlertDialogTitle>{t(($) => $.webhooks.delete_confirm_title)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(($) => $.webhooks.delete_confirm_description)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(($) => $.webhooks.delete_confirm_cancel)}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {t(($) => $.webhooks.delete_confirm_action)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {viewDeliveries && (
        <DeliveriesDialog
          webhook={viewDeliveries}
          wsId={wsId}
          onClose={() => setViewDeliveries(null)}
        />
      )}
    </div>
  );
}
