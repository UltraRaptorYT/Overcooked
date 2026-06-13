"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Award,
  ChefHat,
  Crown,
  Loader2,
  RefreshCw,
  Sparkles,
  Trophy,
} from "lucide-react";
import { GROUPS } from "@/config/app";
import supabase from "@/lib/supabase";

type ScoreRow = {
  group: string;
  score: number | string | null;
};

type LeaderboardGroup = {
  group: string;
  score: number;
  rank: number;
  color: string;
};

const GROUP_ACCENTS: Record<string, string> = {
  "Group 1": "#fb7185",
  "Group 2": "#60a5fa",
  "Group 3": "#34d399",
  "Group 4": "#fbbf24",
  "Group 5": "#a78bfa",
  "Group 6": "#22d3ee",
};

function normalizeScore(score: ScoreRow["score"]) {
  const value = typeof score === "number" ? score : Number(score ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function buildLeaderboard(
  rows: ScoreRow[],
  hidden: boolean = false,
): LeaderboardGroup[] {
  const scoreByGroup = new Map(
    rows.map((row) => [row.group, normalizeScore(row.score)]),
  );

  return GROUPS.map((group) => ({
    group: group.name,
    score: scoreByGroup.get(group.name) ?? 0,
    color: GROUP_ACCENTS[group.name] ?? "#f97316",
    rank: 0,
  }))
    .sort((a, b) =>
      !hidden ? 1 : b.score - a.score || a.group.localeCompare(b.group),
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function rankLabel(rank: number) {
  if (rank === 1) return "Champion";
  if (rank === 2) return "Runner-up";
  if (rank === 3) return "Third place";
  return `Place ${rank}`;
}

function medalColor(rank: number) {
  if (rank === 1) return "#facc15";
  if (rank === 2) return "#e5e7eb";
  if (rank === 3) return "#fb923c";
  return "#94a3b8";
}

export default function LeaderboardClient() {
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leaderboard = useMemo(
    () => buildLeaderboard(scores, revealed),
    [scores, revealed],
  );
  const podium = leaderboard.slice(0, 3);

  async function loadScores(options?: { quiet?: boolean }) {
    if (options?.quiet) {
      setRefreshing(true);
    }

    const { data, error: scoreError } = await supabase
      .from("overcooked_26_score")
      .select("group, score")
      .order("score", { ascending: false });

    if (scoreError) {
      setError(scoreError.message);
    } else {
      setScores(data ?? []);
      setError(null);
    }

    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadScores();
    }, 0);

    const channel = supabase
      .channel("overcooked-26-score-leaderboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "overcooked_26_score" },
        () => void loadScores({ quiet: true }),
      )
      .subscribe();

    return () => {
      window.clearTimeout(initialLoad);
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <main className="min-h-screen overflow-hidden bg-[#120f0d] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(251,191,36,0.16),transparent_26%),radial-gradient(circle_at_82%_20%,rgba(34,211,238,0.12),transparent_24%),linear-gradient(135deg,rgba(248,113,113,0.10),transparent_42%)]" />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/10 to-transparent" />
      </div>

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
              <ChefHat className="size-3.5" />
              Overcooked 26
            </div>
            <h1 className="text-4xl font-black tracking-tight sm:text-6xl lg:text-7xl">
              Leaderboard
            </h1>
          </div>

          <button
            type="button"
            onClick={() => void loadScores({ quiet: true })}
            disabled={refreshing}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white shadow-lg shadow-black/20 transition hover:bg-white/15 disabled:opacity-50"
          >
            <RefreshCw
              className={`size-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </header>

        <div className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[0.96fr_1.04fr]">
          <section className="relative">
            <div className="absolute -inset-8 rounded-full bg-amber-300/10 blur-3xl" />
            <div className="relative rounded-[2rem] border border-white/15 bg-black/30 p-5 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
              <div className="mb-7 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/50">
                    Final Standings
                  </p>
                  <p className="mt-1 text-lg text-white/75">
                    {revealed
                      ? "The kitchen has spoken."
                      : "Scores are locked until reveal."}
                  </p>
                </div>
                <Trophy className="size-10 text-amber-300" />
              </div>

              <button
                type="button"
                onClick={() => setRevealed(true)}
                disabled={loading || revealed}
                className="group mb-8 flex h-16 w-full items-center justify-center gap-3 rounded-xl bg-amber-300 px-5 text-lg font-black text-stone-950 shadow-[0_0_40px_rgba(251,191,36,0.32)] transition hover:-translate-y-0.5 hover:bg-amber-200 disabled:translate-y-0 disabled:opacity-70"
              >
                {loading ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : revealed ? (
                  <Crown className="size-6" />
                ) : (
                  <Sparkles className="size-6 transition group-hover:rotate-12" />
                )}
                {loading
                  ? "Loading Scores"
                  : revealed
                    ? "Winners Revealed"
                    : "Reveal Winners"}
              </button>

              {error ? (
                <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              ) : (
                <div className="grid min-h-[16rem] items-end gap-3 sm:grid-cols-3">
                  {[podium[1], podium[0], podium[2]].map((entry, index) => {
                    if (!entry) return null;
                    const height =
                      entry.rank === 1
                        ? "h-72"
                        : entry.rank === 2
                          ? "h-64"
                          : "h-50";

                    return (
                      <article
                        key={entry.group}
                        className={`relative flex ${height} flex-col justify-between rounded-xl border border-white/15 bg-white/10 p-4 opacity-0 backdrop-blur ${revealed ? "animate-podium-pop" : ""}`}
                        style={{
                          animationDelay: `${index * 180 + 250}ms`,
                          boxShadow: revealed
                            ? `0 0 46px ${entry.color}30`
                            : "none",
                        }}
                      >
                        <div
                          className="absolute inset-x-4 top-0 h-1 rounded-full"
                          style={{ background: entry.color }}
                        />
                        <div>
                          <div
                            className="mb-3 inline-flex size-12 items-center justify-center rounded-full text-xl font-black text-stone-950"
                            style={{ background: medalColor(entry.rank) }}
                          >
                            {entry.rank}
                          </div>
                          <h2 className="text-2xl font-black">{entry.group}</h2>
                          <p className="text-sm font-semibold text-white/55">
                            {rankLabel(entry.rank)}
                          </p>
                        </div>
                        <p className="text-5xl font-black tabular-nums">
                          {entry.score}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3">
            {leaderboard.map((entry, index) => (
              <article
                key={entry.group}
                className={`grid min-h-20 grid-cols-[4rem_1fr_auto] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.07] px-4 py-3 shadow-lg shadow-black/15 backdrop-blur transition ${revealed ? "animate-leaderboard-reveal" : "opacity-60"}`}
                style={{
                  animationDelay: `${index * 120 + 680}ms`,
                  borderColor: revealed ? `${entry.color}55` : undefined,
                }}
              >
                <div
                  className="flex size-12 items-center justify-center rounded-lg text-xl font-black text-stone-950"
                  style={{
                    background: revealed ? medalColor(entry.rank) : "#ffffff22",
                    color: revealed ? "#120f0d" : "#ffffff66",
                  }}
                >
                  {revealed ? entry.rank : "?"}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {entry.rank <= 3 && revealed ? (
                      <Award
                        className="size-4 shrink-0"
                        style={{ color: medalColor(entry.rank) }}
                      />
                    ) : null}
                    <h3 className="truncate text-xl font-black">
                      {entry.group}
                    </h3>
                  </div>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                    {revealed ? rankLabel(entry.rank) : "Position hidden"}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-3xl font-black tabular-nums">
                    {revealed ? entry.score : "--"}
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                    Score
                  </p>
                </div>
              </article>
            ))}
          </section>
        </div>
      </section>
    </main>
  );
}
