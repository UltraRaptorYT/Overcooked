"use client";

import { useCallback, useMemo, useState } from "react";

type Props = {
  groupId: string;
  groupName: string;
};

type CurrentOrder = {
  groupOrderId: string;
  spokenText: string;
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
  const [currentOrder, setCurrentOrder] = useState<CurrentOrder | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasCurrentOrder = useMemo(() => Boolean(currentOrder), [currentOrder]);

  const handleNewOrder = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/groups/${groupId}/new-order`,
        {
          method: "POST",
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to get new order");
      }

      const nextOrder: CurrentOrder = {
        groupOrderId: data.groupOrderId,
        spokenText: data.spokenText,
        assignedAt: data.assignedAt,
      };

      setCurrentOrder(nextOrder);
      speak(nextOrder.spokenText);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong",
      );
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  const handleReplay = useCallback(async () => {
    if (!currentOrder) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/group-orders/${currentOrder.groupOrderId}/replay`,
        { method: "POST" },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to replay order");
      }

      speak(data.spokenText);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong",
      );
    } finally {
      setIsLoading(false);
    }
  }, [currentOrder]);

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
            {hasCurrentOrder
              ? "Incoming Order Received"
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
          {!hasCurrentOrder ? (
            <button
              type="button"
              onClick={handleNewOrder}
              disabled={isLoading}
              className="rounded-2xl bg-orange-600 px-6 py-5 text-xl font-bold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Getting Order..." : "New Order"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleReplay}
              disabled={isLoading}
              className="rounded-2xl bg-orange-600 px-6 py-5 text-xl font-bold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "Replaying..." : "Replay Order Audio"}
            </button>
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
