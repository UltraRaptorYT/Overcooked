import { NextResponse as ReplayNextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as ReplayT } from "@/lib/overcooked-26/tables";

type ReplayRouteContext = {
  params: Promise<{
    groupOrderId: string;
  }>;
};

export async function POST(_request: Request, context: ReplayRouteContext) {
  const { groupOrderId } = await context.params;

  const { data: existingOrder, error: fetchError } = await supabase
    .from(ReplayT.groupOrders)
    .select("id, replay_count, order_template_id")
    .eq("id", groupOrderId)
    .single();

  if (fetchError || !existingOrder) {
    return ReplayNextResponse.json(
      { error: "Group order not found" },
      { status: 404 },
    );
  }

  const { data: orderTemplate, error: orderTemplateError } = await supabase
    .from(ReplayT.orderTemplates)
    .select("spoken_text")
    .eq("id", existingOrder.order_template_id)
    .single();

  if (orderTemplateError || !orderTemplate) {
    return ReplayNextResponse.json(
      { error: "Order template not found" },
      { status: 404 },
    );
  }

  const { error: updateError } = await supabase
    .from(ReplayT.groupOrders)
    .update({
      replay_count: Number(existingOrder.replay_count ?? 0) + 1,
      last_replayed_at: new Date().toISOString(),
    })
    .eq("id", groupOrderId);

  if (updateError) {
    return ReplayNextResponse.json(
      { error: updateError.message },
      { status: 500 },
    );
  }

  return ReplayNextResponse.json({
    spokenText: orderTemplate.spoken_text,
  });
}
