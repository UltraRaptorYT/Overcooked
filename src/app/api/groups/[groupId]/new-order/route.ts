import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as T } from "@/lib/overcooked-26/tables";
import { getOrderAudioPath } from "@/lib/order-audio";

type RouteContext = {
  params: Promise<{
    groupId: string;
  }>;
};

const ACTIVE_LOCK_STATUSES = [
  "assigned",
  "cooking",
  "cooked",
  "assembling",
  "served",
] as const;

function pickRandom<TItem>(items: TItem[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function isUniqueViolation(error: { code?: string } | null | undefined) {
  return error?.code === "23505";
}

export async function POST(_request: Request, context: RouteContext) {
  const { groupId } = await context.params;

  if (!groupId) {
    return NextResponse.json({ error: "Missing groupId" }, { status: 400 });
  }

  const { data: group, error: groupError } = await supabase
    .from(T.groups)
    .select("id, game_id, name")
    .eq("id", groupId)
    .single();

  if (groupError || !group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const { data: game, error: gameError } = await supabase
    .from(T.games)
    .select("id, current_round_id, status")
    .eq("id", group.game_id)
    .single();

  if (gameError || !game?.current_round_id) {
    return NextResponse.json(
      { error: "No current round found" },
      { status: 400 },
    );
  }

  const { data: round, error: roundError } = await supabase
    .from(T.rounds)
    .select("id, mode, status")
    .eq("id", game.current_round_id)
    .single();

  if (roundError || !round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  if (!["ready", "strategising", "playing"].includes(round.status)) {
    return NextResponse.json(
      { error: `Cannot assign orders while round is ${round.status}` },
      { status: 400 },
    );
  }

  const { data: usedOrders, error: usedOrdersError } = await supabase
    .from(T.groupOrders)
    .select("order_template_id")
    .eq("game_id", group.game_id)
    .eq("group_id", groupId);

  if (usedOrdersError) {
    return NextResponse.json(
      { error: usedOrdersError.message },
      { status: 500 },
    );
  }

  const usedOrderTemplateIds = new Set(
    (usedOrders ?? []).map((row) => row.order_template_id as string),
  );

  const { data: lockedOrders, error: lockedOrdersError } = await supabase
    .from(T.groupOrders)
    .select("order_template_id")
    .eq("game_id", group.game_id)
    .in("status", [...ACTIVE_LOCK_STATUSES]);

  if (lockedOrdersError) {
    return NextResponse.json(
      { error: lockedOrdersError.message },
      { status: 500 },
    );
  }

  const lockedOrderTemplateIds = new Set(
    (lockedOrders ?? []).map((row) => row.order_template_id as string),
  );

  const { data: candidateOrders, error: candidateOrdersError } = await supabase
    .from(T.orderTemplates)
    .select(
      "id, order_no, spoken_text, audio_path, difficulty, required_total_cook_time_seconds",
    )
    .eq("difficulty", round.mode)
    .eq("is_active", true);

  if (candidateOrdersError) {
    return NextResponse.json(
      { error: candidateOrdersError.message },
      { status: 500 },
    );
  }

  const availableOrders = (candidateOrders ?? []).filter(
    (order) =>
      !usedOrderTemplateIds.has(order.id) &&
      !lockedOrderTemplateIds.has(order.id),
  );

  if (availableOrders.length === 0) {
    return NextResponse.json(
      { error: `No ${round.mode} orders left to assign` },
      { status: 400 },
    );
  }

  let selectedOrder = pickRandom(availableOrders);
  let groupOrder: { id: string; assigned_at: string } | null = null;
  let insertError: { message?: string; code?: string } | null = null;
  const remainingOrders = [...availableOrders];

  while (remainingOrders.length > 0) {
    selectedOrder = pickRandom(remainingOrders);

    const result = await supabase
      .from(T.groupOrders)
      .insert({
        game_id: group.game_id,
        round_id: round.id,
        group_id: groupId,
        order_template_id: selectedOrder.id,
        status: "assigned",
        assigned_at: new Date().toISOString(),
      })
      .select("id, assigned_at")
      .single();

    groupOrder = result.data;
    insertError = result.error;

    if (!insertError && groupOrder) break;
    if (!isUniqueViolation(insertError)) break;

    const usedIndex = remainingOrders.findIndex(
      (order) => order.id === selectedOrder.id,
    );
    if (usedIndex >= 0) {
      remainingOrders.splice(usedIndex, 1);
    }
  }

  if (insertError || !groupOrder) {
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to assign order" },
      { status: 500 },
    );
  }

  await supabase.from(T.gameEvents).insert({
    game_id: group.game_id,
    round_id: round.id,
    group_id: groupId,
    event_type: "order_assigned",
    message: `${group.name} received a new ${round.mode} order`,
    metadata: {
      groupOrderId: groupOrder.id,
      orderTemplateId: selectedOrder.id,
      orderNo: selectedOrder.order_no,
    },
  });

  return NextResponse.json({
    groupOrderId: groupOrder.id,
    assignedAt: groupOrder.assigned_at,
    orderNo: selectedOrder.order_no,
    difficulty: selectedOrder.difficulty,
    audioPath:
      selectedOrder.audio_path ??
      getOrderAudioPath({
        difficulty: selectedOrder.difficulty,
        orderNo: selectedOrder.order_no,
      }),
    // Important: visually hide this on the UI. It is only used for text-to-speech.
    spokenText: selectedOrder.spoken_text,
  });
}
