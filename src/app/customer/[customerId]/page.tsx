import { notFound } from "next/navigation";
import singleCustomerPageSupabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as SingleCustomerPageT } from "@/lib/overcooked-26/tables";
import { CustomerDashboardClient } from "./customer-dashboard-client";

type CustomerPageProps = {
  params: Promise<{
    customerId: string;
  }>;
};

export default async function CustomerDashboardPage({
  params,
}: CustomerPageProps) {
  const { customerId } = await params;
  const customerNo = Number(customerId);
  const isCustomerSlot = Number.isInteger(customerNo) && customerNo > 0;

  let customerQuery = singleCustomerPageSupabase
    .from(SingleCustomerPageT.customers)
    .select("id, name, customer_slot");

  if (isCustomerSlot) {
    const { data: latestGame, error: gameError } =
      await singleCustomerPageSupabase
        .from(SingleCustomerPageT.games)
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

    if (gameError || !latestGame) {
      notFound();
    }

    customerQuery = customerQuery
      .eq("game_id", latestGame.id)
      .eq("customer_slot", customerNo);
  } else {
    customerQuery = customerQuery.eq("id", customerId);
  }

  const { data: customer, error } = await customerQuery.single();

  if (error || !customer) {
    notFound();
  }

  return (
    <CustomerDashboardClient
      customerId={customer.id}
      customerName={customer.name}
      customerSlot={customer.customer_slot}
    />
  );
}
