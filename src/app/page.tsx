"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { GROUPS, COOLDOWN_GAP, type GroupConfig } from "@/config/app";

// ─── Types ──────────────────────────────────────────────────────
interface AssignedOrder {
  orderNumber: number;
  text: string;
  globalSeq: number;
  groupId: number;
}

interface HistoryEntry extends AssignedOrder {
  id: string;
  createdAt: string;
}

// ─── Color mappings for group cards ─────────────────────────────
const GROUP_COLORS: Record<
  string,
  { bg: string; ring: string; text: string; muted: string; accent: string }
> = {
  "bg-rose-500": {
    bg: "rgba(244,63,94,0.08)",
    ring: "rgba(244,63,94,0.25)",
    text: "#fb7185",
    muted: "rgba(244,63,94,0.5)",
    accent: "#f43f5e",
  },
  "bg-blue-500": {
    bg: "rgba(59,130,246,0.08)",
    ring: "rgba(59,130,246,0.25)",
    text: "#60a5fa",
    muted: "rgba(59,130,246,0.5)",
    accent: "#3b82f6",
  },
  "bg-emerald-500": {
    bg: "rgba(16,185,129,0.08)",
    ring: "rgba(16,185,129,0.25)",
    text: "#34d399",
    muted: "rgba(16,185,129,0.5)",
    accent: "#10b981",
  },
  "bg-amber-500": {
    bg: "rgba(245,158,11,0.08)",
    ring: "rgba(245,158,11,0.25)",
    text: "#fbbf24",
    muted: "rgba(245,158,11,0.5)",
    accent: "#f59e0b",
  },
  "bg-violet-500": {
    bg: "rgba(139,92,246,0.08)",
    ring: "rgba(139,92,246,0.25)",
    text: "#a78bfa",
    muted: "rgba(139,92,246,0.5)",
    accent: "#8b5cf6",
  },
};

const fallbackColor = {
  bg: "rgba(232,87,42,0.08)",
  ring: "rgba(232,87,42,0.25)",
  text: "#e8572a",
  muted: "rgba(232,87,42,0.5)",
  accent: "#e8572a",
};

function getColor(colorClass: string) {
  return GROUP_COLORS[colorClass] ?? fallbackColor;
}

// ─── Mini Waveform ──────────────────────────────────────────────
function MiniWave({ active, color }: { active: boolean; color: string }) {
  return (
    <div className="flex items-center gap-[2px] h-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full transition-all duration-200"
          style={{
            height: active ? `${40 + Math.sin(i * 1.2) * 60}%` : "20%",
            background: active ? color : "var(--border)",
            animationName: active ? "wave" : "none",
            animationDuration: active ? `${0.5 + i * 0.1}s` : "0s",
            animationTimingFunction: "ease-in-out",
            animationIterationCount: active ? "infinite" : "0",
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Group Card ─────────────────────────────────────────────────
function GroupCard({
  group,
  currentOrder,
  isSpeaking,
  isLoading,
  onCallOrder,
}: {
  group: GroupConfig;
  currentOrder: AssignedOrder | null;
  isSpeaking: boolean;
  isLoading: boolean;
  onCallOrder: () => void;
}) {
  const c = getColor(group.color);

  return (
    <div
      className="relative rounded-2xl p-5 transition-all duration-300"
      style={{
        background: "var(--surface)",
        border: `1px solid ${currentOrder ? c.ring : "var(--border)"}`,
        boxShadow: isSpeaking ? `0 0 40px ${c.ring}` : "none",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-3 h-3 rounded-full"
            style={{ background: c.accent }}
          />
          <span className="text-sm font-medium" style={{ color: c.text }}>
            {group.name}
          </span>
        </div>
        <MiniWave active={isSpeaking} color={c.accent} />
      </div>

      {/* Current Order Display */}
      <div className="mb-5 min-h-[72px] flex flex-col justify-center">
        {currentOrder ? (
          <div className="animate-fade-in">
            <div
              className="mono text-4xl font-medium tracking-wide"
              style={{ color: "var(--text)" }}
            >
              #{currentOrder.orderNumber}
            </div>
            <div
              className="text-xs mt-1.5 truncate"
              style={{ color: "var(--muted)" }}
            >
              Seq #{currentOrder.globalSeq} · {currentOrder.text}
            </div>
          </div>
        ) : (
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            No order assigned yet
          </div>
        )}
      </div>

      {/* Call Button */}
      <button
        onClick={onCallOrder}
        disabled={isLoading || isSpeaking}
        className="w-full py-3 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: isLoading ? c.bg : c.accent,
          color: isLoading ? c.text : "white",
          boxShadow:
            !isLoading && !isSpeaking ? `0 4px 20px ${c.ring}` : "none",
        }}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray="32"
                strokeLinecap="round"
              />
            </svg>
            Assigning…
          </span>
        ) : isSpeaking ? (
          "Speaking…"
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3v18M8 7v10M4 10v4M16 7v10M20 10v4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Call Order
          </span>
        )}
      </button>

      {/* Pulse ring when speaking */}
      {isSpeaking && (
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            border: `2px solid ${c.accent}`,
            animation: "pulse-ring 1.5s ease-out infinite",
          }}
        />
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────
export default function KioskPage() {
  const [currentOrders, setCurrentOrders] = useState<
    Record<number, AssignedOrder>
  >({});
  const [loadingGroups, setLoadingGroups] = useState<Set<number>>(new Set());
  const [speakingGroup, setSpeakingGroup] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const res = await fetch("/api/history");
      const json = await res.json();
      if (json.history) setHistory(json.history);
    } catch {
      // Silently fail — history is non-critical
    }
  };

  const speak = useCallback((text: string, groupId: number): Promise<void> => {
    return new Promise((resolve) => {
      if (!synthRef.current) {
        resolve();
        return;
      }
      synthRef.current.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Try to use an English voice
      const voices = synthRef.current.getVoices();
      const english =
        voices.find((v) => v.lang.startsWith("en") && v.default) ||
        voices.find((v) => v.lang.startsWith("en"));
      if (english) utterance.voice = english;

      utterance.onstart = () => setSpeakingGroup(groupId);
      utterance.onend = () => {
        setSpeakingGroup(null);
        resolve();
      };
      utterance.onerror = () => {
        setSpeakingGroup(null);
        resolve();
      };

      synthRef.current.speak(utterance);
    });
  }, []);

  const callOrder = useCallback(
    async (groupId: number) => {
      setError(null);

      setLoadingGroups((prev) => new Set(prev).add(groupId));

      try {
        const res = await fetch("/api/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupId }),
        });

        const json = await res.json();

        if (!res.ok) {
          setError(json.error ?? "Failed to assign order.");
          return;
        }

        const order: AssignedOrder = json;

        setCurrentOrders((prev) => ({ ...prev, [groupId]: order }));
        setLoadingGroups((prev) => {
          const next = new Set(prev);
          next.delete(groupId);
          return next;
        });

        // Speak the order
        await speak(
          `Order No ${[...String(order.orderNumber)].join(" ")} - ${order.text}`,
          groupId,
        );

        // Refresh history
        loadHistory();
      } catch {
        setError("Network error — check your connection.");
      } finally {
        setLoadingGroups((prev) => {
          const next = new Set(prev);
          next.delete(groupId);
          return next;
        });
      }
    },
    [speak],
  );

  const resetAll = async () => {
    if (!confirm("Reset all assignments? This clears the entire history."))
      return;

    setResetting(true);
    try {
      await fetch("/api/reset", { method: "POST" });
      setCurrentOrders({});
      setHistory([]);
      setError(null);
    } catch {
      setError("Failed to reset.");
    } finally {
      setResetting(false);
    }
  };

  // Grid columns based on group count
  const gridCols =
    GROUPS.length <= 3
      ? "grid-cols-1 sm:grid-cols-3"
      : GROUPS.length <= 4
        ? "grid-cols-2 lg:grid-cols-4"
        : "grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: "var(--text)" }}
            >
              Order Kiosk
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              {GROUPS.length} groups · {COOLDOWN_GAP}-order cooldown gap
            </p>
          </div>
          <button
            onClick={resetAll}
            disabled={resetting}
            className="px-4 py-2 rounded-lg text-xs font-medium transition-all hover:bg-red-500/10"
            style={{
              color: "#ef4444",
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            {resetting ? "Resetting…" : "Reset All"}
          </button>
        </header>

        {/* Error banner */}
        {error && (
          <div
            className="mb-6 px-4 py-3 rounded-xl text-sm animate-fade-in"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#fca5a5",
            }}
          >
            {error}
          </div>
        )}

        {/* Group Grid */}
        <div className={`grid ${gridCols} gap-4`}>
          {GROUPS.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              currentOrder={currentOrders[group.id] ?? null}
              isSpeaking={speakingGroup === group.id}
              isLoading={loadingGroups.has(group.id)}
              onCallOrder={() => callOrder(group.id)}
            />
          ))}
        </div>

        {/* History */}
        {history.length > 0 && (
          <section className="mt-10">
            <h2
              className="text-[11px] font-semibold tracking-widest uppercase mb-4"
              style={{ color: "var(--muted)" }}
            >
              Assignment History
            </h2>
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--elevated)" }}>
                    <th
                      className="px-4 py-2.5 text-left font-medium text-xs"
                      style={{ color: "var(--muted)" }}
                    >
                      Seq
                    </th>
                    <th
                      className="px-4 py-2.5 text-left font-medium text-xs"
                      style={{ color: "var(--muted)" }}
                    >
                      Order
                    </th>
                    <th
                      className="px-4 py-2.5 text-left font-medium text-xs"
                      style={{ color: "var(--muted)" }}
                    >
                      Group
                    </th>
                    <th
                      className="px-4 py-2.5 text-right font-medium text-xs"
                      style={{ color: "var(--muted)" }}
                    >
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 20).map((entry, i) => {
                    const group = GROUPS.find((g) => g.id === entry.groupId);
                    const c = group ? getColor(group.color) : fallbackColor;
                    return (
                      <tr
                        key={entry.id}
                        style={{
                          background:
                            i % 2 === 0 ? "var(--surface)" : "var(--bg)",
                          borderTop: "1px solid var(--border)",
                        }}
                      >
                        <td
                          className="px-4 py-2.5 mono text-xs"
                          style={{ color: "var(--muted)" }}
                        >
                          #{entry.globalSeq}
                        </td>
                        <td
                          className="px-4 py-2.5 mono font-medium"
                          style={{ color: "var(--text)" }}
                        >
                          #{entry.orderNumber}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md"
                            style={{ background: c.bg, color: c.text }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: c.accent }}
                            />
                            {group?.name ?? `Group ${entry.groupId}`}
                          </span>
                        </td>
                        <td
                          className="px-4 py-2.5 text-right text-xs"
                          style={{ color: "var(--muted)" }}
                        >
                          {new Date(entry.createdAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
