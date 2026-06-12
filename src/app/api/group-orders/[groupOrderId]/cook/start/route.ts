import { NextResponse as StartCookNextResponse } from "next/server";
import startCookSupabase from "@/lib/supabase";
import { OVERCOOKED_26_CONFIG } from "@/lib/overcooked-26/config";
import { OVERCOOKED_26_TABLES as StartCookT } from "@/lib/overcooked-26/tables";

type StartCookContext = {
  params: Promise<{
    groupOrderId: string;
  }>;
};

type StartCookBody = {
  bufferSeconds?: number;
  groupId?: string;
  detectedAt?: string;
};

const STARTABLE_ORDER_STATUSES = ["assigned", "assembling"] as const;

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

export async function POST(request: Request, context: StartCookContext) {
  const { groupOrderId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as StartCookBody;
  const groupId = body.groupId;
  const bufferSeconds =
    body.bufferSeconds ?? OVERCOOKED_26_CONFIG.cooking.defaultBufferSeconds;

  if (!groupOrderId) {
    return StartCookNextResponse.json(
      { error: "Missing groupOrderId" },
      { status: 400 },
    );
  }

  if (!groupId) {
    return StartCookNextResponse.json(
      { error: "Missing groupId" },
      { status: 400 },
    );
  }

  const { data: groupOrder, error: groupOrderError } = await startCookSupabase
    .from(StartCookT.groupOrders)
    .select("id, group_id, order_template_id, status")
    .eq("id", groupOrderId)
    .single();

  if (groupOrderError || !groupOrder) {
    return StartCookNextResponse.json(
      { error: "Group order not found" },
      { status: 404 },
    );
  }

  if (groupOrder.group_id !== groupId) {
    return StartCookNextResponse.json(
      { error: "This order does not belong to this cooking group" },
      { status: 403 },
    );
  }

  if (!STARTABLE_ORDER_STATUSES.includes(groupOrder.status)) {
    return StartCookNextResponse.json(
      { error: "This order has already been cooked" },
      { status: 400 },
    );
  }

  const { data: activeSession } = await startCookSupabase
    .from(StartCookT.cookingSessions)
    .select("id")
    .eq("group_order_id", groupOrderId)
    .eq("result", "pending")
    .maybeSingle();

  if (activeSession) {
    return StartCookNextResponse.json(
      { error: "This order already has an active cooking session" },
      { status: 409 },
    );
  }

  const { data: orderTemplate, error: orderTemplateError } =
    await startCookSupabase
      .from(StartCookT.orderTemplates)
      .select("required_total_cook_time_seconds")
      .eq("id", groupOrder.order_template_id)
      .single();

  if (orderTemplateError || !orderTemplate) {
    return StartCookNextResponse.json(
      { error: "Order template not found" },
      { status: 404 },
    );
  }

  const startedAt = getTrustedClientTime(
    body.detectedAt,
    new Date(),
  ).toISOString();
  const requiredSeconds = orderTemplate.required_total_cook_time_seconds;

  const { data: session, error: sessionError } = await startCookSupabase
    .from(StartCookT.cookingSessions)
    .insert({
      group_order_id: groupOrderId,
      group_id: groupOrder.group_id,
      required_seconds: requiredSeconds, // hidden actual answer
      buffer_seconds: bufferSeconds,
      player_timer_seconds: null,
      started_at: startedAt,
      result: requiredSeconds === 0 ? "not_required" : "pending",
    })
    .select(
      "id, buffer_seconds, player_timer_seconds, started_at, result",
    )
    .single();

  if (sessionError || !session) {
    return StartCookNextResponse.json(
      { error: sessionError?.message ?? "Failed to start cooking" },
      { status: 500 },
    );
  }

  await startCookSupabase
    .from(StartCookT.groupOrders)
    .update({
      status: requiredSeconds === 0 ? "cooked" : "cooking",
      cooking_started_at: startedAt,
    })
    .eq("id", groupOrderId);

  return StartCookNextResponse.json({ session });
}
