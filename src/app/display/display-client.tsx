"use client";

import { useEffect, useMemo, useState } from "react";
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
  orders: DisplayOrder[];
};

type DisplayRound = {
  id: string;
  name: string;
  mode: RoundMode;
  status: RoundStatus;
  duration_seconds: number;
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

function formatSeconds(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getSessionTiming(session: CookingSession | null, now: number) {
  if (!session) {
    return {
      bufferRemaining: 0,
      elapsed: 0,
      phase: "Waiting",
      remaining: 0,
    };
  }

  const elapsed = Math.max(
    0,
    Math.floor((now - new Date(session.started_at).getTime()) / 1000),
  );
  const playerTimer = session.player_timer_seconds ?? 0;
  const remaining = Math.max(0, playerTimer - elapsed);
  const bufferRemaining = Math.max(
    0,
    playerTimer + session.buffer_seconds - elapsed,
  );

  return {
    bufferRemaining,
    elapsed,
    phase: remaining > 0 ? "Cooking" : bufferRemaining > 0 ? "Buffer" : "Past buffer",
    remaining,
  };
}

export function DisplayClient() {
  const [displayState, setDisplayState] = useState<DisplayState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [durationMinutes, setDurationMinutes] = useState("20");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLive, setIsLive] = useState(false);

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

  async function loadDisplay() {
    try {
      const response = await fetch("/api/display");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load display data");
      }

      setDisplayState(data);
      if (data.currentRound?.duration_seconds) {
        setDurationMinutes(String(Math.round(data.currentRound.duration_seconds / 60)));
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
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("display-board")
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
      .subscribe((status) => setIsLive(status === "SUBSCRIBED"));

    return () => {
      setIsLive(false);
      void supabase.removeChannel(channel);
    };
  }, []);

  const durationSeconds = Math.max(60, Math.floor(Number(durationMinutes) * 60));

  return (
    <main className="min-h-screen bg-slate-950 p-5 text-white">
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
                <p className="text-sm font-bold text-slate-500">Match Time</p>
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
                <p className="text-sm text-slate-400">
                  {isLive ? "Live" : "Connecting"}
                </p>
              </div>
              <input
                inputMode="numeric"
                value={durationMinutes}
                onChange={(event) =>
                  setDurationMinutes(event.target.value.replace(/\D/g, ""))
                }
                className="w-24 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-right text-xl font-black text-white outline-none"
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  updateDisplay({
                    action: "set_difficulty",
                    difficulty: "easy",
                    durationSeconds,
                  })
                }
                disabled={isSaving}
                className="rounded-xl bg-emerald-500 px-4 py-3 font-black text-emerald-950 disabled:opacity-50"
              >
                Easy
              </button>
              <button
                type="button"
                onClick={() =>
                  updateDisplay({
                    action: "set_difficulty",
                    difficulty: "hard",
                    durationSeconds,
                  })
                }
                disabled={isSaving}
                className="rounded-xl bg-amber-400 px-4 py-3 font-black text-amber-950 disabled:opacity-50"
              >
                Hard
              </button>
              <button
                type="button"
                onClick={() => updateDisplay({ action: "start", durationSeconds })}
                disabled={isSaving}
                className="rounded-xl bg-orange-500 px-4 py-3 font-black text-orange-950 disabled:opacity-50"
              >
                Start
              </button>
              <button
                type="button"
                onClick={() => updateDisplay({ action: "reset", durationSeconds })}
                disabled={isSaving}
                className="rounded-xl bg-white px-4 py-3 font-black text-slate-950 disabled:opacity-50"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={clearExistingOrders}
                disabled={isSaving}
                className="col-span-2 rounded-xl bg-red-600 px-4 py-3 font-black text-white disabled:opacity-50"
              >
                Clear Orders
              </button>
            </div>

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

                <div className="mt-4 grid gap-3">
                  {activeOrders.length === 0 ? (
                    <div className="rounded-xl bg-slate-100 p-4 text-slate-600">
                      No active cooking timer
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
                                {timing.phase}
                              </p>
                            </div>
                            <p className="text-3xl font-black tabular-nums">
                              {formatSeconds(timing.remaining)}
                            </p>
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-lg bg-white p-2">
                              <p className="text-[11px] font-bold text-slate-500">
                                Timer
                              </p>
                              <p className="font-black">
                                {session?.player_timer_seconds ?? "--"}s
                              </p>
                            </div>
                            <div className="rounded-lg bg-white p-2">
                              <p className="text-[11px] font-bold text-slate-500">
                                Buffer
                              </p>
                              <p className="font-black">
                                {formatSeconds(timing.bufferRemaining)}
                              </p>
                            </div>
                            <div className="rounded-lg bg-white p-2">
                              <p className="text-[11px] font-bold text-slate-500">
                                Elapsed
                              </p>
                              <p className="font-black">
                                {formatSeconds(timing.elapsed)}
                              </p>
                            </div>
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
