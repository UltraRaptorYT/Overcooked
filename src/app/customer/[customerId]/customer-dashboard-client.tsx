"use client";

import { cn } from "@/lib/utils";
import supabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as T } from "@/lib/overcooked-26/tables";
import { useEffect, useMemo, useState } from "react";

type LookupData = {
  customer: {
    id: string;
    name: string;
    customerSlot: number;
  };
  order: {
    id: string;
    orderNo: string;
    difficulty: "easy" | "hard";
    customerSlot: number;
    belongsToThisCustomer: boolean;
    requiredTotalCookTimeSeconds: number;
  };
  correctCustomer: {
    id: string;
    name: string;
    customerSlot: number;
  };
  groupOrder: {
    id: string;
    status: string;
    assignedAt: string;
    servedAt: string | null;
    completedAt: string | null;
    completionSeconds: number | null;
  };
  group: {
    id: string;
    name: string;
    score: number;
    red_tokens: number;
  };
  items: {
    id: string;
    zone: "A" | "B" | "C" | "D";
    foodItemId: string;
    foodName: string;
    colour: string;
    parentItem: string | null;
    sequence: number | null;
    requiresCooking: boolean;
    cookTimeSeconds: number;
    imageUrl: string | null;
  }[];
  cookingSession: {
    id: string;
    required_seconds: number;
    buffer_seconds: number;
    actual_seconds: number | null;
    result:
      | "pending"
      | "undercooked"
      | "correct"
      | "overcooked"
      | "not_required";
  } | null;
};

type Props = {
  customerId: string;
  customerName: string;
  customerSlot: number;
};

type SelectableOrder = {
  groupOrderId: string;
  orderNo: string;
  status: string;
  assignedAt: string;
  groupName: string;
  belongsToThisCustomer: boolean;
};

type RoundTiming = {
  status: string;
  duration_seconds: number;
  rush_hour_duration_seconds: number;
  round_started_at: string | null;
};

const REJECT_REASONS = [
  "wrong_item",
  "wrong_colour",
  "wrong_zone",
  "missing_item",
  "not_cooked",
  "overcooked",
  "undercooked",
  "messy_or_unclear",
] as const;

const FOOD_IMAGE_FILTERS: Record<string, string> = {
  red: "sepia(0.9) saturate(4) hue-rotate(315deg) brightness(0.95)",
  blue: "sepia(0.8) saturate(3.8) hue-rotate(175deg) brightness(0.9)",
  "light green": "sepia(0.75) saturate(2.8) hue-rotate(65deg) brightness(1.08)",
  "dark green": "sepia(0.9) saturate(3.7) hue-rotate(75deg) brightness(0.68)",
  yellow: "sepia(0.9) saturate(3.5) hue-rotate(5deg) brightness(1.05)",
  purple: "sepia(0.75) saturate(3.2) hue-rotate(230deg) brightness(0.9)",
  pink: "sepia(0.75) saturate(2.8) hue-rotate(300deg) brightness(1.05)",
  brown: "sepia(0.9) saturate(1.6) hue-rotate(345deg) brightness(0.75)",
  orange: "sepia(0.9) saturate(3.5) hue-rotate(335deg) brightness(1)",
  white: "grayscale(1) brightness(1.35) contrast(0.85)",
  black: "grayscale(1) brightness(0.18) contrast(1.4)",
  "light blue": "sepia(0.6) saturate(2.4) hue-rotate(165deg) brightness(1.15)",
  beige: "sepia(0.65) saturate(1.2) hue-rotate(350deg) brightness(1.08)",
};

function formatReason(reason: string) {
  return reason
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function initialsFromFoodName(foodName: string) {
  return foodName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getFoodImageFilter(colour: string) {
  return FOOD_IMAGE_FILTERS[colour.toLowerCase()] ?? "none";
}

function getCookingFailReason(data: LookupData | null) {
  const result = data?.cookingSession?.result;

  if (result === "overcooked") return "overcooked";
  if (result === "undercooked") return "undercooked";
  if (data && data.order.requiredTotalCookTimeSeconds > 0) return "not_cooked";
  return null;
}

export function CustomerDashboardClient({
  customerId,
  customerName,
  customerSlot,
}: Props) {
  const [orderNo, setOrderNo] = useState("");
  const [selectableOrders, setSelectableOrders] = useState<SelectableOrder[]>(
    [],
  );
  const [lookupData, setLookupData] = useState<LookupData | null>(null);
  const [selectedRejectReason, setSelectedRejectReason] =
    useState<string>("wrong_item");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [roundTiming, setRoundTiming] = useState<RoundTiming | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const itemsByZone = useMemo(() => {
    const grouped: Record<string, LookupData["items"]> = {
      A: [],
      B: [],
      C: [],
      D: [],
    };

    for (const item of lookupData?.items ?? []) {
      grouped[item.zone].push(item);
    }

    return grouped;
  }, [lookupData]);
  const cookingCanPass =
    !lookupData ||
    lookupData.order.requiredTotalCookTimeSeconds === 0 ||
    lookupData.cookingSession?.result === "not_required" ||
    lookupData.cookingSession?.result === "correct";
  const cookingHasFailed = Boolean(lookupData) && !cookingCanPass;
  const cookingFailReason = getCookingFailReason(lookupData);
  const rushHourActive = useMemo(() => {
    if (
      !roundTiming ||
      roundTiming.status !== "playing" ||
      !roundTiming.round_started_at
    ) {
      return false;
    }

    const elapsedSeconds = Math.max(
      0,
      Math.floor(
        (now - new Date(roundTiming.round_started_at).getTime()) / 1000,
      ),
    );
    const remainingSeconds = Math.max(
      0,
      roundTiming.duration_seconds - elapsedSeconds,
    );

    return (
      remainingSeconds > 0 &&
      remainingSeconds <= roundTiming.rush_hour_duration_seconds
    );
  }, [now, roundTiming]);
  const approvalPoints = rushHourActive ? 20 : 10;

  async function loadSelectableOrders() {
    try {
      const response = await fetch(`/api/customers/${customerId}/orders`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load orders");
      }

      setSelectableOrders(data.orders ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong",
      );
    }
  }

  async function loadRoundTiming() {
    try {
      const response = await fetch("/api/display");
      const data = await response.json();

      if (!response.ok) return;

      setRoundTiming(data.currentRound ?? null);
    } catch {
      // The judge API still calculates the real score if this helper refresh fails.
    }
  }

  async function handleLookup(nextOrderNo = orderNo, groupOrderId?: string) {
    const cleanedOrderNo = nextOrderNo.trim();

    if (!cleanedOrderNo) {
      setErrorMessage("Choose an order first");
      return;
    }

    setOrderNo(cleanedOrderNo);
    setIsLoading(true);
    setErrorMessage(null);
    setMessage(null);
    setLookupData(null);

    try {
      const params = new URLSearchParams();
      if (groupOrderId) {
        params.set("groupOrderId", groupOrderId);
      }

      const response = await fetch(
        `/api/customers/${customerId}/orders/${cleanedOrderNo}${
          params.size > 0 ? `?${params.toString()}` : ""
        }`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to find order");
      }

      setLookupData(data);
      const nextCookingFailReason = getCookingFailReason(data);
      if (nextCookingFailReason) {
        setSelectedRejectReason(nextCookingFailReason);
      }
      void loadSelectableOrders();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function judgeOrder(
    decision: "approved" | "rejected" | "wrong_customer",
    reason?: string,
  ) {
    if (!lookupData) return;

    setIsLoading(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/group-orders/${lookupData.groupOrder.id}/judge`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerId,
            decision,
            reason,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to judge order");
      }

      const points = data.servedOrder.points_delta;
      const tokens = data.servedOrder.red_tokens_delta;
      const finalDecision = data.servedOrder.decision;
      const rushHourLabel =
        data.servedOrder.rush_hour_multiplier === 2 ? " (Rush Hour x2)" : "";

      setMessage(
        finalDecision === "approved"
          ? `Approved. +${points} points${rushHourLabel}, +${tokens} red token.`
          : `Rejected. ${points} points, +${tokens} red token.`,
      );
      setLookupData(null);
      setOrderNo("");
      void loadSelectableOrders();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSelectableOrders();
    void loadRoundTiming();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (cookingFailReason) {
      setSelectedRejectReason(cookingFailReason);
    }
  }, [cookingFailReason]);

  useEffect(() => {
    const channel = supabase
      .channel(`customer-orders-${customerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: T.groupOrders,
        },
        () => {
          void loadSelectableOrders();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: T.rounds,
        },
        () => {
          void loadRoundTiming();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: T.cookingSessions,
        },
        () => {
          void loadSelectableOrders();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // loadSelectableOrders intentionally uses latest customerId from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  return (
    <main className="min-h-screen bg-emerald-50 p-5">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.25em] text-emerald-600">
            Customer Station
          </p>
          <h1 className="mt-2 text-4xl font-black text-emerald-950">
            {customerName}
          </h1>
          <p className="mt-1 text-emerald-800">Customer slot {customerSlot}</p>

          <div className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-600">
                Choose Order
              </p>
              <button
                type="button"
                onClick={() => loadSelectableOrders()}
                disabled={isLoading}
                className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-900 transition hover:bg-emerald-50 disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            {selectableOrders.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-5 font-semibold text-emerald-800">
                No active orders yet.
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {selectableOrders.map((order) => (
                  <button
                    key={order.groupOrderId}
                    type="button"
                    onClick={() =>
                      handleLookup(order.orderNo, order.groupOrderId)
                    }
                    disabled={isLoading}
                    className={`rounded-2xl border p-4 text-left transition disabled:opacity-50 ${
                      orderNo === order.orderNo
                        ? "border-emerald-500 bg-emerald-100"
                        : "border-emerald-100 bg-emerald-50 hover:bg-emerald-100"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-2xl font-black text-emerald-950">
                        #{order.orderNo}
                      </p>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-black uppercase ${
                          order.belongsToThisCustomer
                            ? "bg-emerald-600 text-white"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {order.belongsToThisCustomer ? "Mine" : "Not mine"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-emerald-800">
                      {order.groupName}
                    </p>
                    <p className="text-xs font-semibold uppercase text-emerald-600">
                      {order.status}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 font-medium text-red-700">
              {errorMessage}
            </div>
          )}

          {message && (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 font-medium text-emerald-800">
              {message}
            </div>
          )}
        </div>

        {lookupData && (
          <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
                  Order Found
                </p>
                <h2 className="mt-1 text-3xl font-black text-emerald-950">
                  Order #{lookupData.order.orderNo}
                </h2>
                <p className="mt-1 text-emerald-800">
                  Served by {lookupData.group.name} · Status:{" "}
                  {lookupData.groupOrder.status}
                </p>
              </div>

              <div
                className={`rounded-2xl px-4 py-3 text-sm font-bold ${
                  lookupData.order.belongsToThisCustomer
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {lookupData.order.belongsToThisCustomer
                  ? "Correct customer station"
                  : "Wrong customer station"}
              </div>
            </div>

            {!lookupData.order.belongsToThisCustomer && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
                <p className="text-sm font-bold uppercase tracking-wide text-red-700">
                  Correct Customer
                </p>
                <p className="mt-1 text-2xl font-black">
                  Customer {lookupData.correctCustomer.customerSlot}
                </p>
                <p className="text-sm font-semibold">
                  {lookupData.correctCustomer.name}
                </p>
              </div>
            )}

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              {(["A", "B", "C", "D"] as const).map((zone) => (
                <div
                  key={zone}
                  className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4"
                >
                  <h3 className="text-xl font-black text-emerald-950">
                    Zone {zone}
                  </h3>

                  <div className="mt-4 space-y-3">
                    {itemsByZone[zone].length === 0 ? (
                      <p className="text-sm text-emerald-700">No item</p>
                    ) : (
                      itemsByZone[zone].map((item) => (
                        <div
                          key={item.id}
                          className="rounded-2xl bg-white p-3 shadow-sm"
                        >
                          <div
                            data-food-image-frame
                            className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-emerald-100 bg-emerald-50"
                          >
                            {item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.imageUrl}
                                alt={item.foodName}
                                className="h-full w-full object-contain p-2"
                                onError={(event) => {
                                  event.currentTarget.style.display = "none";
                                  const frame =
                                    event.currentTarget.closest(
                                      "[data-food-image-frame]",
                                    );
                                  frame
                                    ?.querySelector("[data-image-error-message]")
                                    ?.classList.remove("hidden");
                                }}
                                style={{
                                  filter: getFoodImageFilter(item.colour),
                                }}
                              />
                            ) : (
                              <span className="text-2xl font-black text-emerald-700">
                                {initialsFromFoodName(item.foodName)}
                              </span>
                            )}
                            {item.imageUrl && (
                              <span
                                data-image-error-message
                                className="hidden text-center text-xs font-black text-red-700"
                              >
                                Image failed
                              </span>
                            )}
                          </div>
                          {item.parentItem && (
                            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-emerald-500">
                              {item.parentItem.replaceAll("_", " ")}
                              {item.sequence ? ` · #${item.sequence}` : ""}
                            </p>
                          )}
                          <p className="font-bold text-emerald-950">
                            {item.colour} {item.foodName}
                          </p>
                          <p className="mt-1 text-xs text-emerald-700">
                            {item.requiresCooking
                              ? `Cook ${item.cookTimeSeconds}s`
                              : "No cooking"}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5">
              <h3 className="text-lg font-black text-amber-950">
                Cooking Check
              </h3>
              <div className="flex items-center">
                <div>
                  <p className="mt-1 text-amber-800">
                    Required total cooking time:{" "}
                    {lookupData.order.requiredTotalCookTimeSeconds}s
                  </p>
                  <p className="mt-1 text-amber-800">
                    Cooked for:{" "}
                    {lookupData.cookingSession?.actual_seconds != null
                      ? `${lookupData.cookingSession.actual_seconds}s`
                      : "not recorded yet"}
                  </p>
                  {cookingHasFailed && (
                    <p className="mt-3 rounded-2xl bg-red-100 px-4 py-3 font-black text-red-800">
                      Order fail
                      {cookingFailReason
                        ? `: ${formatReason(cookingFailReason)}`
                        : ""}
                    </p>
                  )}
                </div>
                <div
                  className={cn(
                    "ml-auto text-2xl",
                    cookingHasFailed ? "text-red-600" : "text-emerald-600",
                  )}
                >
                  {cookingHasFailed ? "Failed" : "Passed"}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {lookupData.order.belongsToThisCustomer ? (
                <>
                  {cookingCanPass ? (
                    <button
                      type="button"
                      onClick={() => judgeOrder("approved")}
                      disabled={isLoading || !cookingCanPass}
                      className="rounded-2xl bg-emerald-600 px-6 py-5 text-xl font-black text-white transition hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-600"
                    >
                      Approve +{approvalPoints}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="rounded-2xl bg-slate-300 px-6 py-5 text-xl font-black text-slate-600"
                    >
                      {cookingFailReason
                        ? formatReason(cookingFailReason)
                        : "Order Fail"}
                    </button>
                  )}

                  <div className="rounded-2xl border border-red-200 bg-red-50 p-3 md:col-span-2">
                    <select
                      value={selectedRejectReason}
                      onChange={(event) =>
                        setSelectedRejectReason(event.target.value)
                      }
                      className="mb-3 w-full rounded-xl border border-red-200 bg-white px-4 py-3 font-semibold text-red-900"
                    >
                      {REJECT_REASONS.map((reason) => (
                        <option key={reason} value={reason}>
                          {formatReason(reason)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        judgeOrder(
                          "rejected",
                          cookingFailReason ?? selectedRejectReason,
                        )
                      }
                      disabled={isLoading}
                      className="w-full rounded-2xl bg-red-600 px-6 py-4 text-lg font-black text-white transition hover:bg-red-700 disabled:opacity-50"
                    >
                      Reject -20
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => judgeOrder("wrong_customer", "wrong_customer")}
                  disabled={isLoading}
                  className="rounded-2xl bg-red-600 px-6 py-5 text-xl font-black text-white transition hover:bg-red-700 disabled:opacity-50 md:col-span-3"
                >
                  Wrong Customer -20
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
