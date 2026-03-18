import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST() {
  try {
    const supabase = createServiceClient();

    const { error } = await supabase
      .from("overcooked_26_order_assignments")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (error) {
      console.error("[reset]", error);
      return NextResponse.json({ error: "Failed to reset." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[reset] unexpected", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
