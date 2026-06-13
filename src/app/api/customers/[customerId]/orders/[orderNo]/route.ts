import { NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { OVERCOOKED_26_TABLES as T } from "@/lib/overcooked-26/tables";

type LookupContext = {
  params: Promise<{
    customerId: string;
    orderNo: string;
  }>;
};

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

function normalizeItemName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function GET(request: Request, context: LookupContext) {
  const { customerId, orderNo } = await context.params;

  const cleanedOrderNo = orderNo.trim();
  const requestedGroupOrderId = new URL(request.url).searchParams.get(
    "groupOrderId",
  );

  if (!customerId || !cleanedOrderNo) {
    return NextResponse.json(
      { error: "Missing customerId or orderNo" },
      { status: 400 },
    );
  }

  const { data: customer, error: customerError } = await getCustomer(
    customerId,
  );

  if (customerError || !customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const { data: orderTemplate, error: orderTemplateError } = await supabase
    .from(T.orderTemplates)
    .select(
      "id, order_no, difficulty, customer_slot, required_total_cook_time_seconds",
    )
    .eq("order_no", cleanedOrderNo)
    .single();

  if (orderTemplateError || !orderTemplate) {
    return NextResponse.json(
      { error: "Order number not found" },
      { status: 404 },
    );
  }

  let groupOrderQuery = supabase
    .from(T.groupOrders)
    .select(
      "id, game_id, round_id, group_id, status, assigned_at, served_at, completed_at, completion_seconds",
    )
    .eq("game_id", customer.game_id)
    .eq("order_template_id", orderTemplate.id);

  if (requestedGroupOrderId) {
    groupOrderQuery = groupOrderQuery.eq("id", requestedGroupOrderId);
  }

  const { data: groupOrder, error: groupOrderError } = await groupOrderQuery
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (groupOrderError) {
    return NextResponse.json(
      { error: groupOrderError.message },
      { status: 500 },
    );
  }

  if (!groupOrder) {
    return NextResponse.json(
      {
        error: "This order exists, but has not been assigned to any group yet",
      },
      { status: 404 },
    );
  }

  const { data: group, error: groupError } = await supabase
    .from(T.groups)
    .select("id, name, score, red_tokens")
    .eq("id", groupOrder.group_id)
    .single();

  if (groupError || !group) {
    return NextResponse.json(
      { error: "Assigned group not found" },
      { status: 404 },
    );
  }

  const { data: rawItems, error: itemsError } = await supabase
    .from(T.orderTemplateItems)
    .select("id, zone, food_item_id, colour, parent_item, sequence")
    .eq("order_template_id", orderTemplate.id)
    .order("zone", { ascending: true })
    .order("sequence", { ascending: true, nullsFirst: false });

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const foodIds = [
    ...new Set((rawItems ?? []).map((item) => item.food_item_id)),
  ];

  const { data: foodItems, error: foodItemsError } = await supabase
    .from(T.foodItems)
    .select("id, name, requires_cooking, cook_time_seconds, image_url")
    .in("id", foodIds);

  if (foodItemsError) {
    return NextResponse.json(
      { error: foodItemsError.message },
      { status: 500 },
    );
  }

  const foodMap = new Map((foodItems ?? []).map((food) => [food.id, food]));
  const { data: itemImages, error: itemImagesError } = await supabase
    .from(T.items)
    .select("name, image_url");

  if (itemImagesError) {
    return NextResponse.json(
      { error: itemImagesError.message },
      { status: 500 },
    );
  }

  const itemImageUrlMap = new Map(
    (itemImages ?? []).map((item) => [
      normalizeItemName(item.name),
      item.image_url,
    ]),
  );

  const items = (rawItems ?? []).map((item) => {
    const food = foodMap.get(item.food_item_id);

    return {
      id: item.id,
      zone: item.zone,
      foodItemId: item.food_item_id,
      foodName: food?.name ?? item.food_item_id,
      colour: item.colour,
      parentItem: item.parent_item,
      sequence: item.sequence,
      requiresCooking: food?.requires_cooking ?? false,
      cookTimeSeconds: food?.cook_time_seconds ?? 0,
      imageUrl:
        itemImageUrlMap.get(normalizeItemName(food?.name ?? "")) ??
        food?.image_url ??
        null,
    };
  });

  const { data: latestCookingSession } = await supabase
    .from(T.cookingSessions)
    .select(
      "id, required_seconds, buffer_seconds, started_at, removed_at, actual_seconds, result",
    )
    .eq("group_order_id", groupOrder.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const belongsToThisCustomer =
    orderTemplate.customer_slot === customer.customer_slot;

  const { data: correctCustomer, error: correctCustomerError } = await supabase
    .from(T.customers)
    .select("id, name, customer_slot")
    .eq("game_id", customer.game_id)
    .eq("customer_slot", orderTemplate.customer_slot)
    .single();

  if (correctCustomerError || !correctCustomer) {
    return NextResponse.json(
      { error: "Correct customer not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    customer: {
      id: customer.id,
      name: customer.name,
      customerSlot: customer.customer_slot,
    },
    order: {
      id: orderTemplate.id,
      orderNo: orderTemplate.order_no,
      difficulty: orderTemplate.difficulty,
      customerSlot: orderTemplate.customer_slot,
      belongsToThisCustomer,
      requiredTotalCookTimeSeconds:
        orderTemplate.required_total_cook_time_seconds,
    },
    correctCustomer: {
      id: correctCustomer.id,
      name: correctCustomer.name,
      customerSlot: correctCustomer.customer_slot,
    },
    groupOrder: {
      id: groupOrder.id,
      status: groupOrder.status,
      assignedAt: groupOrder.assigned_at,
      servedAt: groupOrder.served_at,
      completedAt: groupOrder.completed_at,
      completionSeconds: groupOrder.completion_seconds,
    },
    group,
    items,
    cookingSession: latestCookingSession ?? null,
  });
}
