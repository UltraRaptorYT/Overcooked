import { notFound } from "next/navigation";
import singleCookingPageSupabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as SingleCookingPageT } from "@/lib/overcooked-26/tables";
import { CookingStationClient } from "./cooking-station-client";

type CookingPageProps = {
  params: Promise<{
    groupId: string;
  }>;
};

export default async function CookingStationPage({ params }: CookingPageProps) {
  const { groupId } = await params;

  const { data: group, error } = await singleCookingPageSupabase
    .from(SingleCookingPageT.groups)
    .select("id, name")
    .eq("id", groupId)
    .single();

  if (error || !group) {
    notFound();
  }

  return <CookingStationClient groupId={group.id} groupName={group.name} />;
}
