"use client";

import { useEffect, useRef, useState } from "react";
import supabase from "@/lib/supabase";
import { OVERCOOKED_26_CONFIG } from "@/lib/overcooked-26/config";
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

type CookingStartedPayload = {
  groupId: string;
  groupOrderId: string;
  groupOrder: CookingLookupData["groupOrder"];
  order: CookingLookupData["order"];
  session: CookingSession;
};

type Props = {
  groupId: string;
  groupName: string;
};

type StartSource = "camera" | "manual";

const {
  cameraEnabled,
  cameraBrightnessDropTrigger,
  cameraBrightnessRiseTrigger,
  cameraCoveredBrightnessThreshold,
  cameraDebugEnabled,
  cameraUncoveredBrightnessThreshold,
  defaultBufferSeconds,
  stableBlockMs,
  stableUnblockMs,
} = OVERCOOKED_26_CONFIG.cooking;
const KEYPAD_VALUES = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const STARTABLE_ORDER_STATUSES = new Set(["assigned", "assembling"]);

function formatDecimalSeconds(seconds: number) {
  const sign = seconds < 0 ? "-" : "";
  const absoluteSeconds = Math.abs(seconds);
  const mins = Math.floor(absoluteSeconds / 60);
  const secs = absoluteSeconds % 60;
  return `${sign}${mins}:${secs.toFixed(2).padStart(5, "0")}`;
}

function isOrderStartable(order: CookingLookupData | null) {
  return Boolean(
    order && STARTABLE_ORDER_STATUSES.has(order.groupOrder.status),
  );
}

export function CookingStationClient({ groupId, groupName }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const blockedSinceRef = useRef<number | null>(null);
  const unblockedSinceRef = useRef<number | null>(null);
  const cameraCoveredRef = useRef(false);
  const lastBrightnessRef = useRef<number | null>(null);
  const activeSessionRef = useRef<CookingSession | null>(null);
  const startSourceRef = useRef<StartSource>(
    cameraEnabled ? "camera" : "manual",
  );
  const displayChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null,
  );
  const displayStartedAtBySessionIdRef = useRef<Record<string, number>>({});
  const selectedOrderRef = useRef<CookingLookupData | null>(null);
  const orderNoInputRef = useRef("");
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const [orders, setOrders] = useState<CookingLookupData[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<CookingLookupData | null>(
    null,
  );
  const [orderNoInput, setOrderNoInput] = useState("");

  const [activeSession, setActiveSession] = useState<CookingSession | null>(
    null,
  );
  const [latestSession, setLatestSession] = useState<CookingSession | null>(
    null,
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [useInlineKeypadOnly, setUseInlineKeypadOnly] = useState(false);
  const [cameraDebug, setCameraDebug] = useState({
    brightness: 0,
    brightnessDelta: 0,
    isBlocked: false,
    lastUpdatedAt: 0,
  });

  activeSessionRef.current = activeSession;
  selectedOrderRef.current = selectedOrder;
  orderNoInputRef.current = orderNoInput;

  const canStartCooking = !activeSession && isOrderStartable(selectedOrder);
  const showCameraDebug = cameraEnabled && cameraDebugEnabled;

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
    if (activeSessionRef.current) return;

    selectOrderByNumber(`${orderNoInput}${value}`);
  }

  function backspaceKeypadValue() {
    if (activeSessionRef.current) return;

    selectOrderByNumber(orderNoInput.slice(0, -1));
  }

  function clearKeypadValue() {
    if (activeSessionRef.current) {
      setErrorMessage("Stop cooking before clearing the station");
      return;
    }

    setSelectedOrder(null);
    setActiveSession(null);
    setLatestSession(null);
    setOrderNoInput("");
    setMessage("Station cleared. Enter the next order number.");
    setErrorMessage(null);
  }

  async function loadGroupOrders({ quiet = false } = {}) {
    setErrorMessage(null);
    if (!quiet) {
      setMessage(null);
    }

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
          "Existing active cooking session found. Stopwatch will continue locally.",
        );
      } else if (nextSelectedOrder) {
        setMessage(
          cameraEnabled
            ? "Order found. Cover the camera to start cooking."
            : "Order found. Press Start to begin cooking.",
        );
      } else {
        setMessage("Orders loaded. Enter an order number to cook.");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong",
      );
    }
  }

  async function startCooking(
    detectedAt = new Date(),
    startSource: StartSource = "manual",
  ) {
    const order = selectedOrderRef.current;
    if (isStartingRef.current) return;

    if (!order) {
      setErrorMessage("Enter a valid active order number first");
      return;
    }

    if (!isOrderStartable(order)) {
      setErrorMessage("This order has already been cooked");
      return;
    }

    isStartingRef.current = true;
    setErrorMessage(null);
    setMessage(null);
    const optimisticSession: CookingSession = {
      id: `pending-${order.groupOrder.id}`,
      buffer_seconds: defaultBufferSeconds,
      player_timer_seconds: null,
      started_at: detectedAt.toISOString(),
      removed_at: null,
      actual_seconds: null,
      result: "pending",
    };
    const previousActiveSession = activeSessionRef.current;
    const previousLatestSession = latestSession;
    startSourceRef.current = startSource;
    displayStartedAtBySessionIdRef.current[optimisticSession.id] = Date.now();
    setActiveSession(optimisticSession);
    setLatestSession(optimisticSession);
    setOrders((currentOrders) =>
      currentOrders.map((currentOrder) =>
        currentOrder.groupOrder.id === order.groupOrder.id
          ? {
              ...currentOrder,
              groupOrder: {
                ...currentOrder.groupOrder,
                status: "cooking",
                cookingStartedAt: optimisticSession.started_at,
              },
              activeCookingSession: optimisticSession,
              latestCookingSession: optimisticSession,
            }
          : currentOrder,
      ),
    );

    try {
      const response = await fetch(
        `/api/group-orders/${order.groupOrder.id}/cook/start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bufferSeconds: defaultBufferSeconds,
            detectedAt: detectedAt.toISOString(),
            groupId,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to start cooking");
      }

      startSourceRef.current = startSource;
      displayStartedAtBySessionIdRef.current[data.session.id] = Date.now();
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
      void displayChannelRef.current?.send({
        type: "broadcast",
        event: "cooking-started",
        payload: {
          groupId,
          groupOrderId: order.groupOrder.id,
          groupOrder: {
            ...order.groupOrder,
            status: "cooking",
            cookingStartedAt: data.session.started_at,
          },
          order: order.order,
          session: data.session,
        } satisfies CookingStartedPayload,
      });
      setMessage(null);
    } catch (error) {
      setActiveSession(previousActiveSession);
      setLatestSession(previousLatestSession);
      setOrders((currentOrders) =>
        currentOrders.map((currentOrder) =>
          currentOrder.groupOrder.id === order.groupOrder.id
            ? {
                ...currentOrder,
                groupOrder: {
                  ...currentOrder.groupOrder,
                  status: order.groupOrder.status,
                  cookingStartedAt: order.groupOrder.cookingStartedAt,
                },
                activeCookingSession: previousActiveSession,
                latestCookingSession: previousLatestSession,
              }
            : currentOrder,
        ),
      );
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong",
      );
    } finally {
      isStartingRef.current = false;
    }
  }

  async function stopCooking(detectedAt = new Date()) {
    const session = activeSessionRef.current;
    if (!session || isStoppingRef.current) return;

    const groupOrderId = selectedOrderRef.current?.groupOrder.id;
    isStoppingRef.current = true;
    setErrorMessage(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/cooking-sessions/${session.id}/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          detectedAt: detectedAt.toISOString(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to stop cooking");
      }

      setActiveSession(null);
      startSourceRef.current = cameraEnabled ? "camera" : "manual";
      setLatestSession(data.session);
      setOrders((currentOrders) =>
        currentOrders.map((currentOrder) =>
          currentOrder.groupOrder.id === groupOrderId
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
      void displayChannelRef.current?.send({
        type: "broadcast",
        event: "cooking-stopped",
        payload: {
          groupOrderId,
          session: data.session,
        },
      });
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
    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const updateInputMode = () => setUseInlineKeypadOnly(mediaQuery.matches);

    updateInputMode();
    mediaQuery.addEventListener("change", updateInputMode);

    return () => mediaQuery.removeEventListener("change", updateInputMode);
  }, []);

  useEffect(() => {
    const displayChannel = supabase.channel("display-board");
    displayChannelRef.current = displayChannel;
    displayChannel.subscribe();

    return () => {
      if (displayChannelRef.current === displayChannel) {
        displayChannelRef.current = null;
      }
      void supabase.removeChannel(displayChannel);
    };
  }, []);

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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // loadGroupOrders intentionally reads the latest selected order/input values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    if (!cameraEnabled) return;

    let mounted = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
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
    if (!cameraEnabled) return;

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
          const previousBrightness = lastBrightnessRef.current;
          const brightnessDelta =
            previousBrightness == null
              ? 0
              : averageBrightness - previousBrightness;
          const detectedCovered =
            averageBrightness <= cameraCoveredBrightnessThreshold ||
            brightnessDelta <= -cameraBrightnessDropTrigger;
          const detectedUncovered =
            averageBrightness >= cameraUncoveredBrightnessThreshold ||
            brightnessDelta >= cameraBrightnessRiseTrigger;
          let blocked = cameraCoveredRef.current;

          if (detectedCovered && !detectedUncovered) {
            blocked = true;
          } else if (detectedUncovered && !detectedCovered) {
            blocked = false;
          } else if (detectedCovered && detectedUncovered) {
            blocked =
              averageBrightness <
              (cameraCoveredBrightnessThreshold +
                cameraUncoveredBrightnessThreshold) /
                2;
          }

          cameraCoveredRef.current = blocked;
          lastBrightnessRef.current = averageBrightness;
          const now = Date.now();
          if (showCameraDebug) {
            setCameraDebug((currentDebug) =>
              currentDebug.brightness === averageBrightness &&
              currentDebug.brightnessDelta === brightnessDelta &&
              currentDebug.isBlocked === blocked
                ? currentDebug
                : {
                    brightness: averageBrightness,
                    brightnessDelta,
                    isBlocked: blocked,
                    lastUpdatedAt: now,
                  },
            );
          }

          if (blocked) {
            unblockedSinceRef.current = null;
            blockedSinceRef.current ??= now;

            if (
              !activeSessionRef.current &&
              selectedOrderRef.current &&
              isOrderStartable(selectedOrderRef.current) &&
              now - blockedSinceRef.current >= stableBlockMs
            ) {
              startCooking(new Date(blockedSinceRef.current), "camera");
            }
          } else {
            blockedSinceRef.current = null;
            unblockedSinceRef.current ??= now;

            if (
              activeSessionRef.current &&
              startSourceRef.current === "camera" &&
              now - unblockedSinceRef.current >= stableUnblockMs
            ) {
              stopCooking(new Date(unblockedSinceRef.current));
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
    // The camera loop reads active order/session values from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeSession) {
      setElapsedSeconds(0);
      return;
    }

    const interval = window.setInterval(() => {
      const startedAt =
        displayStartedAtBySessionIdRef.current[activeSession.id] ??
        new Date(activeSession.started_at).getTime();
      const elapsed = Math.max(0, (Date.now() - startedAt) / 1000);
      setElapsedSeconds(elapsed);
    }, 50);

    return () => window.clearInterval(interval);
  }, [activeSession]);

  return (
    <main className="min-h-[100dvh] bg-orange-50 p-2 sm:p-5 lg:h-[100dvh] lg:overflow-hidden">
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
          background: linear-gradient(
            180deg,
            #fff4a8 0%,
            #f97316 48%,
            #dc2626 100%
          );
        }

        .flame-b {
          width: 96px;
          height: 150px;
          margin-left: -26px;
          background: linear-gradient(
            180deg,
            #fff7cc 0%,
            #fb923c 62%,
            #ea580c 100%
          );
          animation-delay: -0.24s;
        }

        .flame-c {
          width: 86px;
          height: 132px;
          margin-left: -86px;
          background: linear-gradient(
            180deg,
            #fed7aa 0%,
            #f97316 58%,
            #b91c1c 100%
          );
          animation-delay: -0.42s;
        }

        .heat-ring {
          animation: heat-pulse 1.1s ease-in-out infinite;
        }
      `}</style>

      <div className="mx-auto flex min-h-[calc(100dvh-1rem)] max-w-5xl flex-col gap-2 sm:gap-4">
        <section className="sticky top-2 z-20 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-orange-100 sm:top-5 sm:rounded-3xl sm:p-4">
          <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto] lg:items-center">
            <div className="grid gap-2 sm:grid-cols-[220px_1fr] sm:items-end">
              <div>
                <p className="text-xs font-medium uppercase text-orange-600 sm:text-sm">
                  Cooking Station
                </p>
                <h1 className="truncate text-xl font-black text-orange-950 sm:mt-1 sm:text-3xl">
                  {groupName}
                </h1>
              </div>
            </div>
            <div
              className={`relative min-h-[240px] overflow-hidden rounded-2xl border sm:min-h-[360px] sm:rounded-3xl ${
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
                  <div className="relative z-10 flex h-full min-h-[240px] flex-col items-center justify-center p-4 text-center text-white sm:min-h-[360px] sm:p-8">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-200 sm:text-sm">
                      Cooking
                    </p>
                    <p className="mt-1 text-[clamp(4rem,18vw,7rem)] font-black tabular-nums sm:mt-4">
                      {formatDecimalSeconds(elapsedSeconds)}
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center p-4 text-center sm:min-h-[360px] sm:p-8">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-600 sm:text-sm">
                    Ready
                  </p>
                  <p className="mt-1 text-2xl font-black text-orange-950 sm:mt-4 sm:text-5xl">
                    {selectedOrder && !canStartCooking
                      ? "Order already cooked"
                      : cameraEnabled
                        ? "Cover camera to start"
                        : "Press Start to cook"}
                  </p>
                  <p className="mt-1 max-w-md text-xs text-orange-800 sm:mt-3 sm:text-base">
                    {selectedOrder && !canStartCooking
                      ? "Press Clear, then enter another order."
                      : cameraEnabled
                        ? "Enter the order number first. Uncover the camera when cooking is done."
                        : "Enter the order number first. Press Stop when cooking is done."}
                  </p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 lg:min-w-60">
              <button
                type="button"
                onClick={() => startCooking(new Date(), "manual")}
                disabled={!canStartCooking}
                className="min-h-14 rounded-xl bg-orange-600 px-5 text-lg font-black text-white transition hover:bg-orange-700 disabled:opacity-50 sm:rounded-2xl"
              >
                Start
              </button>
              <button
                type="button"
                onClick={() => stopCooking()}
                disabled={!activeSession}
                className="min-h-14 rounded-xl bg-red-600 px-5 text-lg font-black text-white transition hover:bg-red-700 disabled:opacity-50 sm:rounded-2xl"
              >
                Stop
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-2 shadow-sm sm:rounded-3xl sm:p-5">
          {cameraEnabled && !showCameraDebug && (
            <video
              ref={videoRef}
              playsInline
              muted
              className="pointer-events-none absolute h-px w-px opacity-0"
            />
          )}
          {cameraEnabled && <canvas ref={canvasRef} className="hidden" />}

          <div className="grid gap-2 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="grid content-start gap-2 sm:gap-3">
              {showCameraDebug && (
                <div className="rounded-xl bg-slate-50 p-3 text-slate-950 ring-1 ring-slate-200">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="mb-3 aspect-video w-full rounded-lg border border-white object-cover shadow-sm"
                  />
                  <p className="text-xs font-bold uppercase text-slate-500">
                    Brightness Debug
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-white p-2">
                      <p className="text-[11px] font-bold text-slate-500">
                        Brightness
                      </p>
                      <p className="text-xl font-black">
                        {cameraDebug.brightness}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2">
                      <p className="text-[11px] font-bold text-slate-500">
                        Delta
                      </p>
                      <p className="text-xl font-black">
                        {cameraDebug.brightnessDelta}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2">
                      <p className="text-[11px] font-bold text-slate-500">
                        Camera
                      </p>
                      <p className="text-base font-black">
                        {cameraDebug.isBlocked ? "Covered" : "Open"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2">
                      <p className="text-[11px] font-bold text-slate-500">
                        Covered / Open
                      </p>
                      <p className="text-base font-black">
                        {cameraCoveredBrightnessThreshold} /{" "}
                        {cameraUncoveredBrightnessThreshold}
                      </p>
                    </div>
                    <div className="col-span-2 rounded-lg bg-white p-2">
                      <p className="text-[11px] font-bold text-slate-500">
                        Drop / Rise
                      </p>
                      <p className="text-base font-black">
                        {cameraBrightnessDropTrigger} /{" "}
                        {cameraBrightnessRiseTrigger}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <label className="block">
                <span className="text-xs font-bold text-orange-900 sm:text-sm">
                  Order no.
                </span>
                <input
                  inputMode="numeric"
                  value={orderNoInput}
                  disabled={Boolean(activeSession)}
                  readOnly={useInlineKeypadOnly}
                  onChange={(event) =>
                    selectOrderByNumber(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Order no."
                  className="mt-1 h-12 w-full rounded-xl border border-orange-200 px-3 text-2xl font-black text-orange-950 outline-none transition focus:border-orange-500 disabled:bg-white/60 disabled:text-orange-950 sm:h-14 sm:text-3xl"
                />
              </label>
              <div className="grid grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-3">
                {KEYPAD_VALUES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => appendKeypadValue(value)}
                    disabled={Boolean(activeSession)}
                    className="min-h-14 rounded-xl bg-orange-100 text-xl font-black text-orange-950 transition hover:bg-orange-200 disabled:opacity-50"
                  >
                    {value}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => appendKeypadValue("0")}
                  disabled={Boolean(activeSession)}
                  className="min-h-14 rounded-xl bg-orange-100 text-xl font-black text-orange-950 transition hover:bg-orange-200 disabled:opacity-50"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={backspaceKeypadValue}
                  disabled={Boolean(activeSession)}
                  className="min-h-14 rounded-xl bg-slate-100 text-base font-black text-slate-950 transition hover:bg-slate-200 disabled:opacity-50"
                >
                  Del
                </button>
                <button
                  type="button"
                  onClick={clearKeypadValue}
                  className="min-h-14 rounded-xl bg-slate-900 text-base font-black text-white transition hover:bg-slate-700"
                >
                  Clear
                </button>
              </div>

              {latestSession && latestSession.result !== "pending" && (
                <div className="rounded-xl bg-slate-50 p-3">
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

        {(errorMessage || message) && (
          <section className="rounded-2xl bg-white p-2 shadow-sm sm:rounded-3xl sm:p-4">
            {errorMessage && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 sm:rounded-2xl sm:p-4">
                {errorMessage}
              </div>
            )}

            {message && (
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm font-medium text-orange-800 sm:rounded-2xl sm:p-4">
                {message}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
