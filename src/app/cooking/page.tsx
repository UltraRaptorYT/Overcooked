import Link from "next/link";
import { notFound } from "next/navigation";
import cookingPageSupabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as CookingPageT } from "@/lib/overcooked-26/tables";
import { CookingStationClient } from "./[groupId]/cooking-station-client";

type CookingGroupSelectorPageProps = {
  searchParams: Promise<{
    groupId?: string;
  }>;
};

export default async function CookingGroupSelectorPage({
  searchParams,
}: CookingGroupSelectorPageProps) {
  const { groupId } = await searchParams;
  // If you ran the seed script more than once, there will be multiple games,
  // each with Group 1–6. So we only show groups from the latest created game.
  const { data: latestGame, error: gameError } = await cookingPageSupabase
    .from(CookingPageT.games)
    .select("id, name, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (gameError || !latestGame) {
    throw new Error(gameError?.message ?? "No game found");
  }

  const { data: groups, error } = await cookingPageSupabase
    .from(CookingPageT.groups)
    .select("id, name, display_order")
    .eq("game_id", latestGame.id)
    .order("display_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  if (groupId) {
    const groupNo = Number(groupId);

    if (!Number.isInteger(groupNo) || groupNo <= 0) {
      notFound();
    }

    const group = (groups ?? []).find(
      (candidate) => candidate.display_order === groupNo,
    );

    if (!group) {
      notFound();
    }

    return <CookingStationClient groupId={group.id} groupName={group.name} />;
  }

  return (
    <main className="min-h-screen bg-sky-50 p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-sky-950">Cooking Station</h1>
        <p className="mt-2 text-sky-900">
          Choose which group is using this cooking device.
        </p>
        <p className="mt-1 text-sm text-sky-700">Game: {latestGame.name}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {(groups ?? []).map((group) => (
            <Link
              key={group.id}
              href={`/cooking?groupId=${group.display_order}`}
              className="rounded-2xl border border-sky-200 bg-white p-6 shadow-sm transition hover:scale-[1.01] hover:shadow-md"
            >
              <div className="text-xl font-semibold text-sky-950">
                {group.name}
              </div>
              <div className="mt-1 text-sm text-sky-700">
                Open cooking timer
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
