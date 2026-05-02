"use client";

import { useState, useEffect, useCallback } from "react";
import { useWSEvent } from "@multica/core/realtime";
import { api } from "@multica/core/api";
import type {
  PairSession,
  PairSuggestion,
  PairStartedPayload,
  PairSuggestionPayload,
  PairEndedPayload,
} from "@multica/core/types/events";

interface UsePairSessionResult {
  session: PairSession | null;
  suggestions: PairSuggestion[];
  isLoading: boolean;
  isStarting: boolean;
  start: (agentId: string, intervene: boolean) => Promise<void>;
  stop: () => Promise<void>;
}

export function usePairSession(issueId: string): UsePairSessionResult {
  const [session, setSession] = useState<PairSession | null>(null);
  const [suggestions, setSuggestions] = useState<PairSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  // Load existing active session on mount
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    api
      .getActivePairSession(issueId)
      .then(async (s) => {
        if (cancelled) return;
        setSession(s);
        if (s) {
          const existing = await api.listPairSuggestions(s.id).catch(() => []);
          if (!cancelled) setSuggestions(existing);
        }
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [issueId]);

  // Real-time: new session started
  useWSEvent("pair:started", (payload) => {
    const p = payload as PairStartedPayload;
    if (p.session.issue_id !== issueId) return;
    setSession(p.session);
    setSuggestions([]);
  });

  // Real-time: new suggestion
  useWSEvent("pair:suggestion", (payload) => {
    const p = payload as PairSuggestionPayload;
    if (session && p.suggestion.session_id !== session.id) return;
    setSuggestions((prev) => [p.suggestion, ...prev]);
  });

  // Real-time: session ended
  useWSEvent("pair:ended", (payload) => {
    const p = payload as PairEndedPayload;
    if (p.issue_id !== issueId) return;
    setSession((prev) => {
      if (prev?.id === p.session_id) return { ...prev, status: "ended" };
      return prev;
    });
  });

  const start = useCallback(
    async (agentId: string, intervene: boolean) => {
      setIsStarting(true);
      try {
        const s = await api.startPairSession(issueId, agentId, intervene);
        setSession(s);
        setSuggestions([]);
      } finally {
        setIsStarting(false);
      }
    },
    [issueId],
  );

  const stop = useCallback(async () => {
    await api.stopPairSession(issueId);
    setSession((prev) => (prev ? { ...prev, status: "ended" } : null));
  }, [issueId]);

  return { session, suggestions, isLoading, isStarting, start, stop };
}