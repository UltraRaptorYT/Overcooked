import Link from "next/link";
import supabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as GroupPageT } from "@/lib/overcooked-26/tables";

export default async function GroupSelectorPage() {
  const { data: groups, error } = await supabase
    .from(GroupPageT.groups)
    .select("id, name, display_order")
    .order("display_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <main className="min-h-screen bg-orange-50 p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-orange-950">
          煮过头！Group Order App
        </h1>
        <p className="mt-2 text-orange-900">Choose your group device.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {(groups ?? []).map((group) => (
            <Link
              key={group.id}
              href={`/group/${group.id}`}
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
