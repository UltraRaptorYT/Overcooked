"use client";

import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { GroupType } from "@/types";

export default function OrderClient() {
  const searchParams = useSearchParams();
  const groupId = searchParams.get("groupId");

  const [group, setGroup] = useState<GroupType | null>(null);
  const [error, setError] = useState("");

  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    const fetchGroupData = async () => {
      if (!groupId) {
        setError("No groupId provided in URL.");
        return;
      }

      try {
        const response = await fetch(`/api/getGroups`);
        const groupData = await response.json();

        console.log("Fetched group data:", groupData);

        const matchedGroup = groupData.groups.find(
          (g: any) => String(g.id) === String(groupId),
        );

        if (!matchedGroup) {
          setError(`Group with id ${groupId} does not exist.`);
          return;
        }

        setGroup(matchedGroup);
        setError("");
      } catch (error) {
        console.error("Error fetching group data:", error);
        setError("Failed to fetch group data.");
      }
    };

    fetchGroupData();
  }, [groupId]);

  if (error) {
    return <h1>{error}</h1>;
  }

  return (
    <div>
      Group ID: {groupId}
      <br />
      Group Name: {group?.name || "Loading..."}
      <Button>Next Order</Button>
      <div className="flex flex-col gap-2">
        Order List:
        <Button></Button>
      </div>
    </div>
  );
}
