import { notFound } from "next/navigation";
import supabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as OrderPageT } from "@/lib/overcooked-26/tables";
import { GroupOrderClient } from "./group-order-client";

type PageProps = {
  params: Promise<{
    groupId: string;
  }>;
};

export default async function GroupOrderPage({ params }: PageProps) {
  const { groupId } = await params;

  const { data: group, error } = await supabase
    .from(OrderPageT.groups)
    .select("id, name")
    .eq("id", groupId)
    .single();

  if (error || !group) {
    notFound();
  }

  return <GroupOrderClient groupId={group.id} groupName={group.name} />;
}
