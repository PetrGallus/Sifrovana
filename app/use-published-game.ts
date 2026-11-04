"use client";

import { useCallback, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getCurrentPublishedCheckpoint,
  loadPublishedGameSession,
  PublishedGameError,
  revealPublishedGameHint,
  startOrResumePublishedGame,
  submitPublishedGameAnswer,
  type PublishedGameHintLevel,
  type PublishedGameSession,
} from "@/lib/supabase/published-game";

type PendingPublishedGameAction = "start" | "load" | "answer" | "hint" | null;

const sessionReferenceStorageKey = "sifrovana-published-game-sessions-v1";

function readSessionReferences(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(sessionReferenceStorageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function rememberSessionReference(session: PublishedGameSession) {
  if (typeof window === "undefined") return;
  try {
    const references = readSessionReferences();
    references[session.routeId] = session.id;
    window.localStorage.setItem(sessionReferenceStorageKey, JSON.stringify(references));
  } catch {
    // The server remains the source of truth when browser storage is unavailable.
  }
}

function forgetSessionReference(routeId: string) {
  if (typeof window === "undefined") return;
  try {
    const references = readSessionReferences();
    delete references[routeId];
    if (Object.keys(references).length === 0) {
      window.localStorage.removeItem(sessionReferenceStorageKey);
    } else {
      window.localStorage.setItem(sessionReferenceStorageKey, JSON.stringify(references));
    }
  } catch {
    // A stale convenience reference is harmless; every RPC re-checks ownership.
  }
}

function missingBackendError() {
  return new PublishedGameError(
    "Herní server není nakonfigurovaný. Publikovanou výpravu teď nelze spustit.",
    "BACKEND_NOT_CONFIGURED",
  );
}

export function usePublishedGame() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState<PublishedGameSession | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingPublishedGameAction>(null);
  const [error, setError] = useState<PublishedGameError | null>(null);

  const start = useCallback(
    async (routeId: string) => {
      if (!supabase) throw missingBackendError();
      setPendingAction("start");
      setError(null);
      try {
        const nextSession = await startOrResumePublishedGame(supabase, routeId);
        setSession(nextSession);
        rememberSessionReference(nextSession);
        return nextSession;
      } catch (reason) {
        const nextError =
          reason instanceof PublishedGameError
            ? reason
            : new PublishedGameError("Výpravu se nepodařilo spustit.");
        setError(nextError);
        throw nextError;
      } finally {
        setPendingAction(null);
      }
    },
    [supabase],
  );

  const load = useCallback(
    async (sessionId: string) => {
      if (!supabase) throw missingBackendError();
      setPendingAction("load");
      setError(null);
      try {
        const nextSession = await loadPublishedGameSession(supabase, sessionId);
        setSession(nextSession);
        rememberSessionReference(nextSession);
        return nextSession;
      } catch (reason) {
        const nextError =
          reason instanceof PublishedGameError
            ? reason
            : new PublishedGameError("Rozehranou výpravu se nepodařilo načíst.");
        setError(nextError);
        throw nextError;
      } finally {
        setPendingAction(null);
      }
    },
    [supabase],
  );

  const resumeLast = useCallback(
    async (routeId: string) => {
      const sessionId = readSessionReferences()[routeId];
      if (!sessionId) return null;
      try {
        const nextSession = await load(sessionId);
        if (nextSession.routeId !== routeId) {
          forgetSessionReference(routeId);
          forgetSessionReference(nextSession.routeId);
          throw new PublishedGameError(
            "Uložená výprava nepatří k této trase.",
            "SESSION_ROUTE_MISMATCH",
          );
        }
        return nextSession;
      } catch (reason) {
        forgetSessionReference(routeId);
        throw reason;
      }
    },
    [load],
  );

  const submitAnswer = useCallback(
    async (input: { checkpointId: string; answer: string; useFallback?: boolean }) => {
      if (!supabase) throw missingBackendError();
      if (!session) throw new PublishedGameError("Nejdřív spusť výpravu.", "NO_SESSION");
      setPendingAction("answer");
      setError(null);
      try {
        const result = await submitPublishedGameAnswer(supabase, {
          sessionId: session.id,
          ...input,
        });
        if (result.correct) {
          setSession(result.session);
          rememberSessionReference(result.session);
        }
        return result;
      } catch (reason) {
        const nextError =
          reason instanceof PublishedGameError
            ? reason
            : new PublishedGameError("Odpověď se nepodařilo ověřit.");
        setError(nextError);
        throw nextError;
      } finally {
        setPendingAction(null);
      }
    },
    [session, supabase],
  );

  const revealHint = useCallback(
    async (level: PublishedGameHintLevel) => {
      if (!supabase) throw missingBackendError();
      if (!session) throw new PublishedGameError("Nejdřív spusť výpravu.", "NO_SESSION");
      setPendingAction("hint");
      setError(null);
      try {
        const result = await revealPublishedGameHint(supabase, session.id, level);
        setSession((current) => {
          if (!current || current.id !== session.id) return current;
          return {
            ...current,
            progress: { ...current.progress, hintsUsed: result.hintsUsed },
            checkpoints: current.checkpoints.map((checkpoint) => {
              if (checkpoint.id !== result.checkpointId) return checkpoint;
              const withoutSameLevel = checkpoint.revealedHints.filter(
                (hint) => hint.level !== result.level,
              );
              return {
                ...checkpoint,
                revealedHints: [
                  ...withoutSameLevel,
                  { level: result.level, hint: result.hint },
                ].sort((left, right) => left.level - right.level),
              };
            }),
          };
        });
        return result;
      } catch (reason) {
        const nextError =
          reason instanceof PublishedGameError
            ? reason
            : new PublishedGameError("Nápovědu se nepodařilo načíst.");
        setError(nextError);
        throw nextError;
      } finally {
        setPendingAction(null);
      }
    },
    [session, supabase],
  );

  const clear = useCallback(() => {
    if (session) forgetSessionReference(session.routeId);
    setSession(null);
    setError(null);
    setPendingAction(null);
  }, [session]);

  const clearError = useCallback(() => setError(null), []);

  return {
    backendConfigured: Boolean(supabase),
    session,
    currentCheckpoint: session ? getCurrentPublishedCheckpoint(session) : null,
    pendingAction,
    busy: pendingAction !== null,
    error,
    start,
    load,
    resumeLast,
    submitAnswer,
    revealHint,
    clear,
    clearError,
  };
}
