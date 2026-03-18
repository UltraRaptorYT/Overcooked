import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { ALL_ORDER_NUMBERS, ORDER_TEXT_MAP } from "@/config/orders";
import { COOLDOWN_GAP } from "@/config/app";

export async function POST(req: NextRequest) {
  try {
    const { groupId } = (await req.json()) as { groupId: number };

    if (!groupId || typeof groupId !== "number") {
      return NextResponse.json({ error: "Invalid groupId" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase.rpc("assign_random_order", {
      p_group_id: groupId,
      p_order_pool: ALL_ORDER_NUMBERS,
      p_cooldown_gap: COOLDOWN_GAP,
    });

    if (error) {
      console.error("[assign]", error);

      // Surface "no available orders" as a user-friendly message
      if (error.message?.includes("NO_AVAILABLE_ORDERS")) {
        return NextResponse.json(
          {
            error:
              "No orders available for this group. Try resetting or wait for cooldown.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { error: "Failed to assign order." },
        { status: 500 },
      );
    }

    // RPC returns an array with one row
    const row = Array.isArray(data) ? data[0] : data;
    const orderNumber: number = row.assigned_order;
    const globalSeq: number = row.new_seq;
    const text = ORDER_TEXT_MAP.get(orderNumber) ?? `Order ${orderNumber}`;

    return NextResponse.json({
      orderNumber,
      text,
      globalSeq,
      groupId,
    });
  } catch (err) {
    console.error("[assign] unexpected", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
