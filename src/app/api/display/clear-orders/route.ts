import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as T } from "@/lib/overcooked-26/tables";

async function getLatestGame() {
  return supabase
    .from(T.games)
    .select("id, name, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
}

export async function POST() {
  const { data: game, error: gameError } = await getLatestGame();

  if (gameError || !game) {
    return NextResponse.json(
      { error: gameError?.message ?? "No game found" },
      { status: 404 },
    );
  }

  const { count, error: deleteError } = await supabase
    .from(T.groupOrders)
    .delete({ count: "exact" })
    .eq("game_id", game.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error: scoreError } = await supabase
    .from(T.groups)
    .update({ score: 0, red_tokens: 0 })
    .eq("game_id", game.id);

  if (scoreError) {
    return NextResponse.json({ error: scoreError.message }, { status: 500 });
  }

  return NextResponse.json({
    game: {
      id: game.id,
      name: game.name,
    },
    deletedOrders: count ?? 0,
  });
}
