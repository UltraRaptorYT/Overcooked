import { NextResponse as JudgeNextResponse } from "next/server";
import judgeSupabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as JudgeT } from "@/lib/overcooked-26/tables";

type JudgeContext = {
  params: Promise<{
    groupOrderId: string;
  }>;
};

type JudgeBody = {
  customerId: string;
  decision: "approved" | "rejected" | "wrong_customer";
  reason?: string;
};

type EffectiveDecision = {
  decision: JudgeBody["decision"];
  reason?: string | null;
};

type RoundTiming = {
  status: string;
  duration_seconds: number;
  rush_hour_duration_seconds: number | null;
  round_started_at: string | null;
};

function isRushHourActive(round: RoundTiming, judgedAt: Date) {
  if (round.status !== "playing" || !round.round_started_at) return false;

  const elapsedSeconds = Math.max(
    0,
    Math.floor(
      (judgedAt.getTime() - new Date(round.round_started_at).getTime()) /
        1000,
    ),
  );
  const remainingSeconds = Math.max(0, round.duration_seconds - elapsedSeconds);
  const rushHourSeconds = round.rush_hour_duration_seconds ?? 5 * 60;

  return remainingSeconds > 0 && remainingSeconds <= rushHourSeconds;
}

function getScorePayload(
  decision: JudgeBody["decision"],
  rushHourActive: boolean,
) {
  if (decision === "approved") {
    return {
      points_delta: rushHourActive ? 20 : 10,
      red_tokens_delta: 1,
    };
  }

  return {
    points_delta: -20,
    red_tokens_delta: 0,
  };
}

function getEffectiveDecision(
  requestedDecision: JudgeBody["decision"],
  requiredSeconds: number,
  latestCookingResult: string | null,
  requestedReason?: string,
): EffectiveDecision {
  if (requestedDecision !== "approved") {
    return {
      decision: requestedDecision,
      reason: requestedReason ?? null,
    };
  }

  if (requiredSeconds === 0 || latestCookingResult === "not_required") {
    return {
      decision: "approved",
      reason: null,
    };
  }

  if (latestCookingResult === "correct") {
    return {
      decision: "approved",
      reason: null,
    };
  }

  return {
    decision: "rejected",
    reason:
      latestCookingResult === "undercooked" ||
      latestCookingResult === "overcooked"
        ? latestCookingResult
        : "not_cooked",
  };
}

export async function POST(request: Request, context: JudgeContext) {
  const { groupOrderId } = await context.params;
  const body = (await request.json()) as JudgeBody;

  if (!groupOrderId) {
    return JudgeNextResponse.json(
      { error: "Missing groupOrderId" },
      { status: 400 },
    );
  }

  if (!body.customerId || !body.decision) {
    return JudgeNextResponse.json(
      { error: "Missing customerId or decision" },
      { status: 400 },
    );
  }

  const validDecisions = ["approved", "rejected", "wrong_customer"];
  if (!validDecisions.includes(body.decision)) {
    return JudgeNextResponse.json(
      { error: "Invalid decision" },
      { status: 400 },
    );
  }

  const { data: groupOrder, error: groupOrderError } = await judgeSupabase
    .from(JudgeT.groupOrders)
    .select("id, group_id, order_template_id, round_id, status")
    .eq("id", groupOrderId)
    .single();

  if (groupOrderError || !groupOrder) {
    return JudgeNextResponse.json(
      { error: "Group order not found" },
      { status: 404 },
    );
  }

  if (
    ["approved", "rejected", "misserved", "cancelled"].includes(
      groupOrder.status,
    )
  ) {
    return JudgeNextResponse.json(
      { error: `Order has already been closed as ${groupOrder.status}` },
      { status: 409 },
    );
  }

  const { data: orderTemplate, error: orderTemplateError } = await judgeSupabase
    .from(JudgeT.orderTemplates)
    .select("required_total_cook_time_seconds")
    .eq("id", groupOrder.order_template_id)
    .single();

  if (orderTemplateError || !orderTemplate) {
    return JudgeNextResponse.json(
      { error: "Order template not found" },
      { status: 404 },
    );
  }

  const { data: round, error: roundError } = await judgeSupabase
    .from(JudgeT.rounds)
    .select(
      "status, duration_seconds, rush_hour_duration_seconds, round_started_at",
    )
    .eq("id", groupOrder.round_id)
    .single();

  if (roundError || !round) {
    return JudgeNextResponse.json(
      { error: roundError?.message ?? "Round not found" },
      { status: 404 },
    );
  }

  const { data: latestCookingSession, error: cookingSessionError } =
    await judgeSupabase
      .from(JudgeT.cookingSessions)
      .select("result")
      .eq("group_order_id", groupOrderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (cookingSessionError) {
    return JudgeNextResponse.json(
      { error: cookingSessionError.message },
      { status: 500 },
    );
  }

  const effectiveDecision = getEffectiveDecision(
    body.decision,
    orderTemplate.required_total_cook_time_seconds,
    latestCookingSession?.result ?? null,
    body.reason,
  );
  const judgedAt = new Date();
  const rushHourActive = isRushHourActive(round, judgedAt);
  const scorePayload = getScorePayload(
    effectiveDecision.decision,
    rushHourActive,
  );

  const { data: servedOrder, error: insertError } = await judgeSupabase
    .from(JudgeT.servedOrders)
    .insert({
      group_order_id: groupOrderId,
      customer_id: body.customerId,
      served_by_group_id: groupOrder.group_id,
      decision: effectiveDecision.decision,
      reason: effectiveDecision.reason ?? null,
      judged_at: judgedAt.toISOString(),
      ...scorePayload,
    })
    .select("id, decision, reason, points_delta, red_tokens_delta")
    .single();

  if (insertError || !servedOrder) {
    return JudgeNextResponse.json(
      { error: insertError?.message ?? "Failed to judge order" },
      { status: 500 },
    );
  }

  return JudgeNextResponse.json({
    servedOrder: {
      ...servedOrder,
      rush_hour_multiplier:
        servedOrder.decision === "approved" && rushHourActive ? 2 : 1,
    },
  });
}
