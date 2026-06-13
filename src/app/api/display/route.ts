import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as T } from "@/lib/overcooked-26/tables";

const ACTIVE_ORDER_STATUSES = [
  "assigned",
  "cooking",
  "cooked",
  "assembling",
  "served",
] as const;

const ROUND_DURATION_SECONDS = {
  easy: 20 * 60,
  hard: 35 * 60,
} as const;

type DisplayPatchBody = {
  action?: "set_difficulty" | "start" | "pause" | "reset";
  difficulty?: "easy" | "hard";
  durationSeconds?: number;
};

async function getLatestGame() {
  return supabase
    .from(T.games)
    .select("id, name, status, current_round_id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
}

export async function GET() {
  const { data: game, error: gameError } = await getLatestGame();

  if (gameError || !game) {
    return NextResponse.json(
      { error: gameError?.message ?? "No game found" },
      { status: 404 },
    );
  }

  const { data: rounds, error: roundsError } = await supabase
    .from(T.rounds)
    .select(
      "id, game_id, name, mode, status, duration_seconds, rush_hour_duration_seconds, round_started_at, round_ended_at, created_at",
    )
    .eq("game_id", game.id)
    .order("created_at", { ascending: true });

  if (roundsError) {
    return NextResponse.json({ error: roundsError.message }, { status: 500 });
  }

  const currentRound =
    (rounds ?? []).find((round) => round.id === game.current_round_id) ??
    (rounds ?? [])[0] ??
    null;

  const { data: groups, error: groupsError } = await supabase
    .from(T.groups)
    .select("id, name, display_order, score, red_tokens")
    .eq("game_id", game.id)
    .order("display_order", { ascending: true });

  if (groupsError) {
    return NextResponse.json({ error: groupsError.message }, { status: 500 });
  }

  const groupIds = (groups ?? []).map((group) => group.id);

  const { data: groupOrders, error: groupOrdersError } = await supabase
    .from(T.groupOrders)
    .select("id, group_id, order_template_id, status, assigned_at")
    .eq("game_id", game.id)
    .in("status", [...ACTIVE_ORDER_STATUSES])
    .order("assigned_at", { ascending: false });

  if (groupOrdersError) {
    return NextResponse.json(
      { error: groupOrdersError.message },
      { status: 500 },
    );
  }

  const templateIds = [
    ...new Set((groupOrders ?? []).map((order) => order.order_template_id)),
  ];
  const { data: templates, error: templatesError } = await supabase
    .from(T.orderTemplates)
    .select("id, order_no, difficulty")
    .in(
      "id",
      templateIds.length > 0
        ? templateIds
        : ["00000000-0000-0000-0000-000000000000"],
    );

  if (templatesError) {
    return NextResponse.json({ error: templatesError.message }, { status: 500 });
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from(T.cookingSessions)
    .select(
      "id, group_order_id, group_id, buffer_seconds, player_timer_seconds, started_at, removed_at, actual_seconds, result, created_at",
    )
    .in(
      "group_id",
      groupIds.length > 0
        ? groupIds
        : ["00000000-0000-0000-0000-000000000000"],
    )
    .order("created_at", { ascending: false });

  if (sessionsError) {
    return NextResponse.json({ error: sessionsError.message }, { status: 500 });
  }

  const { data: allGameGroupOrders, error: allGameGroupOrdersError } =
    await supabase
      .from(T.groupOrders)
      .select("id")
      .eq("game_id", game.id);

  if (allGameGroupOrdersError) {
    return NextResponse.json(
      { error: allGameGroupOrdersError.message },
      { status: 500 },
    );
  }

  const allGameGroupOrderIds = (allGameGroupOrders ?? []).map(
    (order) => order.id,
  );

  const { data: servedOrders, error: servedOrdersError } = await supabase
    .from(T.servedOrders)
    .select("served_by_group_id, decision")
    .in(
      "group_order_id",
      allGameGroupOrderIds.length > 0
        ? allGameGroupOrderIds
        : ["00000000-0000-0000-0000-000000000000"],
    );

  if (servedOrdersError) {
    return NextResponse.json(
      { error: servedOrdersError.message },
      { status: 500 },
    );
  }

  const orderStatsByGroupId = new Map<
    string,
    { order_success: number; order_failure: number }
  >();

  for (const servedOrder of servedOrders ?? []) {
    const stats = orderStatsByGroupId.get(servedOrder.served_by_group_id) ?? {
      order_success: 0,
      order_failure: 0,
    };

    if (servedOrder.decision === "approved") {
      stats.order_success += 1;
    } else {
      stats.order_failure += 1;
    }

    orderStatsByGroupId.set(servedOrder.served_by_group_id, stats);
  }

  const templateMap = new Map(
    (templates ?? []).map((template) => [template.id, template]),
  );

  const sessionsByGroupOrderId = new Map<string, typeof sessions>();
  for (const session of sessions ?? []) {
    const existing = sessionsByGroupOrderId.get(session.group_order_id) ?? [];
    existing.push(session);
    sessionsByGroupOrderId.set(session.group_order_id, existing);
  }

  const ordersByGroupId = new Map<string, unknown[]>();
  for (const groupOrder of groupOrders ?? []) {
    const template = templateMap.get(groupOrder.order_template_id);
    const orderSessions = sessionsByGroupOrderId.get(groupOrder.id) ?? [];
    const activeCookingSession =
      orderSessions.find((session) => session.result === "pending") ?? null;
    const latestCookingSession = orderSessions[0] ?? null;

    const order = {
      groupOrder: {
        id: groupOrder.id,
        status: groupOrder.status,
        assignedAt: groupOrder.assigned_at,
      },
      order: {
        id: template?.id,
        orderNo: template?.order_no,
        difficulty: template?.difficulty,
      },
      activeCookingSession,
      latestCookingSession,
    };

    const existing = ordersByGroupId.get(groupOrder.group_id) ?? [];
    existing.push(order);
    ordersByGroupId.set(groupOrder.group_id, existing);
  }

  return NextResponse.json({
    serverTime: new Date().toISOString(),
    game,
    rounds: rounds ?? [],
    currentRound,
    groups: (groups ?? []).map((group) => ({
      ...group,
      order_success:
        orderStatsByGroupId.get(group.id)?.order_success ?? 0,
      order_failure:
        orderStatsByGroupId.get(group.id)?.order_failure ?? 0,
      orders: ordersByGroupId.get(group.id) ?? [],
    })),
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as DisplayPatchBody;
  const { data: game, error: gameError } = await getLatestGame();

  if (gameError || !game) {
    return NextResponse.json(
      { error: gameError?.message ?? "No game found" },
      { status: 404 },
    );
  }

  let roundId = game.current_round_id;

  if (body.action === "set_difficulty") {
    if (!body.difficulty) {
      return NextResponse.json(
        { error: "Missing difficulty" },
        { status: 400 },
      );
    }

    const { data: round, error: roundError } = await supabase
      .from(T.rounds)
      .select("id")
      .eq("game_id", game.id)
      .eq("mode", body.difficulty)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (roundError || !round) {
      return NextResponse.json(
        { error: roundError?.message ?? "Round not found" },
        { status: 404 },
      );
    }

    roundId = round.id;

    await supabase
      .from(T.rounds)
      .update({
        duration_seconds: ROUND_DURATION_SECONDS[body.difficulty],
        status: "ready",
        round_started_at: null,
        round_ended_at: null,
      })
      .eq("id", roundId);

    await supabase
      .from(T.games)
      .update({ current_round_id: roundId, status: "setup" })
      .eq("id", game.id);
  }

  if (!roundId) {
    return NextResponse.json(
      { error: "No current round selected" },
      { status: 400 },
    );
  }

  if (
    body.action !== "set_difficulty" &&
    typeof body.durationSeconds === "number" &&
    Number.isFinite(body.durationSeconds) &&
    body.durationSeconds > 0
  ) {
    await supabase
      .from(T.rounds)
      .update({ duration_seconds: Math.floor(body.durationSeconds) })
      .eq("id", roundId);
  }

  if (body.action === "start") {
    const startedAt = new Date().toISOString();

    await supabase
      .from(T.rounds)
      .update({ status: "playing", round_started_at: startedAt })
      .eq("id", roundId);

    await supabase
      .from(T.games)
      .update({ status: "playing" })
      .eq("id", game.id);
  }

  if (body.action === "pause") {
    await supabase.from(T.rounds).update({ status: "paused" }).eq("id", roundId);
    await supabase.from(T.games).update({ status: "paused" }).eq("id", game.id);
  }

  if (body.action === "reset") {
    await supabase
      .from(T.rounds)
      .update({ status: "ready", round_started_at: null, round_ended_at: null })
      .eq("id", roundId);

    await supabase.from(T.games).update({ status: "setup" }).eq("id", game.id);
  }

  return GET();
}
