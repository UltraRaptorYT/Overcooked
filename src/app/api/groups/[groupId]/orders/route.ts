import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as T } from "@/lib/overcooked-26/tables";

type RouteContext = {
  params: Promise<{
    groupId: string;
  }>;
};

const REPLAYABLE_ORDER_STATUSES = [
  "assigned",
  "cooking",
  "cooked",
  "assembling",
  "served",
] as const;

export async function GET(_request: Request, context: RouteContext) {
  const { groupId } = await context.params;

  if (!groupId) {
    return NextResponse.json({ error: "Missing groupId" }, { status: 400 });
  }

  const { data: group, error: groupError } = await supabase
    .from(T.groups)
    .select("id")
    .eq("id", groupId)
    .single();

  if (groupError || !group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const { data: groupOrders, error } = await supabase
    .from(T.groupOrders)
    .select("id, assigned_at")
    .eq("group_id", groupId)
    .in("status", [...REPLAYABLE_ORDER_STATUSES])
    .order("assigned_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    orders: (groupOrders ?? []).map((order) => ({
      groupOrderId: order.id,
      assignedAt: order.assigned_at,
    })),
  });
}
