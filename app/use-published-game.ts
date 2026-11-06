"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const sessionReferenceStorageKey = "sifrovana-published-game-sessions-v2";

function readSessionReferences(): Record<string, Record<string, string>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(sessionReferenceStorageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([userId, routes]) => {
      if (!routes || typeof routes !== "object" || Array.isArray(routes)) return [];
      const safeRoutes = Object.fromEntries(
        Object.entries(routes).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
      return Object.keys(safeRoutes).length > 0 ? [[userId, safeRoutes]] : [];
    }));
  } catch {
    return {};
  }
}

function rememberSessionReference(userId: string | null, session: PublishedGameSession) {
  if (typeof window === "undefined" || !userId) return;
  try {
    const references = readSessionReferences();
    references[userId] = { ...(references[userId] ?? {}), [session.routeId]: session.id };
    window.localStorage.setItem(sessionReferenceStorageKey, JSON.stringify(references));
  } catch {
    // The server remains the source of truth when browser storage is unavailable.
  }
}

function forgetSessionReference(userId: string | null, routeId: string) {
  if (typeof window === "undefined" || !userId) return;
  try {
    const references = readSessionReferences();
    delete references[userId]?.[routeId];
    if (references[userId] && Object.keys(references[userId]).length === 0) delete references[userId];
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

export function usePublishedGame(userId: string | null) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [sessionState, setSession] = useState<{
    userId: string;
    value: PublishedGameSession;
  } | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingPublishedGameAction>(null);
  const [error, setError] = useState<PublishedGameError | null>(null);
  const previousUserId = useRef<string | null>(userId);
  const activeUserId = useRef<string | null>(userId);
  const visibleSession = sessionState?.userId === userId ? sessionState.value : null;

  const belongsToCurrentUser = useCallback(
    (requestUserId: string | null) => Boolean(requestUserId && activeUserId.current === requestUserId),
    [],
  );

  const accountChangedError = useCallback(
    () => new PublishedGameError(
      "Účet se během načítání změnil. Zopakuj akci v aktuálním účtu.",
      "AUTH_CHANGED",
    ),
    [],
  );

  useEffect(() => {
    activeUserId.current = userId;
    if (previousUserId.current === userId) return;
    previousUserId.current = userId;
    const timer = window.setTimeout(() => {
      setSession(null);
      setError(null);
      setPendingAction(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [userId]);

  const start = useCallback(
    async (routeId: string) => {
      if (!supabase) throw missingBackendError();
      const requestUserId = userId;
      if (!requestUserId) throw accountChangedError();
      setPendingAction("start");
      setError(null);
      try {
        const nextSession = await startOrResumePublishedGame(supabase, routeId);
        if (!belongsToCurrentUser(requestUserId)) throw accountChangedError();
        setSession({ userId: requestUserId, value: nextSession });
        rememberSessionReference(requestUserId, nextSession);
        return nextSession;
      } catch (reason) {
        const nextError =
          reason instanceof PublishedGameError
            ? reason
            : new PublishedGameError("Výpravu se nepodařilo spustit.");
        if (belongsToCurrentUser(requestUserId)) setError(nextError);
        throw nextError;
      } finally {
        if (belongsToCurrentUser(requestUserId)) setPendingAction(null);
      }
    },
    [accountChangedError, belongsToCurrentUser, supabase, userId],
  );

  const load = useCallback(
    async (sessionId: string) => {
      if (!supabase) throw missingBackendError();
      const requestUserId = userId;
      if (!requestUserId) throw accountChangedError();
      setPendingAction("load");
      setError(null);
      try {
        const nextSession = await loadPublishedGameSession(supabase, sessionId);
        if (!belongsToCurrentUser(requestUserId)) throw accountChangedError();
        setSession({ userId: requestUserId, value: nextSession });
        rememberSessionReference(requestUserId, nextSession);
        return nextSession;
      } catch (reason) {
        const nextError =
          reason instanceof PublishedGameError
            ? reason
            : new PublishedGameError("Rozehranou výpravu se nepodařilo načíst.");
        if (belongsToCurrentUser(requestUserId)) setError(nextError);
        throw nextError;
      } finally {
        if (belongsToCurrentUser(requestUserId)) setPendingAction(null);
      }
    },
    [accountChangedError, belongsToCurrentUser, supabase, userId],
  );

  const resumeLast = useCallback(
    async (routeId: string) => {
      const sessionId = userId ? readSessionReferences()[userId]?.[routeId] : undefined;
      if (!sessionId) return null;
      try {
        const nextSession = await load(sessionId);
        if (nextSession.routeId !== routeId) {
          forgetSessionReference(userId, routeId);
          forgetSessionReference(userId, nextSession.routeId);
          throw new PublishedGameError(
            "Uložená výprava nepatří k této trase.",
            "SESSION_ROUTE_MISMATCH",
          );
        }
        return nextSession;
      } catch (reason) {
        forgetSessionReference(userId, routeId);
        throw reason;
      }
    },
    [load, userId],
  );

  const submitAnswer = useCallback(
    async (input: { checkpointId: string; answer: string; useFallback?: boolean }) => {
      if (!supabase) throw missingBackendError();
      if (!visibleSession) throw new PublishedGameError("Nejdřív spusť výpravu.", "NO_SESSION");
      const requestUserId = userId;
      if (!requestUserId) throw accountChangedError();
      setPendingAction("answer");
      setError(null);
      try {
        const result = await submitPublishedGameAnswer(supabase, {
          sessionId: visibleSession.id,
          ...input,
        });
        if (!belongsToCurrentUser(requestUserId)) throw accountChangedError();
        if (result.correct) {
          setSession({ userId: requestUserId, value: result.session });
          rememberSessionReference(requestUserId, result.session);
        }
        return result;
      } catch (reason) {
        const nextError =
          reason instanceof PublishedGameError
            ? reason
            : new PublishedGameError("Odpověď se nepodařilo ověřit.");
        if (belongsToCurrentUser(requestUserId)) setError(nextError);
        throw nextError;
      } finally {
        if (belongsToCurrentUser(requestUserId)) setPendingAction(null);
      }
    },
    [accountChangedError, belongsToCurrentUser, supabase, userId, visibleSession],
  );

  const revealHint = useCallback(
    async (level: PublishedGameHintLevel) => {
      if (!supabase) throw missingBackendError();
      if (!visibleSession) throw new PublishedGameError("Nejdřív spusť výpravu.", "NO_SESSION");
      const requestUserId = userId;
      if (!requestUserId) throw accountChangedError();
      setPendingAction("hint");
      setError(null);
      try {
        const result = await revealPublishedGameHint(supabase, visibleSession.id, level);
        if (!belongsToCurrentUser(requestUserId)) throw accountChangedError();
        setSession((current) => {
          if (
            !current
            || current.userId !== requestUserId
            || current.value.id !== visibleSession.id
          ) return current;
          return {
            ...current,
            value: {
              ...current.value,
              progress: { ...current.value.progress, hintsUsed: result.hintsUsed },
              checkpoints: current.value.checkpoints.map((checkpoint) => {
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
            },
          };
        });
        return result;
      } catch (reason) {
        const nextError =
          reason instanceof PublishedGameError
            ? reason
            : new PublishedGameError("Nápovědu se nepodařilo načíst.");
        if (belongsToCurrentUser(requestUserId)) setError(nextError);
        throw nextError;
      } finally {
        if (belongsToCurrentUser(requestUserId)) setPendingAction(null);
      }
    },
    [accountChangedError, belongsToCurrentUser, supabase, userId, visibleSession],
  );

  const clear = useCallback(() => {
    if (visibleSession) forgetSessionReference(userId, visibleSession.routeId);
    setSession(null);
    setError(null);
    setPendingAction(null);
  }, [userId, visibleSession]);

  const clearError = useCallback(() => setError(null), []);

  return {
    backendConfigured: Boolean(supabase),
    session: visibleSession,
    currentCheckpoint: visibleSession ? getCurrentPublishedCheckpoint(visibleSession) : null,
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
