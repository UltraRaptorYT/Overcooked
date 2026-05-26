import { NextResponse as StopCookNextResponse } from "next/server";
import stopCookSupabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as StopCookT } from "@/lib/overcooked-26/tables";

type StopCookContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

type StopCookBody = {
  detectedAt?: string;
};

function getTrustedClientTime(value: string | undefined, fallback: Date) {
  if (!value) return fallback;

  const parsed = new Date(value);
  const timestamp = parsed.getTime();

  if (!Number.isFinite(timestamp)) return fallback;

  const fallbackTimestamp = fallback.getTime();
  const tooFarInFuture = timestamp > fallbackTimestamp + 2000;
  const tooFarInPast = timestamp < fallbackTimestamp - 30000;

  return tooFarInFuture || tooFarInPast ? fallback : parsed;
}

function getCookResult(
  actualSeconds: number,
  requiredSeconds: number,
  bufferSeconds: number,
) {
  if (requiredSeconds === 0) return "not_required";
  if (actualSeconds < requiredSeconds) return "undercooked";
  if (actualSeconds <= requiredSeconds + bufferSeconds) return "correct";
  return "overcooked";
}

export async function POST(request: Request, context: StopCookContext) {
  const { sessionId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as StopCookBody;

  if (!sessionId) {
    return StopCookNextResponse.json(
      { error: "Missing sessionId" },
      { status: 400 },
    );
  }

  const { data: session, error: sessionError } = await stopCookSupabase
    .from(StopCookT.cookingSessions)
    .select(
      "id, group_order_id, required_seconds, buffer_seconds, started_at, result",
    )
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return StopCookNextResponse.json(
      { error: "Cooking session not found" },
      { status: 404 },
    );
  }

  if (session.result !== "pending") {
    return StopCookNextResponse.json(
      { error: `Cooking session already ended as ${session.result}` },
      { status: 409 },
    );
  }

  const removedAt = getTrustedClientTime(body.detectedAt, new Date());
  const startedAt = new Date(session.started_at);
  const actualSeconds = Math.max(
    0,
    Math.floor((removedAt.getTime() - startedAt.getTime()) / 1000),
  );
  const result = getCookResult(
    actualSeconds,
    session.required_seconds,
    session.buffer_seconds,
  );

  const { data: updatedSession, error: updateSessionError } =
    await stopCookSupabase
      .from(StopCookT.cookingSessions)
      .update({
        removed_at: removedAt.toISOString(),
        actual_seconds: actualSeconds,
        result,
      })
      .eq("id", sessionId)
      .select(
        "id, buffer_seconds, player_timer_seconds, started_at, removed_at, actual_seconds, result",
      )
      .single();

  if (updateSessionError || !updatedSession) {
    return StopCookNextResponse.json(
      { error: updateSessionError?.message ?? "Failed to stop cooking" },
      { status: 500 },
    );
  }

  await stopCookSupabase
    .from(StopCookT.groupOrders)
    .update({
      status: "cooked",
      cooking_completed_at: removedAt.toISOString(),
    })
    .eq("id", session.group_order_id);

  return StopCookNextResponse.json({ session: updatedSession });
}
