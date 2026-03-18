import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { ORDER_TEXT_MAP } from "@/config/orders";

export async function GET() {
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("overcooked_26_order_assignments")
      .select("id, order_number, group_id, global_seq, created_at")
      .order("global_seq", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[history]", error);
      return NextResponse.json(
        { error: "Failed to fetch history." },
        { status: 500 },
      );
    }

    const history = (data ?? []).map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      text: ORDER_TEXT_MAP.get(row.order_number) ?? `Order ${row.order_number}`,
      groupId: row.group_id,
      globalSeq: row.global_seq,
      createdAt: row.created_at,
    }));

    return NextResponse.json({ history });
  } catch (err) {
    console.error("[history] unexpected", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
