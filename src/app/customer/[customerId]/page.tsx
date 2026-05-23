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

  const { data: customer, error } = await singleCustomerPageSupabase
    .from(SingleCustomerPageT.customers)
    .select("id, name, customer_slot")
    .eq("id", customerId)
    .single();

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
