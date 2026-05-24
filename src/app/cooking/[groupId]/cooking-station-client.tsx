"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as T } from "@/lib/overcooked-26/tables";

type CookingLookupData = {
  order: {
    id: string;
    orderNo: string;
    difficulty: "easy" | "hard";
    requiredTotalCookTimeSeconds?: number;
  };
  groupOrder: {
    id: string;
    status: string;
    assignedAt: string;
    cookingStartedAt: string | null;
    cookingCompletedAt: string | null;
  };
  activeCookingSession: CookingSession | null;
  latestCookingSession: CookingSession | null;
};

type CookingSession = {
  id: string;
  buffer_seconds: number;
  player_timer_seconds: number | null;
  started_at: string;
  removed_at?: string | null;
  actual_seconds?: number | null;
  result: "pending" | "undercooked" | "correct" | "overcooked" | "not_required";
};

type Props = {
  groupId: string;
  groupName: string;
};

type KeypadTarget = "order" | "timer";

const STABLE_BLOCK_MS = 800;
const STABLE_UNBLOCK_MS = 800;
const DEFAULT_BUFFER_SECONDS = 5;
const BRIGHTNESS_THRESHOLD = 45;
const KEYPAD_VALUES = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

function formatDecimalSeconds(seconds: number) {
  const sign = seconds < 0 ? "-" : "";
  const absoluteSeconds = Math.abs(seconds);
  const mins = Math.floor(absoluteSeconds / 60);
  const secs = absoluteSeconds % 60;
  return `${sign}${mins}:${secs.toFixed(2).padStart(5, "0")}`;
}

function getTimerStatus(remainingSeconds: number, bufferRemainingSeconds: number) {
  if (remainingSeconds > 0) return "Cooking...";
  if (bufferRemainingSeconds > 0) return "Buffer time";
  return "Past buffer";
}

export function CookingStationClient({ groupId, groupName }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const blockedSinceRef = useRef<number | null>(null);
  const unblockedSinceRef = useRef<number | null>(null);
  const activeSessionRef = useRef<CookingSession | null>(null);
  const selectedOrderRef = useRef<CookingLookupData | null>(null);
  const orderNoInputRef = useRef("");
  const playerTimerSecondsRef = useRef(0);
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const [orders, setOrders] = useState<CookingLookupData[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<CookingLookupData | null>(
    null,
  );
  const [orderNoInput, setOrderNoInput] = useState("");
  const [playerTimerSecondsInput, setPlayerTimerSecondsInput] = useState("");
  const [keypadTarget, setKeypadTarget] = useState<KeypadTarget>("order");

  const [activeSession, setActiveSession] = useState<CookingSession | null>(
    null,
  );
  const [latestSession, setLatestSession] = useState<CookingSession | null>(
    null,
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  activeSessionRef.current = activeSession;
  selectedOrderRef.current = selectedOrder;
  orderNoInputRef.current = orderNoInput;
  playerTimerSecondsRef.current = Number(playerTimerSecondsInput);

  const typedTimerSeconds = Number(playerTimerSecondsInput) || 0;

  const timerStatus = useMemo(() => {
    if (!activeSession) return "No active timer";
    const countdownTotal =
      activeSession.player_timer_seconds ?? typedTimerSeconds;
    const remaining = countdownTotal - elapsedSeconds;
    const bufferRemaining =
      countdownTotal + activeSession.buffer_seconds - elapsedSeconds;
    return getTimerStatus(remaining, bufferRemaining);
  }, [activeSession, elapsedSeconds, typedTimerSeconds]);

  const countdownTotal =
    activeSession?.player_timer_seconds ?? typedTimerSeconds;
  const remainingSeconds = activeSession
    ? countdownTotal - elapsedSeconds
    : countdownTotal;
  const bufferRemainingSeconds = activeSession
    ? countdownTotal + activeSession.buffer_seconds - elapsedSeconds
    : DEFAULT_BUFFER_SECONDS;
  const isInBufferTime =
    Boolean(activeSession) && remainingSeconds <= 0 && bufferRemainingSeconds > 0;

  function selectOrder(order: CookingLookupData | null) {
    setSelectedOrder(order);
    setOrderNoInput(order?.order.orderNo ?? "");
    setActiveSession(order?.activeCookingSession ?? null);
    setLatestSession(order?.latestCookingSession ?? null);
  }

  function selectOrderByNumber(orderNo: string) {
    setOrderNoInput(orderNo);

    const nextOrder =
      orders.find((entry) => entry.order.orderNo === orderNo.trim()) ?? null;

    setSelectedOrder(nextOrder);
    setActiveSession(nextOrder?.activeCookingSession ?? null);
    setLatestSession(nextOrder?.latestCookingSession ?? null);

    if (nextOrder) {
      console.log("[Cooking test] Selected order", {
        orderNo: nextOrder.order.orderNo,
        groupOrderId: nextOrder.groupOrder.id,
        status: nextOrder.groupOrder.status,
        requiredTotalCookTimeSeconds:
          nextOrder.order.requiredTotalCookTimeSeconds,
        activeCookingSession: nextOrder.activeCookingSession,
        latestActualSeconds: nextOrder.latestCookingSession?.actual_seconds,
      });
    }
  }

  function appendKeypadValue(value: string) {
    if (keypadTarget === "order") {
      selectOrderByNumber(`${orderNoInput}${value}`);
      return;
    }

    setPlayerTimerSecondsInput((currentValue) =>
      currentValue === "0" ? value : `${currentValue}${value}`,
    );
  }

  function backspaceKeypadValue() {
    if (keypadTarget === "order") {
      selectOrderByNumber(orderNoInput.slice(0, -1));
      return;
    }

    setPlayerTimerSecondsInput((currentValue) => currentValue.slice(0, -1));
  }

  function clearKeypadValue() {
    if (keypadTarget === "order") {
      selectOrderByNumber("");
      return;
    }

    setPlayerTimerSecondsInput("");
  }

  async function loadGroupOrders({ quiet = false } = {}) {
    setErrorMessage(null);
    if (!quiet) {
      setMessage(null);
    }
    setSelectedOrder(null);
    setActiveSession(null);
    setLatestSession(null);

    try {
      const response = await fetch(
        `/api/cooking/groups/${groupId}/active-orders`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to find active order");
      }

      const loadedOrders = (data.orders ?? []) as CookingLookupData[];
      console.table(
        loadedOrders.map((entry) => ({
          orderNo: entry.order.orderNo,
          groupOrderId: entry.groupOrder.id,
          status: entry.groupOrder.status,
          requiredSeconds: entry.order.requiredTotalCookTimeSeconds,
          playerTimerSeconds:
            entry.activeCookingSession?.player_timer_seconds ?? null,
          actualSeconds: entry.latestCookingSession?.actual_seconds ?? null,
        })),
      );

      const nextSelectedOrder =
        loadedOrders.find(
          (order) =>
            order.groupOrder.id === selectedOrderRef.current?.groupOrder.id,
        ) ??
        loadedOrders.find(
          (order) => order.order.orderNo === orderNoInputRef.current,
        ) ??
        loadedOrders.find((order) => order.activeCookingSession) ??
        null;

      setOrders(loadedOrders);
      selectOrder(nextSelectedOrder);

      if (nextSelectedOrder?.activeCookingSession) {
        setMessage(
          "Existing active cooking session found. Timer will continue locally.",
        );
      } else if (nextSelectedOrder) {
        setMessage(
          "Order found. Enter your timer, then cover the camera to start cooking.",
        );
      } else {
        setMessage("Orders loaded. Enter an order number and timer to cook.");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong",
      );
    }
  }

  async function startCooking() {
    const order = selectedOrderRef.current;
    if (isStartingRef.current) return;

    if (!order) {
      setErrorMessage("Enter a valid active order number first");
      return;
    }

    const timerSeconds = Math.max(0, Math.floor(playerTimerSecondsRef.current));

    if (!Number.isFinite(timerSeconds) || timerSeconds <= 0) {
      setErrorMessage("Please enter a valid cooking timer first");
      return;
    }

    isStartingRef.current = true;
    setErrorMessage(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/group-orders/${order.groupOrder.id}/cook/start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bufferSeconds: DEFAULT_BUFFER_SECONDS,
            groupId,
            playerTimerSeconds: timerSeconds,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to start cooking");
      }

      setActiveSession(data.session);
      setLatestSession(data.session);
      setOrders((currentOrders) =>
        currentOrders.map((currentOrder) =>
          currentOrder.groupOrder.id === order.groupOrder.id
            ? {
                ...currentOrder,
                groupOrder: {
                  ...currentOrder.groupOrder,
                  status: "cooking",
                  cookingStartedAt: data.session.started_at,
                },
                activeCookingSession: data.session,
                latestCookingSession: data.session,
              }
            : currentOrder,
        ),
      );
      setMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong",
      );
    } finally {
      isStartingRef.current = false;
    }
  }

  async function stopCooking() {
    const session = activeSessionRef.current;
    if (!session || isStoppingRef.current) return;

    isStoppingRef.current = true;
    setErrorMessage(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/cooking-sessions/${session.id}/stop`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to stop cooking");
      }

      setActiveSession(null);
      setLatestSession(data.session);
      setOrders((currentOrders) =>
        currentOrders.map((currentOrder) =>
          currentOrder.groupOrder.id === selectedOrderRef.current?.groupOrder.id
            ? {
                ...currentOrder,
                groupOrder: {
                  ...currentOrder.groupOrder,
                  status: "cooked",
                  cookingCompletedAt: data.session.removed_at,
                },
                activeCookingSession: null,
                latestCookingSession: data.session,
              }
            : currentOrder,
        ),
      );
      setSelectedOrder(null);
      setOrderNoInput("");
      setPlayerTimerSecondsInput("");
      setKeypadTarget("order");
      setMessage("Cooking stopped and saved.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong",
      );
    } finally {
      isStoppingRef.current = false;
    }
  }

  useEffect(() => {
    loadGroupOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    const channel = supabase
      .channel(`cooking-station-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: T.groupOrders,
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          void loadGroupOrders({ quiet: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: T.cookingSessions,
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          void loadGroupOrders({ quiet: true });
        },
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    return () => {
      setIsLive(false);
      void supabase.removeChannel(channel);
    };
    // loadGroupOrders intentionally reads the latest selected order/input values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? `Camera error: ${error.message}`
            : "Camera permission was denied or unavailable",
        );
      }
    }

    startCamera();

    return () => {
      mounted = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= 2) {
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        if (ctx) {
          canvas.width = 80;
          canvas.height = 60;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          let total = 0;

          for (let i = 0; i < imageData.data.length; i += 4) {
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];
            total += (r + g + b) / 3;
          }

          const averageBrightness = Math.round(
            total / (imageData.data.length / 4),
          );
          const blocked = averageBrightness < BRIGHTNESS_THRESHOLD;
          const now = Date.now();

          if (blocked) {
            unblockedSinceRef.current = null;
            blockedSinceRef.current ??= now;

            if (
              !activeSessionRef.current &&
              selectedOrderRef.current &&
              now - blockedSinceRef.current >= STABLE_BLOCK_MS
            ) {
              startCooking();
            }
          } else {
            blockedSinceRef.current = null;
            unblockedSinceRef.current ??= now;

            if (
              activeSessionRef.current &&
              now - unblockedSinceRef.current >= STABLE_UNBLOCK_MS
            ) {
              stopCooking();
            }
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
    // The camera loop reads active order/session/timer values from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeSession) {
      setElapsedSeconds(0);
      return;
    }

    const interval = window.setInterval(() => {
      const startedAt = new Date(activeSession.started_at).getTime();
      const elapsed = Math.max(0, (Date.now() - startedAt) / 1000);
      setElapsedSeconds(elapsed);
    }, 50);

    return () => window.clearInterval(interval);
  }, [activeSession]);

  return (
    <main className="h-[100dvh] overflow-hidden bg-orange-50 p-3 sm:p-5">
      <style jsx>{`
        @keyframes flame-rise {
          0% {
            transform: translateY(18px) scale(0.9) rotate(-8deg);
            opacity: 0.45;
          }
          45% {
            opacity: 1;
          }
          100% {
            transform: translateY(-18px) scale(1.08) rotate(8deg);
            opacity: 0.62;
          }
        }

        @keyframes heat-pulse {
          0%,
          100% {
            transform: scale(0.98);
            opacity: 0.78;
          }
          50% {
            transform: scale(1.04);
            opacity: 1;
          }
        }

        .flame {
          position: absolute;
          bottom: 28px;
          left: 50%;
          border-radius: 55% 55% 50% 50%;
          transform-origin: center bottom;
          animation: flame-rise 0.82s ease-in-out infinite alternate;
        }

        .flame-a {
          width: 150px;
          height: 210px;
          margin-left: -75px;
          background: linear-gradient(180deg, #fff4a8 0%, #f97316 48%, #dc2626 100%);
        }

        .flame-b {
          width: 96px;
          height: 150px;
          margin-left: -26px;
          background: linear-gradient(180deg, #fff7cc 0%, #fb923c 62%, #ea580c 100%);
          animation-delay: -0.24s;
        }

        .flame-c {
          width: 86px;
          height: 132px;
          margin-left: -86px;
          background: linear-gradient(180deg, #fed7aa 0%, #f97316 58%, #b91c1c 100%);
          animation-delay: -0.42s;
        }

        .heat-ring {
          animation: heat-pulse 1.1s ease-in-out infinite;
        }
      `}</style>

      <div className="mx-auto grid h-full max-w-5xl grid-rows-[auto_1fr] gap-3 sm:gap-4">
        <section className="rounded-2xl bg-white p-3 shadow-sm sm:rounded-3xl sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase text-orange-600 sm:text-sm">
                Cooking Station
              </p>
              <h1 className="mt-1 text-2xl font-black text-orange-950 sm:text-4xl">
                {groupName}
              </h1>
            </div>

            <div className="rounded-xl bg-orange-50 px-3 py-2 text-right sm:rounded-2xl sm:px-4 sm:py-3">
              <p className="text-[11px] font-bold uppercase text-orange-700">
                Orders
              </p>
              <p className="text-sm font-black text-orange-950">
                {isLive ? "Live" : "Connecting"}
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:mt-5 sm:gap-4">
            <label className="rounded-xl border border-orange-100 bg-orange-50 p-3 sm:rounded-2xl sm:p-4">
              <span className="text-xs font-bold text-orange-900 sm:text-sm">
                1. Enter order number
              </span>
              <input
                inputMode="numeric"
                value={orderNoInput}
                onChange={(event) =>
                  selectOrderByNumber(event.target.value.replace(/\D/g, ""))
                }
                onFocus={() => setKeypadTarget("order")}
                placeholder="Order no."
                className="mt-1 w-full rounded-xl border border-orange-200 px-3 py-2 text-2xl font-black text-orange-950 outline-none transition focus:border-orange-500 sm:mt-2 sm:px-4 sm:py-4 sm:text-3xl"
              />
            </label>

            <label className="rounded-xl border border-orange-100 bg-orange-50 p-3 sm:rounded-2xl sm:p-4">
              <span className="text-xs font-bold text-orange-900 sm:text-sm">
                2. Enter timer seconds
              </span>
              <input
                inputMode="numeric"
                value={playerTimerSecondsInput}
                onChange={(event) =>
                  setPlayerTimerSecondsInput(
                    event.target.value.replace(/\D/g, ""),
                  )
                }
                onFocus={() => setKeypadTarget("timer")}
                placeholder="Seconds"
                className="mt-1 w-full rounded-xl border border-orange-200 px-3 py-2 text-2xl font-black text-orange-950 outline-none transition focus:border-orange-500 sm:mt-2 sm:px-4 sm:py-4 sm:text-3xl"
              />
            </label>
          </div>

          <div className="mt-3 grid grid-cols-[1fr_auto] gap-3">
            <div className="grid grid-cols-6 gap-2">
              {KEYPAD_VALUES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => appendKeypadValue(value)}
                  className="rounded-xl bg-orange-100 py-2 text-lg font-black text-orange-950 transition hover:bg-orange-200"
                >
                  {value}
                </button>
              ))}
              <button
                type="button"
                onClick={() => appendKeypadValue("0")}
                className="rounded-xl bg-orange-100 py-2 text-lg font-black text-orange-950 transition hover:bg-orange-200"
              >
                0
              </button>
              <button
                type="button"
                onClick={backspaceKeypadValue}
                className="rounded-xl bg-slate-100 py-2 text-lg font-black text-slate-950 transition hover:bg-slate-200"
              >
                Del
              </button>
            </div>
            <button
              type="button"
              onClick={clearKeypadValue}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white transition hover:bg-slate-700"
            >
              Clear
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">
            <div className="rounded-xl bg-slate-50 p-3 sm:rounded-2xl sm:p-4">
              <p className="text-[11px] font-bold text-slate-700 sm:text-sm">
                Orders
              </p>
              <p className="text-2xl font-black text-slate-950 sm:text-3xl">
                {orders.length}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 sm:rounded-2xl sm:p-4">
              <p className="text-[11px] font-bold text-slate-700 sm:text-sm">
                Selected
              </p>
              <p className="text-2xl font-black text-slate-950 sm:text-3xl">
                {selectedOrder ? `#${selectedOrder.order.orderNo}` : "--"}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 sm:rounded-2xl sm:p-4">
              <p className="text-[11px] font-bold text-slate-700 sm:text-sm">
                Timer
              </p>
              <p className="text-2xl font-black text-slate-950 sm:text-3xl">
                {formatDecimalSeconds(remainingSeconds)}
              </p>
            </div>
          </div>

          {errorMessage && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 sm:mt-5 sm:rounded-2xl sm:p-4">
              {errorMessage}
            </div>
          )}

          {message && (
            <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm font-medium text-orange-800 sm:mt-5 sm:rounded-2xl sm:p-4">
              {message}
            </div>
          )}
        </section>

        <section className="min-h-0 rounded-2xl bg-white p-3 shadow-sm sm:rounded-3xl sm:p-5">
          <video
            ref={videoRef}
            playsInline
            muted
            className="pointer-events-none absolute h-px w-px opacity-0"
          />
          <canvas ref={canvasRef} className="hidden" />

          <div className="grid h-full min-h-0 grid-rows-[1fr_auto] gap-3 lg:grid-cols-[1fr_280px] lg:grid-rows-1 lg:gap-6">
            <div
              className={`relative min-h-0 overflow-hidden rounded-2xl border sm:rounded-3xl ${
                activeSession
                  ? "border-orange-200 bg-orange-950"
                  : "border-orange-100 bg-orange-50"
              }`}
            >
              {activeSession ? (
                <>
                  <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-red-950 via-orange-900 to-transparent" />
                  <div className="heat-ring absolute inset-x-12 bottom-10 h-28 rounded-full bg-orange-500/30 blur-2xl" />
                  <div className="flame flame-a" />
                  <div className="flame flame-b" />
                  <div className="flame flame-c" />
                  <div className="relative z-10 flex h-full min-h-[220px] flex-col items-center justify-center p-5 text-center text-white sm:min-h-[360px] sm:p-8">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-200 sm:text-sm">
                      Cooking
                    </p>
                    <p className="mt-2 text-6xl font-black sm:mt-4 sm:text-7xl">
                      {formatDecimalSeconds(remainingSeconds)}
                    </p>
                    <p className="mt-2 text-xl font-bold sm:mt-3 sm:text-2xl">
                      {isInBufferTime
                        ? `Buffer: ${formatDecimalSeconds(bufferRemainingSeconds)}`
                        : timerStatus}
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex h-full min-h-[220px] flex-col items-center justify-center p-5 text-center sm:min-h-[360px] sm:p-8">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600 sm:text-sm">
                    Ready
                  </p>
                  <p className="mt-2 text-3xl font-black text-orange-950 sm:mt-4 sm:text-5xl">
                    Cover camera to start
                  </p>
                  <p className="mt-2 max-w-md text-sm text-orange-800 sm:mt-3 sm:text-base">
                    Enter the order number and timer first. Uncover the camera
                    when cooking is done.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 content-start gap-3 lg:grid-cols-1">
              <button
                type="button"
                onClick={startCooking}
                disabled={Boolean(activeSession)}
                className="rounded-xl bg-orange-600 px-5 py-3 font-bold text-white transition hover:bg-orange-700 disabled:opacity-50 sm:rounded-2xl sm:py-4"
              >
                Start
              </button>
              <button
                type="button"
                onClick={stopCooking}
                disabled={!activeSession}
                className="rounded-xl bg-red-600 px-5 py-3 font-bold text-white transition hover:bg-red-700 disabled:opacity-50 sm:rounded-2xl sm:py-4"
              >
                Stop
              </button>

              {latestSession && latestSession.result !== "pending" && (
                <div className="col-span-2 rounded-xl bg-slate-50 p-3 lg:col-span-1">
                  <p className="text-xs font-bold text-slate-700 sm:text-sm">
                    Last Cook Time
                  </p>
                  <p className="text-2xl font-black text-slate-950 sm:text-3xl">
                    {latestSession.actual_seconds ?? "--"}s
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
