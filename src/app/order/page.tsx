import Link from "next/link";
import { notFound } from "next/navigation";
import supabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as GroupPageT } from "@/lib/overcooked-26/tables";
import { GroupOrderClient } from "./[groupId]/group-order-client";

type GroupSelectorPageProps = {
  searchParams: Promise<{
    groupId?: string;
  }>;
};

export default async function GroupSelectorPage({
  searchParams,
}: GroupSelectorPageProps) {
  const { groupId } = await searchParams;
  const { data: latestGame, error: gameError } = await supabase
    .from(GroupPageT.games)
    .select("id, name, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (gameError || !latestGame) {
    throw new Error(gameError?.message ?? "No game found");
  }

  const { data: groups, error } = await supabase
    .from(GroupPageT.groups)
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

    return <GroupOrderClient groupId={group.id} groupName={group.name} />;
  }

  return (
    <main className="min-h-screen bg-orange-50 p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-orange-950">
          煮过头！Group Order App
        </h1>
        <p className="mt-2 text-orange-900">Choose your group device.</p>
        <p className="mt-1 text-sm text-orange-700">Game: {latestGame.name}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {(groups ?? []).map((group) => (
            <Link
              key={group.id}
              href={`/order?groupId=${group.display_order}`}
              className="rounded-2xl border border-orange-200 bg-white p-6 shadow-sm transition hover:scale-[1.01] hover:shadow-md"
            >
              <div className="text-xl font-semibold text-orange-950">
                {group.name}
              </div>
              <div className="mt-1 text-sm text-orange-700">
                Open order station
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
