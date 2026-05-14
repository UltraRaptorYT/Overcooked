"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { UserType } from "@/types";

export default function ServeClient() {
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const [error, setError] = useState("");
  const [user, setUser] = useState<UserType | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!userId) {
        setError("No userId provided in URL.");
        return;
      }

      try {
        const response = await fetch(`/api/getUsers`);
        const userData = await response.json();

        console.log("Fetched user data:", userData);

        const matchedUser = userData.users.find(
          (g: any) => String(g.id) === String(userId),
        );

        if (!matchedUser) {
          setError(`User with id ${userId} does not exist.`);
          return;
        }

        setUser(matchedUser);
        setError("");
      } catch (error) {
        console.error("Error fetching User data:", error);
        setError("Failed to fetch User data.");
      }
    };

    fetchUserData();
  }, [userId]);

  if (error) {
    return <h1>{error}</h1>;
  }

  return <div>hi {user?.name}</div>;
}
