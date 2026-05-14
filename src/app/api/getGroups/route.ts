import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("overcooked_26_groups")
      .select("")
      .order("id", { ascending: true });

    if (error) {
      console.error("[getGroups]", error);
      return NextResponse.json(
        { error: "Failed to fetch groups." },
        { status: 500 },
      );
    }

    return NextResponse.json({ groups: data }, { status: 200 });
  } catch (err) {
    console.error("[getGroups] unexpected", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
