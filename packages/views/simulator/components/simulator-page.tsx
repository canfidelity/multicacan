"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Smartphone, RefreshCw } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { PageHeader } from "../../layout/page-header";
import { ActorAvatar } from "../../common/actor-avatar";
import { api } from "@multica/core/api";
import { useQuery } from "@tanstack/react-query";
import { useWSEvent } from "@multica/core/realtime";
import { useWorkspaceId } from "@multica/core/hooks";
import type { TaskMessagePayload } from "@multica/core/types/events";
import type { AgentTask } from "@multica/core/types/agent";
import {
  buildTimeline,
  latestSimulatorAction,
  type TimelineItem,
} from "../../common/task-transcript";

// ─── Types ───

interface SimulatorState {
  port: number;
  device: string;
  url: string;
  streamUrl: string;
  wsUrl: string;
}

interface SimDevice {
  udid: string;
  name: string;
  state: string;
  runtime: string;
}

// ─── Exec helper ───

function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith("multica_csrf="));
  return match ? match.split("=")[1] ?? null : null;
}

async function execOnHost(command: string, workspaceId?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const csrf = readCsrfToken();
  if (csrf) headers["X-CSRF-Token"] = csrf;
  const url = workspaceId
    ? `/api/simulator/exec?workspace_id=${encodeURIComponent(workspaceId)}`
    : "/api/simulator/exec";
  const res = await fetch(url, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ command }),
  });
  return res.json();
}

// ─── Device list ───

function parseSimctlList(stdout: string): SimDevice[] {
  try {
    const parsed = JSON.parse(stdout);
    const out: SimDevice[] = [];
    for (const [runtime, devs] of Object.entries<any[]>(parsed.devices ?? {})) {
      const runtimeName = runtime
        .replace(/^com\.apple\.CoreSimulator\.SimRuntime\./, "")
        .replace(/-/g, ".");
      for (const d of devs) {
        if (d.isAvailable) {
          out.push({ udid: d.udid, name: d.name, state: d.state, runtime: runtimeName });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

// ─── Native Capture WebSocket (single WS for both frames + input) ───

function useNativeSimulator(wsUrl: string | null) {
  const [frame, setFrame] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!wsUrl) { setStreaming(false); return; }

    let destroyed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 2000;

    const connect = () => {
      if (destroyed) return;
      setStreaming(false);

      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => { retryDelay = 2000; }; // başarılı bağlantıda backoff'u sıfırla

      ws.onclose = () => {
        wsRef.current = null;
        setStreaming(false);
        if (!destroyed) {
          // Otomatik yeniden bağlan — relay geçici koparsa tekrar dener
          retryTimer = setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 1.5, 15000); // max 15s backoff
        }
      };

      ws.onerror = () => setStreaming(false);

      ws.onmessage = (e) => {
        if (!(e.data instanceof ArrayBuffer)) return;
        setStreaming(true);
        const blob = new Blob([e.data], { type: "image/jpeg" });
        const blobUrl = URL.createObjectURL(blob);
        setFrame((prev) => { if (prev) URL.revokeObjectURL(prev); return blobUrl; });
      };
    };

    connect();

    return () => {
      destroyed = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [wsUrl]);

  const sendTouch = useCallback((type: "begin" | "move" | "end", x: number, y: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const json = new TextEncoder().encode(JSON.stringify({ type, x, y }));
    const msg = new Uint8Array(1 + json.length);
    msg[0] = 0x03; // TOUCH tag
    msg.set(json, 1);
    ws.send(msg);
  }, []);

  const sendButton = useCallback((button: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const json = new TextEncoder().encode(JSON.stringify({ button }));
    const msg = new Uint8Array(1 + json.length);
    msg[0] = 0x04; // BUTTON tag
    msg.set(json, 1);
    ws.send(msg);
  }, []);

  const sendKey = useCallback((type: "down" | "up", usage: number) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const json = new TextEncoder().encode(JSON.stringify({ type, usage }));
    const msg = new Uint8Array(1 + json.length);
    msg[0] = 0x06; // KEY tag
    msg.set(json, 1);
    ws.send(msg);
  }, []);

  return { frame, streaming, sendTouch, sendButton, sendKey };
}

// ─── HID Keyboard Usage Codes ───

// e.key → HID usage (mobil sanal klavye için — e.code çoğunlukla boş gelir)
const CHAR_TO_HID: Record<string, number> = {
  a: 0x04, b: 0x05, c: 0x06, d: 0x07, e: 0x08, f: 0x09,
  g: 0x0a, h: 0x0b, i: 0x0c, j: 0x0d, k: 0x0e, l: 0x0f,
  m: 0x10, n: 0x11, o: 0x12, p: 0x13, q: 0x14, r: 0x15,
  s: 0x16, t: 0x17, u: 0x18, v: 0x19, w: 0x1a, x: 0x1b,
  y: 0x1c, z: 0x1d,
  "1": 0x1e, "2": 0x1f, "3": 0x20, "4": 0x21, "5": 0x22,
  "6": 0x23, "7": 0x24, "8": 0x25, "9": 0x26, "0": 0x27,
  " ": 0x2c, "-": 0x2d, "=": 0x2e, "[": 0x2f, "]": 0x30,
  ";": 0x33, "'": 0x34, "`": 0x35, ",": 0x36, ".": 0x37, "/": 0x38,
  Enter: 0x28, Backspace: 0x2a,
};

const HID_USAGE: Record<string, number> = {
  KeyA: 0x04, KeyB: 0x05, KeyC: 0x06, KeyD: 0x07, KeyE: 0x08, KeyF: 0x09,
  KeyG: 0x0a, KeyH: 0x0b, KeyI: 0x0c, KeyJ: 0x0d, KeyK: 0x0e, KeyL: 0x0f,
  KeyM: 0x10, KeyN: 0x11, KeyO: 0x12, KeyP: 0x13, KeyQ: 0x14, KeyR: 0x15,
  KeyS: 0x16, KeyT: 0x17, KeyU: 0x18, KeyV: 0x19, KeyW: 0x1a, KeyX: 0x1b,
  KeyY: 0x1c, KeyZ: 0x1d,
  Digit1: 0x1e, Digit2: 0x1f, Digit3: 0x20, Digit4: 0x21, Digit5: 0x22,
  Digit6: 0x23, Digit7: 0x24, Digit8: 0x25, Digit9: 0x26, Digit0: 0x27,
  Enter: 0x28, Escape: 0x29, Backspace: 0x2a, Tab: 0x2b, Space: 0x2c,
  Minus: 0x2d, Equal: 0x2e, BracketLeft: 0x2f, BracketRight: 0x30,
  Backslash: 0x31, Semicolon: 0x33, Quote: 0x34, Backquote: 0x35,
  Comma: 0x36, Period: 0x37, Slash: 0x38,
  ArrowRight: 0x4f, ArrowLeft: 0x50, ArrowDown: 0x51, ArrowUp: 0x52,
  ShiftLeft: 0xe1, ShiftRight: 0xe5, ControlLeft: 0xe0, AltLeft: 0xe2,
  MetaLeft: 0xe3, MetaRight: 0xe7,
};

// ─── Toolbar (Multica theme + serve-sim style picker) ───

function groupByRuntime(devices: SimDevice[], currentUdid: string) {
  const grouped = new Map<string, SimDevice[]>();
  for (const d of devices) {
    if (d.udid === currentUdid) continue;
    let list = grouped.get(d.runtime);
    if (!list) { list = []; grouped.set(d.runtime, list); }
    list.push(d);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function Toolbar({
  deviceName,
  deviceRuntime,
  streaming,
  currentUdid,
  onHome,
  onScreenshot,
  onRotate,
  onKeyboard,
  keyboardActive,
  devices,
  stoppingUdids,
  onSelectDevice,
  onStopDevice,
  onRefreshDevices,
  devicesLoading,
}: {
  deviceName: string | null;
  deviceRuntime: string | null;
  streaming: boolean;
  currentUdid: string;
  onHome: () => void;
  onScreenshot: () => void;
  onRotate: () => void;
  onKeyboard: () => void;
  keyboardActive: boolean;
  devices: SimDevice[];
  stoppingUdids: Set<string>;
  onSelectDevice: (d: SimDevice) => void;
  onStopDevice: (udid: string) => void;
  onRefreshDevices: () => void;
  devicesLoading: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  const currentDevice = devices.find((d) => d.udid === currentUdid);
  const sortedGroups = groupByRuntime(devices, currentUdid);

  return (
    <div className="flex items-center justify-between w-full max-w-[380px] px-3 py-1.5 rounded-lg border border-border bg-muted/50">
      {/* Device title / picker */}
      <div ref={pickerRef} className="relative min-w-0">
        <button
          type="button"
          onClick={() => { onRefreshDevices(); setPickerOpen((o) => !o); }}
          className="flex flex-col items-start text-left bg-transparent border-none cursor-pointer p-0.5 -m-0.5 rounded hover:bg-accent min-w-0"
        >
          <span className="flex items-center gap-1 text-xs font-semibold truncate">
            {deviceName ?? "Simulator"}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0"><polyline points="6 9 12 15 18 9" /></svg>
          </span>
          <span className="text-[10px] text-muted-foreground truncate">{deviceRuntime?.replace(/\./g, " ") ?? "—"}</span>
        </button>

        {pickerOpen && (
          <div className="absolute top-full left-0 mt-1 min-w-[280px] max-h-[360px] overflow-y-auto bg-popover border border-border rounded-xl shadow-lg z-20 p-1 text-xs font-mono">
            {/* Header */}
            <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] text-muted-foreground">
              <span className="font-semibold">Simulators</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRefreshDevices(); }}
                disabled={devicesLoading}
                className="text-primary bg-transparent border-none cursor-pointer text-[11px] p-0 hover:underline disabled:opacity-50"
              >
                {devicesLoading ? "..." : "Refresh"}
              </button>
            </div>

            {/* Current device */}
            {currentDevice && (
              <>
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-primary">
                  <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0 bg-green-400" />
                  <span className="flex-1 truncate font-medium">{currentDevice.name}</span>
                </div>
                <div className="h-px bg-border mx-1 my-0.5" />
              </>
            )}

            {/* Grouped devices */}
            {devices.length === 0 && !devicesLoading && (
              <div className="p-3 text-center text-muted-foreground">No available simulators found</div>
            )}
            {sortedGroups.map(([runtime, devs]) => (
              <div key={runtime}>
                <div className="px-2.5 pt-2 pb-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{runtime}</div>
                {devs.map((d) => {
                  const isBooted = d.state === "Booted";
                  const isStopping = stoppingUdids.has(d.udid);
                  return (
                    <div
                      key={d.udid}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-accent"
                      onClick={() => { onSelectDevice(d); setPickerOpen(false); }}
                    >
                      <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isBooted ? "#4ade80" : "#555" }} />
                      <span className="flex-1 truncate">{d.name}</span>
                      {isBooted && (
                        <span
                          role="button"
                          onClick={(e) => { e.stopPropagation(); if (!isStopping) onStopDevice(d.udid); }}
                          className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer shrink-0"
                          style={{
                            color: isStopping ? "#888" : "#f87171",
                            background: isStopping ? "transparent" : "rgba(248,113,113,0.1)",
                          }}
                        >
                          {isStopping ? "Stopping..." : "Stop"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-0.5">
        <ToolbarBtn title="Home" disabled={!streaming} onClick={onHome}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" /></svg>
        </ToolbarBtn>
        <ToolbarBtn title="Screenshot" disabled={!streaming} onClick={onScreenshot}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="4" /></svg>
        </ToolbarBtn>
        <ToolbarBtn title="Rotate" disabled={!streaming} onClick={onRotate}>
          <svg width="12" height="12" viewBox="0 0 12 13" fill="currentColor"><path d="M10.2305 12.8077H4.42383C3.92383 12.8077 3.54688 12.6846 3.29297 12.4385C3.04297 12.1963 2.91797 11.8194 2.91797 11.3077V5.51274C2.91797 4.99711 3.04297 4.61821 3.29297 4.37602C3.54688 4.12993 3.92383 4.00688 4.42383 4.00688H10.2305C10.7344 4.00688 11.1113 4.12993 11.3613 4.37602C11.6113 4.61821 11.7363 4.99711 11.7363 5.51274V11.3077C11.7363 11.8194 11.6113 12.1963 11.3613 12.4385C11.1113 12.6846 10.7344 12.8077 10.2305 12.8077Z" /></svg>
        </ToolbarBtn>
        <ToolbarBtn title="Klavye" disabled={!streaming} onClick={onKeyboard}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={keyboardActive ? "hsl(var(--primary))" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
          </svg>
        </ToolbarBtn>
      </div>
    </div>
  );
}

function ToolbarBtn({ title, disabled, onClick, children }: {
  title: string; disabled?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center justify-center p-1.5 rounded-md border-none bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
    >
      {children}
    </button>
  );
}

// ─── Simulator Viewport ───

function SimulatorViewport({ state, onStateChange, switchingRef }: { state: SimulatorState; onStateChange: (s: SimulatorState) => void; switchingRef: React.MutableRefObject<boolean> }) {
  const workspaceId = useWorkspaceId();
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);
  const [keyboardActive, setKeyboardActive] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [deviceRuntime, setDeviceRuntime] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<string>("portrait");
  const [devices, setDevices] = useState<SimDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [stoppingUdids, setStoppingUdids] = useState<Set<string>>(new Set());

  // Active agent task running on this device
  const { data: activeTasks = [] } = useQuery({
    queryKey: ["agent-task-snapshot"],
    queryFn: () => api.getAgentTaskSnapshot(),
    refetchInterval: 5000,
  });
  const runningTask = useMemo(
    () => activeTasks.find((t: AgentTask) => t.status === "running" || t.status === "dispatched"),
    [activeTasks],
  );
  const [taskMessages, setTaskMessages] = useState<TaskMessagePayload[]>([]);
  const taskItems = useMemo(() => buildTimeline(taskMessages), [taskMessages]);
  const taskSimAction = useMemo(() => latestSimulatorAction(taskItems), [taskItems]);
  // Match task to this device: action UDID matches OR (no UDID detected, fallback to running)
  const activeAgentForDevice =
    runningTask &&
    taskSimAction &&
    (!taskSimAction.udid || taskSimAction.udid === state.device)
      ? runningTask
      : null;

  // Subscribe to live task messages for the running task
  useEffect(() => {
    if (!runningTask) { setTaskMessages([]); return; }
    let cancelled = false;
    api.listTaskMessages(runningTask.id).then((msgs) => {
      if (!cancelled) setTaskMessages(msgs);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [runningTask?.id]);

  useWSEvent("task:message", (payload: any) => {
    const msg = payload as TaskMessagePayload;
    if (!runningTask || msg.task_id !== runningTask.id) return;
    setTaskMessages((prev) => {
      if (prev.some((p) => p.seq === msg.seq)) return prev;
      return [...prev, msg];
    });
  });

  // Native WebSocket: single connection for ~60Hz frames + input
  const nativeWsUrl = switching ? null : (() => {
    const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = typeof window !== "undefined" ? window.location.host : "localhost:3000";
    return `${proto}//${host}/api/simulator/native?device=${state.device}&workspace_id=${workspaceId}`;
  })();
  const { frame, streaming, sendTouch, sendButton, sendKey } = useNativeSimulator(nativeWsUrl);
  // Klavye efektleri — hidden input odaklandığında çalışır
  useEffect(() => {
    const el = hiddenInputRef.current;
    if (!el) return;

    // Single keydown handler for all keys.
    // Uses e.key for printable chars (reliable on mobile — iOS always populates e.key
    // correctly even when e.code is wrong/empty) and e.code for non-printable keys.
    // Sends down+up together for printable chars (30ms apart) so mobile doesn't
    // need keyup (virtual keyboards don't reliably fire keyup).
    const onKeyDown = (e: KeyboardEvent) => {
      if (!streaming) return;
      if (e.key.length === 1) {
        // Printable character: use e.key (works on both PC and mobile virtual keyboard)
        const usage = CHAR_TO_HID[e.key.toLowerCase()] ?? CHAR_TO_HID[e.key];
        if (usage == null) return;
        e.preventDefault();
        sendKey("down", usage);
        setTimeout(() => sendKey("up", usage), 30);
        return;
      }
      // Non-printable (Enter, Backspace, arrows…): use e.code (reliable on PC/BT keyboards)
      const usage = HID_USAGE[e.code];
      if (usage == null) return;
      e.preventDefault();
      sendKey("down", usage);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!streaming) return;
      if (e.key.length === 1) return; // up already sent via setTimeout in keydown
      const usage = HID_USAGE[e.code];
      if (usage == null) return;
      sendKey("up", usage);
    };

    el.addEventListener("keydown", onKeyDown);
    el.addEventListener("keyup", onKeyUp);
    el.addEventListener("focus", () => setKeyboardActive(true));
    el.addEventListener("blur", () => setKeyboardActive(false));
    return () => {
      el.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("keyup", onKeyUp);
    };
  }, [streaming, sendKey]);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const touchingRef = useRef(false);

  const fetchDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const res = await execOnHost("xcrun simctl list devices available -j", workspaceId);
      if (res.exitCode === 0) setDevices(parseSimctlList(res.stdout));
    } finally {
      setDevicesLoading(false);
    }
  }, [workspaceId]);

  const handleStopDevice = useCallback(async (udid: string) => {
    setStoppingUdids((prev) => new Set(prev).add(udid));
    try {
      await execOnHost(`xcrun simctl shutdown ${udid}`, workspaceId);
      await fetchDevices();
    } finally {
      setStoppingUdids((prev) => { const next = new Set(prev); next.delete(udid); return next; });
    }
  }, [fetchDevices, workspaceId]);

  // Fetch device info on mount
  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Set current device name/runtime from device list
  useEffect(() => {
    const dev = devices.find((d) => d.udid === state.device) ?? devices.find((d) => d.state === "Booted");
    if (dev) {
      setDeviceName(dev.name);
      setDeviceRuntime(dev.runtime);
    }
  }, [devices, state.device]);

  const handleSelectDevice = useCallback(async (d: SimDevice) => {
    if (d.udid === state.device || switching) return;
    setSwitching(true);
    switchingRef.current = true;
    try {
      if (d.state !== "Booted") {
        await execOnHost(`xcrun simctl boot ${d.udid}`, workspaceId);
      }
      localStorage.setItem("multica_sim_device", d.udid);
      // Update state — useNativeSimulator hook will reconnect with new UDID in query param
      onStateChange({ device: d.udid, name: d.name } as SimulatorState);
      switchingRef.current = false;
      setSwitching(false);
      fetchDevices();
    } catch {
      switchingRef.current = false;
      setSwitching(false);
    }
  }, [state.device, switching, switchingRef, onStateChange, fetchDevices, workspaceId]);

  const getNormalized = useCallback((clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const onPointerDown = useCallback((e: React.MouseEvent) => {
    hiddenInputRef.current?.focus(); // PC'de tıklayınca klavye odaklanır
    const pos = getNormalized(e.clientX, e.clientY);
    if (!pos) return;
    touchingRef.current = true;
    sendTouch("begin", pos.x, pos.y);
  }, [getNormalized, sendTouch]);

  const onPointerMove = useCallback((e: React.MouseEvent) => {
    if (!touchingRef.current) return;
    const pos = getNormalized(e.clientX, e.clientY);
    if (!pos) return;
    sendTouch("move", pos.x, pos.y);
  }, [getNormalized, sendTouch]);

  const onPointerUp = useCallback((e: React.MouseEvent) => {
    if (!touchingRef.current) return;
    touchingRef.current = false;
    const pos = getNormalized(e.clientX, e.clientY);
    if (!pos) return;
    sendTouch("end", pos.x, pos.y);
  }, [getNormalized, sendTouch]);

  // Mobil touch handler'ları — touchAction:"none" ile browser scroll'u engellenir
  const onMobileTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    if (!t) return;
    const pos = getNormalized(t.clientX, t.clientY);
    if (!pos) return;
    touchingRef.current = true;
    sendTouch("begin", pos.x, pos.y);
  }, [getNormalized, sendTouch]);

  const onMobileTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchingRef.current) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const pos = getNormalized(t.clientX, t.clientY);
    if (!pos) return;
    sendTouch("move", pos.x, pos.y);
  }, [getNormalized, sendTouch]);

  const onMobileTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchingRef.current) return;
    touchingRef.current = false;
    const t = e.changedTouches[0];
    if (!t) return;
    const pos = getNormalized(t.clientX, t.clientY);
    if (!pos) return;
    sendTouch("end", pos.x, pos.y);
  }, [getNormalized, sendTouch]);

  const rotateOrder = ["portrait", "landscape_left", "portrait_upside_down", "landscape_right"];
  const handleRotate = useCallback(() => {
    const idx = rotateOrder.indexOf(orientation);
    const next = rotateOrder[(idx + 1) % rotateOrder.length];
    setOrientation(next);
    execOnHost(`serve-sim rotate ${next}`, workspaceId);
  }, [orientation, workspaceId]);

  const handleScreenshot = useCallback(() => {
    if (state.device) {
      execOnHost(`xcrun simctl io ${state.device} screenshot ~/Desktop/sim-screenshot-$(date +%s).png`, workspaceId);
    }
  }, [state.device, workspaceId]);

  return (
    <div className="flex flex-col items-center justify-center h-full py-2 gap-3">
      {/* Görünmez input — klavye odağı için (PC tıklama + mobil klavye butonu) */}
      <input
        ref={hiddenInputRef}
        type="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        style={{
          position: "fixed",
          opacity: 0,
          pointerEvents: "none",
          width: 1,
          height: 1,
          padding: 0,
          border: "none",
          top: "50%",
          left: "50%",
          fontSize: 16, // iOS zoom'unu engeller
        }}
      />
      {/* Active agent badge — above toolbar */}
      {activeAgentForDevice ? (
        <div className="flex items-center gap-2 rounded-full bg-gradient-to-r from-info/15 to-info/5 border border-info/40 pl-1 pr-3 py-1 shadow-sm ring-1 ring-info/10">
          <div className="relative">
            <ActorAvatar
              actorType="agent"
              actorId={activeAgentForDevice.agent_id}
              size={22}
              enableHoverCard
              showStatusDot
            />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-info ring-2 ring-background animate-pulse" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-semibold text-info uppercase tracking-wider">Active</span>
            <span className="text-xs font-medium text-foreground whitespace-nowrap">
              {taskSimAction?.label ?? "Working"}
            </span>
          </div>
          <svg className="h-3 w-3 animate-spin text-info ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
      ) : (
        <div className="h-[34px]" /> /* spacer to keep layout stable */
      )}

      {/* Toolbar */}
      <Toolbar
        deviceName={deviceName}
        deviceRuntime={deviceRuntime}
        streaming={streaming}
        currentUdid={state.device}
        onHome={() => sendButton("home")}
        onScreenshot={handleScreenshot}
        onRotate={handleRotate}
        onKeyboard={() => hiddenInputRef.current?.focus()}
        keyboardActive={keyboardActive}
        devices={devices}
        stoppingUdids={stoppingUdids}
        onSelectDevice={handleSelectDevice}
        onStopDevice={handleStopDevice}
        onRefreshDevices={fetchDevices}
        devicesLoading={devicesLoading}
      />

      {/* Stream viewport */}
      <div className="relative shrink-0">
        {/* AI touch indicator — shows where the agent is currently interacting */}
        {taskSimAction?.point && frame && !switching && (
          <div
            className="absolute pointer-events-none z-10"
            style={{
              left: `${taskSimAction.point.x * 100}%`,
              top: `${taskSimAction.point.y * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <span className="absolute inset-0 rounded-full bg-info/30 animate-ping" style={{ width: 32, height: 32, marginLeft: -16, marginTop: -16 }} />
            <span className="absolute inset-0 rounded-full bg-info/60 ring-2 ring-info" style={{ width: 16, height: 16, marginLeft: -8, marginTop: -8 }} />
          </div>
        )}
        {switching ? (
          <div style={{ width: 380, height: 760, borderRadius: 32 }} className="bg-muted/30 border border-border/50 flex flex-col items-center justify-center gap-3">
            <svg className="animate-spin text-muted-foreground" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
            <span className="text-sm text-muted-foreground">Switching simulator...</span>
          </div>
        ) : frame ? (
          <img
            ref={imgRef}
            src={frame}
            alt="iOS Simulator"
            draggable={false}
            className="select-none cursor-pointer block"
            style={{ objectFit: "contain", maxWidth: 380, borderRadius: 32, touchAction: "none" }}
            onMouseDown={onPointerDown}
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onMouseLeave={onPointerUp}
            onTouchStart={onMobileTouchStart}
            onTouchMove={onMobileTouchMove}
            onTouchEnd={onMobileTouchEnd}
          />
        ) : (
          <div style={{ width: 380, height: 760, borderRadius: 32 }} className="bg-muted/30 border border-border/50 flex items-center justify-center">
            <span className="text-sm text-muted-foreground animate-pulse">
              {streaming ? "Waiting for frames..." : "Connecting..."}
            </span>
          </div>
        )}

      </div>

      {/* Status */}
      <span className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: streaming ? "#4ade80" : "#666" }} />
        {streaming ? "live" : "connecting"}
      </span>
    </div>
  );
}

// ─── Empty State ───

function SimulatorEmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
      <div className="rounded-xl bg-muted/30 p-4">
        <Smartphone className="size-10 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">No Simulator Running</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          Start serve-sim to stream the iOS Simulator here.
        </p>
        <code className="block mt-3 text-xs bg-muted/50 rounded-md px-3 py-2 font-mono">
          bunx serve-sim --detach
        </code>
      </div>
      <Button variant="outline" size="sm" onClick={onRefresh}>
        <RefreshCw className="size-3.5 mr-1.5" />
        Refresh
      </Button>
    </div>
  );
}

// ─── Page ───

export default function SimulatorPage() {
  const [state, setState] = useState<SimulatorState | null>(null);
  const [loading, setLoading] = useState(true);
  const workspaceId = useWorkspaceId();

  const switchingRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    if (switchingRef.current) return;
    try {
      const res = await fetch(`/api/simulator/status?workspace_id=${workspaceId}`, { credentials: "include" });
      if (!res.ok) { if (!switchingRef.current) setState(null); return; }
      const data = await res.json();
      if (data) {
        // Honor user's last-selected device if it's still booted
        const preferred = typeof window !== "undefined" ? localStorage.getItem("multica_sim_device") : null;
        if (preferred && preferred !== data.device) {
          // Check if preferred is still booted
          try {
            const exec = await fetch(`/api/simulator/exec?workspace_id=${encodeURIComponent(workspaceId)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-CSRF-Token": readCsrfToken() ?? "" },
              credentials: "include",
              body: JSON.stringify({ command: "xcrun simctl list devices booted -j" }),
            });
            if (exec.ok) {
              const r = await exec.json();
              if (r.exitCode === 0 && r.stdout.includes(preferred)) {
                data.device = preferred;
              }
            }
          } catch {}
        }
        const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
        data.wsUrl = `${wsProto}//${window.location.host}/api/simulator/ws`;
      }
      if (!switchingRef.current) setState(data);
    } catch {
      if (!switchingRef.current) setState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return (
    <>
      <PageHeader>
        <Smartphone className="size-4 mr-2 text-muted-foreground" />
        <h1 className="text-sm font-medium">Simulator</h1>
      </PageHeader>
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-muted-foreground animate-pulse">Loading...</span>
          </div>
        ) : state ? (
          <SimulatorViewport state={state} onStateChange={setState} switchingRef={switchingRef} />
        ) : (
          <SimulatorEmptyState onRefresh={fetchStatus} />
        )}
      </div>
    </>
  );
}
