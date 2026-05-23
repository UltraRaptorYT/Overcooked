import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as T } from "@/lib/overcooked-26/tables";

type RouteContext = {
  params: Promise<{
    groupId: string;
  }>;
};

function pickRandom<TItem>(items: TItem[]) {
  return items[Math.floor(Math.random() * items.length)];
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

  const { data: activeOrders, error: activeOrdersError } = await supabase
    .from(T.groupOrders)
    .select("id, status")
    .eq("group_id", groupId)
    .in("status", ["assigned", "cooking", "cooked", "assembling", "served"]);

  if (activeOrdersError) {
    return NextResponse.json(
      { error: activeOrdersError.message },
      { status: 500 },
    );
  }

  if (activeOrders && activeOrders.length > 0) {
    return NextResponse.json(
      { error: "This group already has an active order" },
      { status: 409 },
    );
  }

  const { data: usedOrders, error: usedOrdersError } = await supabase
    .from(T.groupOrders)
    .select("order_template_id")
    .eq("game_id", group.game_id);

  if (usedOrdersError) {
    return NextResponse.json(
      { error: usedOrdersError.message },
      { status: 500 },
    );
  }

  const usedOrderTemplateIds = new Set(
    (usedOrders ?? []).map((row) => row.order_template_id as string),
  );

  const { data: candidateOrders, error: candidateOrdersError } = await supabase
    .from(T.orderTemplates)
    .select(
      "id, order_no, spoken_text, difficulty, required_total_cook_time_seconds",
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
    (order) => !usedOrderTemplateIds.has(order.id),
  );

  if (availableOrders.length === 0) {
    return NextResponse.json(
      { error: `No ${round.mode} orders left to assign` },
      { status: 400 },
    );
  }

  const selectedOrder = pickRandom(availableOrders);

  const { data: groupOrder, error: insertError } = await supabase
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
    // Important: visually hide this on the UI. It is only used for browser speechSynthesis.
    spokenText: selectedOrder.spoken_text,
  });
}
