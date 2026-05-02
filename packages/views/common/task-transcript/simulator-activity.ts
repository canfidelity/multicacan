import type { TimelineItem } from "./build-timeline";

export type SimulatorActionKind =
  | "boot"
  | "shutdown"
  | "install"
  | "uninstall"
  | "launch"
  | "terminate"
  | "build"
  | "test"
  | "screenshot"
  | "record"
  | "openurl"
  | "push"
  | "permissions"
  | "addmedia"
  | "logs"
  | "rotate"
  | "appearance"
  | "input"
  | "flutter-build"
  | "flutter-run"
  | "flutter-test"
  | "rn-run";

export interface SimulatorAction {
  kind: SimulatorActionKind;
  label: string;          // human-readable, e.g. "Building app"
  udid?: string;
  bundleId?: string;
  appPath?: string;
  /** Normalized 0-1 coordinates if action involved a touch/tap */
  point?: { x: number; y: number };
}

const ACTION_LABELS: Record<SimulatorActionKind, string> = {
  boot: "Booting simulator",
  shutdown: "Shutting down",
  install: "Installing app",
  uninstall: "Uninstalling app",
  launch: "Launching app",
  terminate: "Terminating app",
  build: "Building app",
  test: "Running tests",
  screenshot: "Taking screenshot",
  record: "Recording video",
  openurl: "Opening URL",
  push: "Sending push",
  permissions: "Setting permissions",
  addmedia: "Adding media",
  logs: "Reading logs",
  rotate: "Rotating device",
  appearance: "Toggling appearance",
  input: "Sending input",
  "flutter-build": "Building Flutter app",
  "flutter-run": "Running Flutter app",
  "flutter-test": "Running Flutter tests",
  "rn-run": "Running React Native app",
};

const UDID_RE = /([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})/;

function parseCommand(cmd: string): SimulatorAction | null {
  if (!cmd) return null;
  const udidMatch = cmd.match(UDID_RE);
  const udid = udidMatch?.[1];

  // Flutter
  if (/\bflutter\s+build\b/.test(cmd)) return { kind: "flutter-build", label: ACTION_LABELS["flutter-build"], udid };
  if (/\bflutter\s+run\b/.test(cmd)) return { kind: "flutter-run", label: ACTION_LABELS["flutter-run"], udid };
  if (/\bflutter\s+test\b/.test(cmd)) return { kind: "flutter-test", label: ACTION_LABELS["flutter-test"], udid };

  // React Native / Expo
  if (/\b(react-native|expo)\s+(run-ios|start)\b/.test(cmd)) return { kind: "rn-run", label: ACTION_LABELS["rn-run"], udid };

  // xcodebuild
  if (/\bxcodebuild\b.*\btest\b/.test(cmd)) return { kind: "test", label: ACTION_LABELS.test, udid };
  if (/\bxcodebuild\b/.test(cmd)) return { kind: "build", label: ACTION_LABELS.build, udid };

  // serve-sim
  const ssMatch = cmd.match(/\bserve-sim\s+(\w+)/);
  if (ssMatch?.[1]) {
    const verb = ssMatch[1];
    if (verb === "rotate") return { kind: "rotate", label: ACTION_LABELS.rotate, udid };
    if (verb === "button" || verb === "gesture") {
      // Try to extract x,y from gesture JSON
      const xMatch = cmd.match(/"x"\s*:\s*([0-9.]+)/);
      const yMatch = cmd.match(/"y"\s*:\s*([0-9.]+)/);
      const xStr = xMatch?.[1];
      const yStr = yMatch?.[1];
      const point = xStr && yStr ? { x: parseFloat(xStr), y: parseFloat(yStr) } : undefined;
      return { kind: "input", label: ACTION_LABELS.input, udid, point };
    }
  }

  // xcrun simctl ...
  const m = cmd.match(/\bxcrun\s+simctl\s+(\S+)/);
  if (!m?.[1]) return null;
  const verb = m[1];

  switch (verb) {
    case "boot": return { kind: "boot", label: ACTION_LABELS.boot, udid };
    case "shutdown": return { kind: "shutdown", label: ACTION_LABELS.shutdown, udid };
    case "install": {
      const pathMatch = cmd.match(/install\s+\S+\s+(\S+)/);
      return { kind: "install", label: ACTION_LABELS.install, udid, appPath: pathMatch?.[1] };
    }
    case "uninstall": {
      const idMatch = cmd.match(/uninstall\s+\S+\s+(\S+)/);
      return { kind: "uninstall", label: ACTION_LABELS.uninstall, udid, bundleId: idMatch?.[1] };
    }
    case "launch": {
      const idMatch = cmd.match(/launch(?:\s+--console)?\s+\S+\s+(\S+)/);
      return { kind: "launch", label: ACTION_LABELS.launch, udid, bundleId: idMatch?.[1] };
    }
    case "terminate": {
      const idMatch = cmd.match(/terminate\s+\S+\s+(\S+)/);
      return { kind: "terminate", label: ACTION_LABELS.terminate, udid, bundleId: idMatch?.[1] };
    }
    case "io": {
      if (/\brecordVideo\b/.test(cmd)) return { kind: "record", label: ACTION_LABELS.record, udid };
      if (/\bscreenshot\b/.test(cmd)) return { kind: "screenshot", label: ACTION_LABELS.screenshot, udid };
      return null;
    }
    case "openurl": return { kind: "openurl", label: ACTION_LABELS.openurl, udid };
    case "push": return { kind: "push", label: ACTION_LABELS.push, udid };
    case "privacy": return { kind: "permissions", label: ACTION_LABELS.permissions, udid };
    case "addmedia": return { kind: "addmedia", label: ACTION_LABELS.addmedia, udid };
    case "spawn": {
      if (/\blog\s+(stream|show)\b/.test(cmd)) return { kind: "logs", label: ACTION_LABELS.logs, udid };
      return null;
    }
    case "ui": return { kind: "appearance", label: ACTION_LABELS.appearance, udid };
    default: return null;
  }
}

/** Returns the most recent simulator action from a timeline, or null. */
export function latestSimulatorAction(items: TimelineItem[]): SimulatorAction | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (!it || it.type !== "tool_use") continue;
    const cmd = (it.input?.command as string) || (it.input?.cmd as string) || "";
    const action = parseCommand(cmd);
    if (action) return action;
  }
  return null;
}

/** Returns all simulator actions in chronological order. */
export function allSimulatorActions(items: TimelineItem[]): SimulatorAction[] {
  const out: SimulatorAction[] = [];
  for (const it of items) {
    if (it.type !== "tool_use") continue;
    const cmd = (it.input?.command as string) || (it.input?.cmd as string) || "";
    const action = parseCommand(cmd);
    if (action) out.push(action);
  }
  return out;
}
