import Link from "next/link";
import { notFound } from "next/navigation";
import customerPageSupabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as CustomerPageT } from "@/lib/overcooked-26/tables";
import { CustomerDashboardClient } from "./[customerId]/customer-dashboard-client";

type CustomerSelectorPageProps = {
  searchParams: Promise<{
    customerId?: string;
  }>;
};

export default async function CustomerSelectorPage({
  searchParams,
}: CustomerSelectorPageProps) {
  const { customerId } = await searchParams;
  const { data: latestGame, error: gameError } = await customerPageSupabase
    .from(CustomerPageT.games)
    .select("id, name, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (gameError || !latestGame) {
    throw new Error(gameError?.message ?? "No game found");
  }

  const { data: customers, error } = await customerPageSupabase
    .from(CustomerPageT.customers)
    .select("id, name, customer_slot, physical_position")
    .eq("game_id", latestGame.id)
    .order("customer_slot", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  if (customerId) {
    const customerNo = Number(customerId);

    if (!Number.isInteger(customerNo) || customerNo <= 0) {
      notFound();
    }

    const customer = (customers ?? []).find(
      (candidate) => candidate.customer_slot === customerNo,
    );

    if (!customer) {
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

  return (
    <main className="min-h-screen bg-emerald-50 p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-emerald-950">
          Customer Dashboard
        </h1>
        <p className="mt-2 text-emerald-900">
          Choose the customer station device.
        </p>
        <p className="mt-1 text-sm text-emerald-700">
          Game: {latestGame.name}
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {(customers ?? []).map((customer) => (
            <Link
              key={customer.id}
              href={`/customer?customerId=${customer.customer_slot}`}
              className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm transition hover:scale-[1.01] hover:shadow-md"
            >
              <div className="text-xl font-semibold text-emerald-950">
                {customer.name}
              </div>
              <div className="mt-1 text-sm text-emerald-700">
                Customer slot {customer.customer_slot}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
