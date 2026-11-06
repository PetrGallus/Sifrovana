import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizePreschoolStatus,
  normalizeStrollerStatus,
  type RoutePreschoolStatus,
  type RouteStrollerStatus,
} from "../route-suitability";

export type PublishedGameHintLevel = 1 | 2;

export type PublishedGameRoute = {
  id: string;
  cityId: string;
  cityName: string;
  district: string;
  title: string;
  tagline: string;
  description: string;
  priceCzk: number;
  distanceKm: number;
  durationMin: number;
  durationMax: number;
  strollerStatus: RouteStrollerStatus;
  preschoolStatus: RoutePreschoolStatus;
  difficulty: string;
  accessibilityNote: string;
  safetyNote: string;
  equipment: string[];
  heroImageUrl: string | null;
  heroImageAlt: string | null;
};

export type PublishedGameHint = {
  level: PublishedGameHintLevel;
  hint: string;
};

/**
 * The playable checkpoint contract deliberately has no accepted-answer fields.
 * `fact`, `nextClue` and `metaToken` are null until this checkpoint has been solved.
 */
export type PublishedGameCheckpoint = {
  id: string;
  routeId: string;
  position: number;
  title: string;
  shortTitle: string;
  coordinates: { lat: number; lng: number };
  type: "online" | "physical" | "hybrid";
  distanceFromPreviousKm: number | null;
  story: string;
  puzzlePrompt: string;
  fallbackPrompt: string;
  fact: string | null;
  nextClue: string | null;
  /** Optional fragment earned for a later meta-puzzle. Never exposed before solving. */
  metaToken: string | null;
  map: { x: number; y: number };
  revealedHints: PublishedGameHint[];
};

export type PublishedGameProgress = {
  currentPosition: number;
  checkpointCount: number;
  solvedCheckpointIds: string[];
  hintsUsed: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type PublishedGameSession = {
  id: string;
  routeId: string;
  publicationId: string;
  version: string;
  route: PublishedGameRoute;
  progress: PublishedGameProgress;
  /** Only solved checkpoints and the current checkpoint are returned. */
  checkpoints: PublishedGameCheckpoint[];
};

export type PublishedGameAnswerResult =
  | { correct: false; completed: false }
  | {
      correct: true;
      completed: boolean;
      fact: string;
      nextClue: string;
      metaToken: string | null;
      session: PublishedGameSession;
    };

export type PublishedGameHintResult = {
  checkpointId: string;
  level: PublishedGameHintLevel;
  hint: string;
  hintsUsed: number;
};

export class PublishedGameError extends Error {
  code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "PublishedGameError";
    this.code = code;
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PublishedGameError(`Server vrátil neplatná data (${label}).`, "INVALID_PAYLOAD");
  }
  return value as JsonRecord;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new PublishedGameError(`Server vrátil neplatná data (${label}).`, "INVALID_PAYLOAD");
  }
  return value;
}

function asNullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return asString(value, label);
}

function asNumber(value: unknown, label: string): number {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result)) {
    throw new PublishedGameError(`Server vrátil neplatná data (${label}).`, "INVALID_PAYLOAD");
  }
  return result;
}

function asStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new PublishedGameError(`Server vrátil neplatná data (${label}).`, "INVALID_PAYLOAD");
  }
  return value;
}

function mapRoute(value: unknown): PublishedGameRoute {
  const route = asRecord(value, "route");
  return {
    id: asString(route.id, "route.id"),
    cityId: asString(route.city_id, "route.city_id"),
    cityName: asString(route.city_name, "route.city_name"),
    district: asString(route.district, "route.district"),
    title: asString(route.title, "route.title"),
    tagline: asString(route.tagline, "route.tagline"),
    description: asString(route.description, "route.description"),
    priceCzk: asNumber(route.price_czk, "route.price_czk"),
    distanceKm: asNumber(route.distance_km, "route.distance_km"),
    durationMin: asNumber(route.duration_min, "route.duration_min"),
    durationMax: asNumber(route.duration_max, "route.duration_max"),
    strollerStatus: normalizeStrollerStatus(route.stroller_status),
    preschoolStatus: normalizePreschoolStatus(route.preschool_status),
    difficulty: asString(route.difficulty, "route.difficulty"),
    accessibilityNote: asString(route.accessibility_note, "route.accessibility_note"),
    safetyNote: asString(route.safety_note, "route.safety_note"),
    equipment: asStringArray(route.equipment, "route.equipment"),
    heroImageUrl: asNullableString(route.hero_image_url, "route.hero_image_url"),
    heroImageAlt: asNullableString(route.hero_image_alt, "route.hero_image_alt"),
  };
}

const forbiddenCheckpointFields = [
  "accepted_answers",
  "fallback_answers",
  "hint_1",
  "hint_2",
  "internal_notes",
] as const;

function mapHint(value: unknown): PublishedGameHint {
  const hint = asRecord(value, "checkpoint.revealed_hints");
  const level = asNumber(hint.level, "hint.level");
  if (level !== 1 && level !== 2) {
    throw new PublishedGameError("Server vrátil neplatnou úroveň nápovědy.", "INVALID_PAYLOAD");
  }
  return { level, hint: asString(hint.hint, "hint.hint") };
}

function mapCheckpoint(value: unknown): PublishedGameCheckpoint {
  const checkpoint = asRecord(value, "checkpoint");
  if (forbiddenCheckpointFields.some((field) => field in checkpoint)) {
    throw new PublishedGameError(
      "Server odmítl nebezpečný herní payload.",
      "ANSWER_DATA_EXPOSED",
    );
  }

  const type = asString(checkpoint.checkpoint_type, "checkpoint.checkpoint_type");
  if (type !== "online" && type !== "physical" && type !== "hybrid") {
    throw new PublishedGameError("Server vrátil neplatný typ checkpointu.", "INVALID_PAYLOAD");
  }

  const rawHints = checkpoint.revealed_hints ?? [];
  if (!Array.isArray(rawHints)) {
    throw new PublishedGameError("Server vrátil neplatné nápovědy.", "INVALID_PAYLOAD");
  }

  return {
    id: asString(checkpoint.id, "checkpoint.id"),
    routeId: asString(checkpoint.route_id, "checkpoint.route_id"),
    position: asNumber(checkpoint.position, "checkpoint.position"),
    title: asString(checkpoint.title, "checkpoint.title"),
    shortTitle: asString(checkpoint.short_title, "checkpoint.short_title"),
    coordinates: {
      lat: asNumber(checkpoint.latitude, "checkpoint.latitude"),
      lng: asNumber(checkpoint.longitude, "checkpoint.longitude"),
    },
    type,
    distanceFromPreviousKm:
      checkpoint.distance_from_previous_km === null
        ? null
        : asNumber(checkpoint.distance_from_previous_km, "checkpoint.distance_from_previous_km"),
    story: asString(checkpoint.story, "checkpoint.story"),
    puzzlePrompt: asString(checkpoint.puzzle_prompt, "checkpoint.puzzle_prompt"),
    fallbackPrompt: asString(checkpoint.fallback_prompt, "checkpoint.fallback_prompt"),
    fact: asNullableString(checkpoint.fact, "checkpoint.fact"),
    nextClue: asNullableString(checkpoint.next_clue, "checkpoint.next_clue"),
    metaToken: asNullableString(checkpoint.meta_token, "checkpoint.meta_token"),
    map: {
      x: asNumber(checkpoint.map_x, "checkpoint.map_x"),
      y: asNumber(checkpoint.map_y, "checkpoint.map_y"),
    },
    revealedHints: rawHints.map(mapHint),
  };
}

function mapSession(value: unknown): PublishedGameSession {
  const session = asRecord(value, "session");
  const progress = asRecord(session.progress, "session.progress");
  if (!Array.isArray(session.checkpoints)) {
    throw new PublishedGameError("Server vrátil neplatné checkpointy.", "INVALID_PAYLOAD");
  }

  const result: PublishedGameSession = {
    id: asString(session.session_id, "session.session_id"),
    routeId: asString(session.route_id, "session.route_id"),
    publicationId: asString(session.publication_id, "session.publication_id"),
    version: asString(session.version, "session.version"),
    route: mapRoute(session.route),
    progress: {
      currentPosition: asNumber(progress.current_position, "progress.current_position"),
      checkpointCount: asNumber(progress.checkpoint_count, "progress.checkpoint_count"),
      solvedCheckpointIds: asStringArray(
        progress.solved_checkpoint_ids,
        "progress.solved_checkpoint_ids",
      ),
      hintsUsed: asNumber(progress.hints_used, "progress.hints_used"),
      startedAt: asString(progress.started_at, "progress.started_at"),
      updatedAt: asString(progress.updated_at, "progress.updated_at"),
      completedAt: asNullableString(progress.completed_at, "progress.completed_at"),
    },
    checkpoints: session.checkpoints.map(mapCheckpoint),
  };

  if (
    result.checkpoints.some(
      (checkpoint) => checkpoint.position > result.progress.currentPosition,
    )
  ) {
    throw new PublishedGameError(
      "Server vrátil checkpoint, který ještě nemá být odemčený.",
      "FUTURE_CHECKPOINT_EXPOSED",
    );
  }

  if (
    result.checkpoints.some(
      (checkpoint) =>
        checkpoint.position === result.progress.currentPosition &&
        (checkpoint.fact !== null || checkpoint.nextClue !== null || checkpoint.metaToken !== null),
    )
  ) {
    throw new PublishedGameError(
      "Server odkryl odměnu checkpointu před jeho vyřešením.",
      "CHECKPOINT_REWARD_EXPOSED",
    );
  }

  return result;
}

async function callRpc(
  supabase: SupabaseClient,
  functionName: string,
  parameters: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await supabase.rpc(functionName, parameters);
  if (error) throw new PublishedGameError(error.message, error.code ?? null);
  return data;
}

export async function startOrResumePublishedGame(
  supabase: SupabaseClient,
  routeId: string,
): Promise<PublishedGameSession> {
  if (!routeId.trim()) throw new PublishedGameError("Chybí identifikátor trasy.", "INVALID_ROUTE");
  return mapSession(
    await callRpc(supabase, "start_or_resume_route_game", { p_route_id: routeId }),
  );
}

export async function loadPublishedGameSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<PublishedGameSession> {
  return mapSession(
    await callRpc(supabase, "get_route_game_session", { p_session_id: sessionId }),
  );
}

export async function submitPublishedGameAnswer(
  supabase: SupabaseClient,
  input: {
    sessionId: string;
    checkpointId: string;
    answer: string;
    useFallback?: boolean;
  },
): Promise<PublishedGameAnswerResult> {
  const raw = asRecord(
    await callRpc(supabase, "submit_route_game_answer", {
      p_session_id: input.sessionId,
      p_checkpoint_id: input.checkpointId,
      p_answer: input.answer,
      p_use_fallback: input.useFallback ?? false,
    }),
    "answer",
  );

  if (raw.correct === false) return { correct: false, completed: false };
  if (raw.correct !== true || typeof raw.completed !== "boolean") {
    throw new PublishedGameError("Server vrátil neplatný výsledek odpovědi.", "INVALID_PAYLOAD");
  }

  return {
    correct: true,
    completed: raw.completed,
    fact: asString(raw.fact, "answer.fact"),
    nextClue: asString(raw.next_clue, "answer.next_clue"),
    metaToken: asNullableString(raw.meta_token, "answer.meta_token"),
    session: mapSession(raw.session),
  };
}

export async function revealPublishedGameHint(
  supabase: SupabaseClient,
  sessionId: string,
  level: PublishedGameHintLevel,
): Promise<PublishedGameHintResult> {
  const raw = asRecord(
    await callRpc(supabase, "reveal_route_game_hint", {
      p_session_id: sessionId,
      p_hint_level: level,
    }),
    "hint",
  );
  const returnedLevel = asNumber(raw.hint_level, "hint.hint_level");
  if (returnedLevel !== 1 && returnedLevel !== 2) {
    throw new PublishedGameError("Server vrátil neplatnou úroveň nápovědy.", "INVALID_PAYLOAD");
  }
  return {
    checkpointId: asString(raw.checkpoint_id, "hint.checkpoint_id"),
    level: returnedLevel,
    hint: asString(raw.hint, "hint.hint"),
    hintsUsed: asNumber(raw.hints_used, "hint.hints_used"),
  };
}

export function getCurrentPublishedCheckpoint(session: PublishedGameSession) {
  if (session.progress.completedAt) return null;
  return (
    session.checkpoints.find(
      (checkpoint) => checkpoint.position === session.progress.currentPosition,
    ) ?? null
  );
}
