import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as T } from "@/lib/overcooked-26/tables";

type Context = {
  params: Promise<{
    groupId: string;
  }>;
};

const ACTIVE_ORDER_STATUSES = [
  "assigned",
  "cooking",
  "cooked",
  "assembling",
  "served",
] as const;

export async function GET(_request: Request, context: Context) {
  const { groupId } = await context.params;

  const { data: group, error: groupError } = await supabase
    .from(T.groups)
    .select("id, game_id, name")
    .eq("id", groupId)
    .single();

  if (groupError || !group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const { data: groupOrders, error: groupOrdersError } = await supabase
    .from(T.groupOrders)
    .select(
      "id, game_id, round_id, group_id, order_template_id, status, assigned_at, cooking_started_at, cooking_completed_at",
    )
    .eq("group_id", groupId)
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

  const { data: orderTemplates, error: templatesError } = await supabase
    .from(T.orderTemplates)
    .select("id, order_no, difficulty, required_total_cook_time_seconds")
    .in(
      "id",
      templateIds.length > 0
        ? templateIds
        : ["00000000-0000-0000-0000-000000000000"],
    );

  if (templatesError) {
    return NextResponse.json(
      { error: templatesError.message },
      { status: 500 },
    );
  }

  const templateMap = new Map(
    (orderTemplates ?? []).map((template) => [template.id, template]),
  );

  const groupOrderIds = (groupOrders ?? []).map((order) => order.id);
  const { data: cookingSessions, error: sessionsError } = await supabase
    .from(T.cookingSessions)
    .select(
      "id, group_order_id, buffer_seconds, player_timer_seconds, started_at, removed_at, actual_seconds, result, created_at",
    )
    .in(
      "group_order_id",
      groupOrderIds.length > 0
        ? groupOrderIds
        : ["00000000-0000-0000-0000-000000000000"],
    )
    .order("created_at", { ascending: false });

  if (sessionsError) {
    return NextResponse.json({ error: sessionsError.message }, { status: 500 });
  }

  const sessionsByGroupOrderId = new Map<string, typeof cookingSessions>();

  for (const session of cookingSessions ?? []) {
    const existing = sessionsByGroupOrderId.get(session.group_order_id) ?? [];
    existing.push(session);
    sessionsByGroupOrderId.set(session.group_order_id, existing);
  }

  const orders = (groupOrders ?? []).map((groupOrder) => {
    const template = templateMap.get(groupOrder.order_template_id);
    const sessions = sessionsByGroupOrderId.get(groupOrder.id) ?? [];
    const activeCookingSession =
      sessions.find((session) => session.result === "pending") ?? null;
    const latestCookingSession = sessions[0] ?? null;

    return {
      order: {
        id: template?.id,
        orderNo: template?.order_no,
        difficulty: template?.difficulty,
        requiredTotalCookTimeSeconds:
          template?.required_total_cook_time_seconds,
      },
      groupOrder: {
        id: groupOrder.id,
        status: groupOrder.status,
        assignedAt: groupOrder.assigned_at,
        cookingStartedAt: groupOrder.cooking_started_at,
        cookingCompletedAt: groupOrder.cooking_completed_at,
      },
      activeCookingSession,
      latestCookingSession,
    };
  });

  return NextResponse.json({
    group: {
      id: group.id,
      name: group.name,
    },
    orders,
  });
}
