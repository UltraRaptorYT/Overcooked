import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as T } from "@/lib/overcooked-26/tables";

type OrdersContext = {
  params: Promise<{
    customerId: string;
  }>;
};

const SELECTABLE_ORDER_STATUSES = [
  "assigned",
  "cooking",
  "cooked",
  "assembling",
] as const;

async function getCustomer(customerId: string) {
  const customerNo = Number(customerId);
  const isCustomerSlot = Number.isInteger(customerNo) && customerNo > 0;

  const customerQuery = supabase
    .from(T.customers)
    .select("id, game_id, name, customer_slot");

  if (!isCustomerSlot) {
    return customerQuery.eq("id", customerId).single();
  }

  const { data: latestGame, error: gameError } = await supabase
    .from(T.games)
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (gameError || !latestGame) {
    return {
      data: null,
      error: gameError ?? new Error("No game found"),
    };
  }

  return customerQuery
    .eq("game_id", latestGame.id)
    .eq("customer_slot", customerNo)
    .single();
}

export async function GET(_request: Request, context: OrdersContext) {
  const { customerId } = await context.params;

  const { data: customer, error: customerError } = await getCustomer(
    customerId,
  );

  if (customerError || !customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const { data: groupOrders, error: groupOrdersError } = await supabase
    .from(T.groupOrders)
    .select("id, group_id, order_template_id, status, assigned_at")
    .eq("game_id", customer.game_id)
    .in("status", [...SELECTABLE_ORDER_STATUSES])
    .order("assigned_at", { ascending: false });

  if (groupOrdersError) {
    return NextResponse.json(
      { error: groupOrdersError.message },
      { status: 500 },
    );
  }

  const templateIds = [
    ...new Set((groupOrders ?? []).map((order) => order.order_template_id)),
  ];
  const groupIds = [
    ...new Set((groupOrders ?? []).map((order) => order.group_id)),
  ];

  const { data: templates, error: templatesError } = await supabase
    .from(T.orderTemplates)
    .select("id, order_no, customer_slot")
    .in(
      "id",
      templateIds.length > 0
        ? templateIds
        : ["00000000-0000-0000-0000-000000000000"],
    );

  if (templatesError) {
    return NextResponse.json({ error: templatesError.message }, { status: 500 });
  }

  const { data: groups, error: groupsError } = await supabase
    .from(T.groups)
    .select("id, name")
    .in(
      "id",
      groupIds.length > 0
        ? groupIds
        : ["00000000-0000-0000-0000-000000000000"],
    );

  if (groupsError) {
    return NextResponse.json({ error: groupsError.message }, { status: 500 });
  }

  const templateMap = new Map(
    (templates ?? []).map((template) => [template.id, template]),
  );
  const groupMap = new Map((groups ?? []).map((group) => [group.id, group]));

  return NextResponse.json({
    orders: (groupOrders ?? [])
      .map((groupOrder) => {
        const template = templateMap.get(groupOrder.order_template_id);
        if (!template) return null;

        return {
          groupOrderId: groupOrder.id,
          orderNo: template.order_no,
          status: groupOrder.status,
          assignedAt: groupOrder.assigned_at,
          groupName: groupMap.get(groupOrder.group_id)?.name ?? "Unknown group",
          belongsToThisCustomer:
            template.customer_slot === customer.customer_slot,
        };
      })
      .filter(Boolean),
  });
}
