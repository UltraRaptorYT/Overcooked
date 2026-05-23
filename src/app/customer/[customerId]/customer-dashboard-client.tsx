"use client";

import { useMemo, useState } from "react";

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

const REJECT_REASONS = [
  "wrong_item",
  "wrong_colour",
  "wrong_zone",
  "missing_item",
  "overcooked",
  "undercooked",
  "messy_or_unclear",
] as const;

function formatReason(reason: string) {
  return reason
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function CustomerDashboardClient({
  customerId,
  customerName,
  customerSlot,
}: Props) {
  const [orderNo, setOrderNo] = useState("");
  const [lookupData, setLookupData] = useState<LookupData | null>(null);
  const [selectedRejectReason, setSelectedRejectReason] =
    useState<string>("wrong_item");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  async function handleLookup() {
    const cleanedOrderNo = orderNo.trim();

    if (!cleanedOrderNo) {
      setErrorMessage("Enter an order number first");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setMessage(null);
    setLookupData(null);

    try {
      const response = await fetch(
        `/api/customers/${customerId}/orders/${cleanedOrderNo}`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to find order");
      }

      setLookupData(data);
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

      setMessage(
        decision === "approved"
          ? `Approved. +${points} points, +${tokens} red token.`
          : `Rejected. ${points} points, +${tokens} red token.`,
      );
      setLookupData(null);
      setOrderNo("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong",
      );
    } finally {
      setIsLoading(false);
    }
  }

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

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <input
              value={orderNo}
              onChange={(event) => setOrderNo(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleLookup();
                }
              }}
              placeholder="Enter order number"
              className="min-h-14 flex-1 rounded-2xl border border-emerald-200 bg-white px-5 text-xl font-semibold outline-none transition focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={handleLookup}
              disabled={isLoading}
              className="rounded-2xl bg-emerald-600 px-8 py-4 text-lg font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {isLoading ? "Checking..." : "Find Order"}
            </button>
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
              <p className="mt-1 text-amber-800">
                Required total cooking time:{" "}
                {lookupData.order.requiredTotalCookTimeSeconds}s
              </p>
              <p className="mt-1 text-amber-800">
                Current cooking result:{" "}
                {lookupData.cookingSession?.result ?? "not recorded yet"}
              </p>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {lookupData.order.belongsToThisCustomer ? (
                <>
                  <button
                    type="button"
                    onClick={() => judgeOrder("approved")}
                    disabled={isLoading}
                    className="rounded-2xl bg-emerald-600 px-6 py-5 text-xl font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    ✅ Approve +10
                  </button>

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
                        judgeOrder("rejected", selectedRejectReason)
                      }
                      disabled={isLoading}
                      className="w-full rounded-2xl bg-red-600 px-6 py-4 text-lg font-black text-white transition hover:bg-red-700 disabled:opacity-50"
                    >
                      ❌ Reject -20
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
