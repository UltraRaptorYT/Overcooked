"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as T } from "@/lib/overcooked-26/tables";

type RoundMode = "easy" | "hard";
type RoundStatus =
  | "locked"
  | "ready"
  | "strategising"
  | "playing"
  | "paused"
  | "ended";

type CookingSession = {
  id: string;
  buffer_seconds: number;
  player_timer_seconds: number | null;
  started_at: string;
  removed_at: string | null;
  actual_seconds: number | null;
  result: string;
};

type DisplayOrder = {
  groupOrder: {
    id: string;
    status: string;
    assignedAt: string;
  };
  order: {
    id?: string;
    orderNo?: string;
    difficulty?: RoundMode;
  };
  activeCookingSession: CookingSession | null;
  latestCookingSession: CookingSession | null;
};

type DisplayGroup = {
  id: string;
  name: string;
  display_order: number;
  score: number;
  red_tokens: number;
  order_success: number;
  order_failure: number;
  orders: DisplayOrder[];
};

type DisplayRound = {
  id: string;
  name: string;
  mode: RoundMode;
  status: RoundStatus;
  duration_seconds: number;
  rush_hour_duration_seconds: number;
  round_started_at: string | null;
};

type DisplayState = {
  serverTime: string;
  game: {
    id: string;
    name: string;
    status: string;
    current_round_id: string | null;
  };
  rounds: DisplayRound[];
  currentRound: DisplayRound | null;
  groups: DisplayGroup[];
};

type CookingStartedPayload = {
  groupId: string;
  groupOrderId: string;
  groupOrder?: {
    id: string;
    status: string;
    assignedAt: string;
  };
  order?: {
    id?: string;
    orderNo?: string;
    difficulty?: RoundMode;
  };
  session: CookingSession;
};

type CookingStoppedPayload = {
  groupOrderId: string;
  session: CookingSession;
};

type PitchableAudioElement = HTMLAudioElement & {
  preservesPitch?: boolean;
  mozPreservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
};

const ROUND_DURATION_MINUTES: Record<RoundMode, number> = {
  easy: 20,
  hard: 35,
};
const BACKGROUND_MUSIC_SRC = "/background-music.mp3";
const DISPLAY_SFX = {
  countdownBeep: "/countdown-beep.mp3",
  orderCompleteDing: "/order-complete-ding.mp3",
  orderWrong: "/order-wrong.mp3",
  rushHour: "/rush-hour.mp3",
  sizzleLoop: "/sizzle-loop.mp3",
  timesUpBell: "/times-up-bell.mp3",
} as const;
const DISPLAY_SFX_NAMES = Object.keys(DISPLAY_SFX) as DisplaySfxName[];
const DEFAULT_DISPLAY_SFX_VOLUME = 0.85;

type DisplaySfxName = keyof typeof DISPLAY_SFX;
const DISPLAY_SFX_VOLUME: Partial<Record<DisplaySfxName, number>> = {
  orderWrong: 0.45,
  rushHour: 0.95,
  sizzleLoop: 0.32,
};

function formatSeconds(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function setAudioPitchPreservation(
  audio: PitchableAudioElement,
  preservePitch: boolean,
) {
  audio.preservesPitch = preservePitch;
  audio.mozPreservesPitch = preservePitch;
  audio.webkitPreservesPitch = preservePitch;
}

function getRushHourMusicRate(
  rushHourActive: boolean,
  matchRemaining: number,
  rushHourSeconds: number,
) {
  if (!rushHourActive || rushHourSeconds <= 0) return 1;

  const rushProgress = 1 - Math.max(0, matchRemaining) / rushHourSeconds;
  return 1.25 + Math.min(1, Math.max(0, rushProgress)) * 0.45;
}

function getSessionTiming(session: CookingSession | null, now: number) {
  if (!session) {
    return {
      elapsed: 0,
      phase: "Waiting",
    };
  }

  const elapsed = Math.max(
    0,
    Math.floor((now - new Date(session.started_at).getTime()) / 1000),
  );

  return {
    elapsed,
    phase: "Cooking",
  };
}

function applyCookingStartedToGroup(
  group: DisplayGroup,
  payload: CookingStartedPayload,
) {
  const existingOrder = group.orders.find(
    (order) => order.groupOrder.id === payload.groupOrderId,
  );

  if (!existingOrder && payload.groupOrder && payload.order) {
    return {
      ...group,
      orders: [
        {
          groupOrder: {
            ...payload.groupOrder,
            status: "cooking",
          },
          order: payload.order,
          activeCookingSession: payload.session,
          latestCookingSession: payload.session,
        },
        ...group.orders,
      ],
    };
  }

  return {
    ...group,
    orders: group.orders.map((order) =>
      order.groupOrder.id !== payload.groupOrderId
        ? order
        : {
            ...order,
            groupOrder: {
              ...order.groupOrder,
              status: "cooking",
            },
            activeCookingSession: payload.session,
            latestCookingSession: payload.session,
          },
    ),
  };
}

function applyCookingStoppedToGroup(
  group: DisplayGroup,
  payload: CookingStoppedPayload,
) {
  return {
    ...group,
    orders: group.orders.map((order) =>
      order.groupOrder.id !== payload.groupOrderId
        ? order
        : {
            ...order,
            groupOrder: {
              ...order.groupOrder,
              status: "cooked",
            },
            activeCookingSession: null,
            latestCookingSession: payload.session,
          },
    ),
  };
}

export function DisplayClient() {
  const [displayState, setDisplayState] = useState<DisplayState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [durationMinutes, setDurationMinutes] = useState("20");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [musicErrorMessage, setMusicErrorMessage] = useState<string | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [startCountdown, setStartCountdown] = useState<number | null>(null);
  const previousMatchRemainingRef = useRef<number | null>(null);
  const previousCountdownSecondRef = useRef<number | null>(null);
  const previousRushHourActiveRef = useRef(false);
  const backgroundMusicRef = useRef<PitchableAudioElement | null>(null);
  const sfxAudioRef = useRef<Partial<Record<DisplaySfxName, HTMLAudioElement>>>(
    {},
  );

  const currentRound = displayState?.currentRound ?? null;
  const matchRemaining = useMemo(() => {
    if (!currentRound) return 0;
    if (!currentRound.round_started_at || currentRound.status !== "playing") {
      return currentRound.duration_seconds;
    }

    const elapsed = Math.max(
      0,
      Math.floor(
        (now - new Date(currentRound.round_started_at).getTime()) / 1000,
      ),
    );
    return Math.max(0, currentRound.duration_seconds - elapsed);
  }, [currentRound, now]);
  const rushHourSeconds = currentRound?.rush_hour_duration_seconds ?? 5 * 60;
  const rushHourActive =
    currentRound?.status === "playing" &&
    matchRemaining > 0 &&
    matchRemaining <= rushHourSeconds;
  const backgroundMusicRate = getRushHourMusicRate(
    rushHourActive,
    matchRemaining,
    rushHourSeconds,
  );
  const activeCookingCount = useMemo(
    () =>
      (displayState?.groups ?? []).reduce(
        (count, group) =>
          count +
          group.orders.filter((order) => order.activeCookingSession).length,
        0,
      ),
    [displayState?.groups],
  );

  async function loadDisplay() {
    try {
      const response = await fetch("/api/display");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load display data");
      }

      setDisplayState(data);
      if (data.currentRound?.duration_seconds) {
        setDurationMinutes(
          String(Math.round(data.currentRound.duration_seconds / 60)),
        );
      }
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong",
      );
    }
  }

  async function updateDisplay(body: {
    action?: "set_difficulty" | "start" | "pause" | "reset";
    difficulty?: RoundMode;
    durationSeconds?: number;
  }) {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/display", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to update display");
      }

      setDisplayState(data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const getSfxAudio = useCallback((name: DisplaySfxName) => {
    const existingAudio = sfxAudioRef.current[name];
    if (existingAudio) return existingAudio;

    const audio = new Audio(DISPLAY_SFX[name]);
    audio.preload = "auto";
    audio.volume = DISPLAY_SFX_VOLUME[name] ?? DEFAULT_DISPLAY_SFX_VOLUME;
    audio.load();
    sfxAudioRef.current[name] = audio;
    return audio;
  }, []);

  const preloadDisplaySfx = useCallback(() => {
    for (const sfxName of DISPLAY_SFX_NAMES) {
      getSfxAudio(sfxName);
    }
  }, [getSfxAudio]);

  const playSfx = useCallback(
    (
      name: DisplaySfxName,
      options: { playbackRate?: number; preservePitch?: boolean } = {},
    ) => {
      const audio = getSfxAudio(name);
      const player = audio.cloneNode(true) as PitchableAudioElement;
      player.volume = audio.volume;
      player.playbackRate = options.playbackRate ?? 1;
      if (options.preservePitch !== undefined) {
        setAudioPitchPreservation(player, options.preservePitch);
      }
      void player.play().catch(() => {
        // Display keeps running if the browser blocks sound before interaction.
      });
    },
    [getSfxAudio],
  );

  const updateSizzleLoop = useCallback(
    (shouldPlay: boolean) => {
      const audio = getSfxAudio("sizzleLoop");
      audio.loop = true;

      if (!shouldPlay) {
        audio.pause();
        audio.currentTime = 0;
        return;
      }

      void audio.play().catch(() => {
        // Display keeps running if the browser blocks sound before interaction.
      });
    },
    [getSfxAudio],
  );

  function getBackgroundMusic() {
    if (typeof window === "undefined") return null;

    if (!backgroundMusicRef.current) {
      const audio = new Audio(BACKGROUND_MUSIC_SRC) as PitchableAudioElement;
      audio.loop = true;
      audio.preload = "auto";
      audio.volume = 0.45;
      setAudioPitchPreservation(audio, true);
      backgroundMusicRef.current = audio;
    }

    return backgroundMusicRef.current;
  }

  async function startBackgroundMusic(forceEnabled = false) {
    if (!forceEnabled && !musicEnabled) return;

    const audio = getBackgroundMusic();
    if (!audio) return;

    try {
      setMusicErrorMessage(null);
      setAudioPitchPreservation(audio, true);
      audio.playbackRate = backgroundMusicRate;
      await audio.play();
      setMusicPlaying(true);
    } catch {
      setMusicPlaying(false);
      setMusicErrorMessage(
        "Music file not ready: add public/background-music.mp3",
      );
    }
  }

  const stopBackgroundMusic = useCallback(() => {
    const audio = backgroundMusicRef.current;
    if (audio) {
      audio.pause();
    }
    setMusicPlaying(false);
  }, []);

  function toggleBackgroundMusic() {
    const nextMusicEnabled = !musicEnabled;
    setMusicEnabled(nextMusicEnabled);

    if (!nextMusicEnabled) {
      stopBackgroundMusic();
      return;
    }

    if (currentRound?.status === "playing" && matchRemaining > 0) {
      void startBackgroundMusic(true);
    }
  }

  async function setDifficulty(difficulty: RoundMode) {
    const minutes = ROUND_DURATION_MINUTES[difficulty];
    setDurationMinutes(String(minutes));
    await updateDisplay({
      action: "set_difficulty",
      difficulty,
      durationSeconds: minutes * 60,
    });
  }

  async function startMatchWithCountdown() {
    if (startCountdown !== null) return;

    preloadDisplaySfx();
    setIsSaving(true);
    setErrorMessage(null);

    for (const count of [3, 2, 1]) {
      setStartCountdown(count);
      playSfx("countdownBeep");
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }

    setStartCountdown(null);

    await updateDisplay({
      action: "start",
      durationSeconds,
    });
    void startBackgroundMusic();
  }

  const applyCookingStarted = useCallback((payload: CookingStartedPayload) => {
    setDisplayState((currentState) => {
      if (!currentState) return currentState;

      return {
        ...currentState,
        groups: currentState.groups.map((group) =>
          group.id === payload.groupId
            ? applyCookingStartedToGroup(group, payload)
            : group,
        ),
      };
    });
    setNow(Date.now());
  }, []);

  const applyCookingStopped = useCallback((payload: CookingStoppedPayload) => {
    setDisplayState((currentState) => {
      if (!currentState) return currentState;

      return {
        ...currentState,
        groups: currentState.groups.map((group) =>
          applyCookingStoppedToGroup(group, payload),
        ),
      };
    });
    setNow(Date.now());
  }, []);

  async function clearExistingOrders() {
    const confirmed = window.confirm(
      "Clear all existing orders and reset group scores?",
    );

    if (!confirmed) return;

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/display/clear-orders", {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to clear orders");
      }

      await loadDisplay();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong",
      );
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    void loadDisplay();
    preloadDisplaySfx();
  }, [preloadDisplaySfx]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const previousMatchRemaining = previousMatchRemainingRef.current;
    if (
      currentRound?.status === "playing" &&
      previousMatchRemaining !== null &&
      previousMatchRemaining > 0 &&
      matchRemaining === 0
    ) {
      playSfx("timesUpBell");
      stopBackgroundMusic();
    }
    previousMatchRemainingRef.current = matchRemaining;
  }, [currentRound?.status, matchRemaining, playSfx, stopBackgroundMusic]);

  useEffect(() => {
    if (currentRound?.status !== "playing") {
      stopBackgroundMusic();
    }
  }, [currentRound?.status, stopBackgroundMusic]);

  useEffect(() => {
    const wasRushHourActive = previousRushHourActiveRef.current;
    if (rushHourActive && !wasRushHourActive) {
      playSfx("rushHour", {
        playbackRate: 1.2,
        preservePitch: false,
      });
    }
    previousRushHourActiveRef.current = rushHourActive;
  }, [playSfx, rushHourActive]);

  useEffect(() => {
    if (
      currentRound?.status !== "playing" ||
      matchRemaining <= 0 ||
      matchRemaining > 30
    ) {
      previousCountdownSecondRef.current = null;
      return;
    }

    if (previousCountdownSecondRef.current !== matchRemaining) {
      playSfx("countdownBeep");
      previousCountdownSecondRef.current = matchRemaining;
    }
  }, [currentRound?.status, matchRemaining, playSfx]);

  useEffect(() => {
    updateSizzleLoop(
      currentRound?.status === "playing" &&
        matchRemaining > 0 &&
        activeCookingCount > 0,
    );
  }, [
    activeCookingCount,
    currentRound?.status,
    matchRemaining,
    updateSizzleLoop,
  ]);

  useEffect(() => {
    const audio = backgroundMusicRef.current;
    if (!audio) return;

    audio.playbackRate = backgroundMusicRate;
  }, [backgroundMusicRate]);

  useEffect(() => {
    const channel = supabase
      .channel("display-board")
      .on("broadcast", { event: "cooking-started" }, ({ payload }) => {
        applyCookingStarted(payload as CookingStartedPayload);
        void loadDisplay();
      })
      .on("broadcast", { event: "cooking-stopped" }, ({ payload }) => {
        applyCookingStopped(payload as CookingStoppedPayload);
        void loadDisplay();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: T.games },
        () => void loadDisplay(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: T.rounds },
        () => void loadDisplay(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: T.groupOrders },
        () => void loadDisplay(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: T.cookingSessions },
        () => void loadDisplay(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: T.servedOrders },
        ({ new: servedOrder }) => {
          const decision = (servedOrder as { decision?: string }).decision;
          if (decision === "approved") {
            playSfx("orderCompleteDing");
          } else if (decision === "rejected" || decision === "wrong_customer") {
            playSfx("orderWrong");
          }
          void loadDisplay();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [applyCookingStarted, applyCookingStopped, playSfx]);

  const durationSeconds = Math.max(
    60,
    Math.floor(Number(durationMinutes) * 60),
  );

  return (
    <main className="min-h-screen bg-slate-950 p-5 text-white">
      {startCountdown !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90">
          <div className="text-center">
            <p className="text-sm font-black uppercase tracking-[0.35em] text-orange-300">
              Starting
            </p>
            <p className="mt-4 text-[clamp(8rem,28vw,18rem)] font-black leading-none tabular-nums text-white">
              {startCountdown}
            </p>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-7xl">
        <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="rounded-2xl bg-white p-5 text-slate-950">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-orange-600">
                  Match Display
                </p>
                <h1 className="mt-1 text-4xl font-black">
                  {displayState?.game.name ?? "Loading..."}
                </h1>
                <p className="mt-1 text-slate-600">
                  {currentRound
                    ? `${currentRound.name} · ${currentRound.mode.toUpperCase()} · ${currentRound.status}`
                    : "No round selected"}
                </p>
              </div>

              <div className="text-right">
                <p
                  className={`text-sm font-bold ${
                    rushHourActive ? "text-red-600" : "text-slate-500"
                  }`}
                >
                  {rushHourActive ? "Rush Hour - 2x Score" : "Match Time"}
                </p>
                <p className="text-7xl font-black tabular-nums">
                  {formatSeconds(matchRemaining)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900 p-5 ring-1 ring-white/10">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase text-slate-400">
                  Controls
                </p>
              </div>
              <input
                inputMode="numeric"
                value={durationMinutes}
                disabled={isSaving || startCountdown !== null}
                onChange={(event) =>
                  setDurationMinutes(event.target.value.replace(/\D/g, ""))
                }
                className="w-24 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-right text-xl font-black text-white outline-none disabled:opacity-50"
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDifficulty("easy")}
                disabled={isSaving || startCountdown !== null}
                className="rounded-xl bg-emerald-500 px-4 py-3 font-black text-emerald-950 disabled:opacity-50"
              >
                Easy
              </button>
              <button
                type="button"
                onClick={() => setDifficulty("hard")}
                disabled={isSaving || startCountdown !== null}
                className="rounded-xl bg-amber-400 px-4 py-3 font-black text-amber-950 disabled:opacity-50"
              >
                Hard
              </button>
              <button
                type="button"
                onClick={startMatchWithCountdown}
                disabled={isSaving || startCountdown !== null}
                className="rounded-xl bg-orange-500 px-4 py-3 font-black text-orange-950 disabled:opacity-50"
              >
                Start
              </button>
              <button
                type="button"
                onClick={() => {
                  stopBackgroundMusic();
                  void updateDisplay({ action: "reset", durationSeconds });
                }}
                disabled={isSaving || startCountdown !== null}
                className="rounded-xl bg-white px-4 py-3 font-black text-slate-950 disabled:opacity-50"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={toggleBackgroundMusic}
                disabled={startCountdown !== null}
                className="rounded-xl bg-sky-400 px-4 py-3 font-black text-sky-950 disabled:opacity-50"
              >
                {musicPlaying
                  ? "Music Playing"
                  : musicEnabled
                    ? "Music Enabled"
                    : "Music Muted"}
              </button>
              <button
                type="button"
                onClick={clearExistingOrders}
                disabled={isSaving || startCountdown !== null}
                className="rounded-xl bg-red-600 px-4 py-3 font-black text-white disabled:opacity-50"
              >
                Clear Orders
              </button>
            </div>

            {musicErrorMessage && (
              <div className="mt-3 rounded-xl border border-amber-300/40 bg-amber-950 p-3 text-sm text-amber-100">
                {musicErrorMessage}
              </div>
            )}

            {errorMessage && (
              <div className="mt-3 rounded-xl border border-red-400/40 bg-red-950 p-3 text-sm text-red-100">
                {errorMessage}
              </div>
            )}
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(displayState?.groups ?? []).map((group) => {
            const activeOrders = group.orders.filter(
              (order) => order.activeCookingSession,
            );

            return (
              <div
                key={group.id}
                className="rounded-2xl bg-white p-4 text-slate-950"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-orange-600">
                      Group {group.display_order}
                    </p>
                    <h2 className="text-2xl font-black">{group.name}</h2>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-500">Score</p>
                    <p className="text-2xl font-black">{group.score}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
                    <p className="text-xs font-bold uppercase text-emerald-700">
                      Order Success
                    </p>
                    <p className="text-2xl font-black text-emerald-950">
                      {group.order_success}
                    </p>
                  </div>
                  <div className="rounded-xl bg-red-50 p-3 ring-1 ring-red-100">
                    <p className="text-xs font-bold uppercase text-red-700">
                      Order Failure
                    </p>
                    <p className="text-2xl font-black text-red-950">
                      {group.order_failure}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  {activeOrders.length === 0 ? (
                    <div className="rounded-xl bg-slate-100 p-4 text-slate-600">
                      No active cooking stopwatch
                    </div>
                  ) : (
                    activeOrders.map((order) => {
                      const session = order.activeCookingSession;
                      const timing = getSessionTiming(session, now);

                      return (
                        <div
                          key={order.groupOrder.id}
                          className="rounded-xl bg-orange-50 p-4 ring-1 ring-orange-100"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-orange-700">
                                Order #{order.order.orderNo ?? "--"}
                              </p>
                              <p className="text-xs font-bold uppercase text-slate-500">
                                Cooking
                              </p>
                            </div>
                            <p className="text-5xl font-black tabular-nums">
                              {formatSeconds(timing.elapsed)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
