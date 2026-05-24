"use client";

import { useCallback, useEffect, useState } from "react";
import supabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as T } from "@/lib/overcooked-26/tables";

type Props = {
  groupId: string;
  groupName: string;
};

type ReceivedOrder = {
  groupOrderId: string;
  spokenText?: string;
  assignedAt?: string;
};

function speak(text: string) {
  if (typeof window === "undefined") return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.88;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.lang = "en-SG";

  window.speechSynthesis.speak(utterance);
}

export function GroupOrderClient({ groupId, groupName }: Props) {
  const [orders, setOrders] = useState<ReceivedOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/groups/${groupId}/orders`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load previous orders");
      }

      setOrders(data.orders ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong",
      );
    }
  }, [groupId]);

  const handleNewOrder = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/groups/${groupId}/new-order`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to get new order");
      }

      const nextOrder: ReceivedOrder = {
        groupOrderId: data.groupOrderId,
        spokenText: String(data.spokenText ?? ""),
        assignedAt: data.assignedAt,
      };

      console.log("[Order test] New order audio text", {
        groupId,
        groupName,
        groupOrderId: nextOrder.groupOrderId,
        assignedAt: nextOrder.assignedAt,
        spokenText: nextOrder.spokenText,
      });

      setOrders((prev) => [nextOrder, ...prev]);
      speak(nextOrder.spokenText ?? "");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong",
      );
    } finally {
      setIsLoading(false);
    }
  }, [groupId, groupName]);

  const handleReplay = useCallback(async (groupOrderId: string) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/group-orders/${groupOrderId}/replay`,
        { method: "POST" },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to replay order");
      }

      console.log("[Order test] Replay order audio text", {
        groupId,
        groupName,
        groupOrderId,
        spokenText: data.spokenText,
      });

      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.groupOrderId === groupOrderId
            ? { ...order, spokenText: data.spokenText }
            : order,
        ),
      );
      speak(data.spokenText);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong",
      );
    } finally {
      setIsLoading(false);
    }
  }, [groupId, groupName]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const channel = supabase
      .channel(`order-station-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: T.groupOrders,
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          void loadOrders();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [groupId, loadOrders]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-orange-50 p-6">
      <div className="w-full max-w-xl rounded-3xl bg-white p-6 text-center shadow-lg">
        <p className="text-sm font-medium uppercase tracking-[0.25em] text-orange-500">
          煮过头！Order Station
        </p>
        <h1 className="mt-3 text-4xl font-black text-orange-950">
          {groupName}
        </h1>

        <div className="mt-8 rounded-3xl border-2 border-dashed border-orange-200 bg-orange-50 p-8">
          <div className="text-6xl">🎧</div>
          <h2 className="mt-4 text-2xl font-bold text-orange-950">
            {orders.length > 0
              ? `${orders.length} Order${orders.length === 1 ? "" : "s"} Received`
              : "Ready for New Order"}
          </h2>
          <p className="mt-2 text-orange-800">
            The order number and food details are audio-only. Listen carefully.
          </p>
        </div>

        {errorMessage && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="mt-8 grid gap-3">
          <button
            type="button"
            onClick={handleNewOrder}
            disabled={isLoading}
            className="rounded-2xl bg-orange-600 px-6 py-5 text-xl font-bold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Working..." : "New Order"}
          </button>

          {orders.length > 0 && (
            <div className="grid gap-2 rounded-2xl border border-orange-100 bg-orange-50 p-3">
              <p className="px-1 text-left text-sm font-bold text-orange-900">
                Received Orders
              </p>
              {orders.map((order, index) => (
                <button
                  key={order.groupOrderId}
                  type="button"
                  onClick={() => handleReplay(order.groupOrderId)}
                  disabled={isLoading}
                  className="rounded-xl border border-orange-200 bg-white px-4 py-3 text-left font-semibold text-orange-950 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Replay Order {index + 1}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => window.speechSynthesis.cancel()}
            className="rounded-2xl border border-orange-200 bg-white px-6 py-4 font-semibold text-orange-900 transition hover:bg-orange-100"
          >
            Stop Audio
          </button>
        </div>

        <p className="mt-6 text-xs text-orange-700">
          Nothing important is shown on this screen. Write down what you hear.
        </p>
      </div>
    </main>
  );
}
