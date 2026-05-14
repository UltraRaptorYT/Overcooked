import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("overcooked_26_users")
      .select("")
      .order("id", { ascending: true });

    if (error) {
      console.error("[getUsers]", error);
      return NextResponse.json(
        { error: "Failed to fetch users." },
        { status: 500 },
      );
    }

    return NextResponse.json({ users: data }, { status: 200 });
  } catch (err) {
    console.error("[getUsers] unexpected", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
