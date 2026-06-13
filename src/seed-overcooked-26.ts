// scripts/seed-overcooked-26.ts
// Run with: npx tsx scripts/seed-overcooked-26.ts
// Required env in .env.local:
// NEXT_PUBLIC_SUPABASE_URL=...
// SUPABASE_SERVICE_ROLE_KEY=...

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { FOOD_ITEMS, EASY_ORDERS, HARD_ORDERS } from "../src/lib/game-data";
import { calculateOrderCookTimeSeconds } from "../src/lib/game-data/helpers";
import { getOrderAudioPath } from "../src/lib/order-audio";
import type { OrderTemplate } from "../src/lib/game-data/types";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in .env.local");
}

if (!serviceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const TABLES = {
  games: "overcooked_26_games",
  rounds: "overcooked_26_rounds",
  groups: "overcooked_26_groups",
  customers: "overcooked_26_customers",
  foodItems: "overcooked_26_food_items",
  orderTemplates: "overcooked_26_order_templates",
  orderTemplateItems: "overcooked_26_order_template_items",
} as const;

function assertNoError<T>(
  result: { data: T; error: unknown },
  label: string,
): T {
  if (result.error) {
    console.error(`\n❌ ${label} failed`);
    console.error(result.error);
    process.exit(1);
  }

  return result.data;
}

async function seedFoodItems() {
  console.log("Seeding food items...");

  const { data: existingFoodItems, error: existingFoodItemsError } =
    await supabase.from(TABLES.foodItems).select("id, image_url");

  assertNoError(
    { data: existingFoodItems ?? [], error: existingFoodItemsError },
    "load existing food item images",
  );

  const existingImageUrlById = new Map(
    (existingFoodItems ?? []).map((item) => [item.id, item.image_url]),
  );

  const rows = FOOD_ITEMS.map((item) => ({
    id: item.id,
    name: item.name,
    requires_cooking: item.requiresCooking,
    cook_time_seconds: item.cookTimeSeconds,
    image_url: item.imageUrl ?? existingImageUrlById.get(item.id) ?? null,
  }));

  const result = await supabase
    .from(TABLES.foodItems)
    .upsert(rows, { onConflict: "id" })
    .select("id");

  assertNoError(result, "seedFoodItems");
  console.log(`✅ Seeded ${rows.length} food items`);
}

async function seedOrderTemplates(orders: OrderTemplate[]) {
  console.log(`Seeding ${orders.length} order templates...`);

  for (const order of orders) {
    const requiredCookTime = calculateOrderCookTimeSeconds(order);

    const templateResult = await supabase
      .from(TABLES.orderTemplates)
      .upsert(
        {
          order_no: order.orderNo,
          difficulty: order.difficulty,
          customer_slot: order.customerSlot,
          spoken_text: order.spokenText,
          audio_path:
            order.audioPath ??
            getOrderAudioPath({
              difficulty: order.difficulty,
              orderNo: order.orderNo,
            }),
          required_total_cook_time_seconds: requiredCookTime,
          is_active: true,
        },
        { onConflict: "order_no" },
      )
      .select("id, order_no")
      .single();

    const template = assertNoError(
      templateResult,
      `upsert order ${order.orderNo}`,
    );

    const deleteItemsResult = await supabase
      .from(TABLES.orderTemplateItems)
      .delete()
      .eq("order_template_id", template?.id);

    assertNoError(
      deleteItemsResult,
      `delete old items for order ${order.orderNo}`,
    );

    const itemRows = order.items.map((item) => ({
      order_template_id: template?.id,
      zone: item.zone,
      food_item_id: item.foodItemId,
      colour: item.colour,
      parent_item: item.parentItem ?? null,
      sequence: item.sequence ?? null,
    }));

    const insertItemsResult = await supabase
      .from(TABLES.orderTemplateItems)
      .insert(itemRows)
      .select("id");

    assertNoError(insertItemsResult, `insert items for order ${order.orderNo}`);
  }

  console.log(`✅ Seeded ${orders.length} order templates`);
}

async function createBaseGame() {
  console.log("Creating base game, rounds, groups, and customers...");

  const gameResult = await supabase
    .from(TABLES.games)
    .insert({
      name: "煮过头！2026",
      status: "setup",
    })
    .select("id")
    .single();

  const game = assertNoError(gameResult, "create game");

  const roundsResult = await supabase
    .from(TABLES.rounds)
    .insert([
      {
        game_id: game?.id,
        name: "煮过头！(上) Round 1",
        mode: "easy",
        status: "ready",
        strategy_seconds: 5 * 60,
        duration_seconds: 20 * 60,
        rush_hour_duration_seconds: 5 * 60,
      },
      {
        game_id: game?.id,
        name: "煮过头！(上) Round 2",
        mode: "easy",
        status: "locked",
        strategy_seconds: 5 * 60,
        duration_seconds: 20 * 60,
        rush_hour_duration_seconds: 5 * 60,
      },
      {
        game_id: game?.id,
        name: "煮过头！(下) Finale",
        mode: "hard",
        status: "locked",
        strategy_seconds: 10 * 60,
        duration_seconds: 35 * 60,
        rush_hour_duration_seconds: 5 * 60,
      },
    ])
    .select("id, name, status");

  const rounds = assertNoError(roundsResult, "create rounds");

  const firstRound = rounds?.find((round) => round.status === "ready");
  if (firstRound) {
    const setCurrentRoundResult = await supabase
      .from(TABLES.games)
      .update({ current_round_id: firstRound.id })
      .eq("id", game?.id);

    assertNoError(setCurrentRoundResult, "set current round");
  }

  const groupsResult = await supabase
    .from(TABLES.groups)
    .insert(
      Array.from({ length: 6 }, (_, index) => ({
        game_id: game?.id,
        name: `Group ${index + 1}`,
        display_order: index + 1,
        score: 0,
        red_tokens: 0,
      })),
    )
    .select("id, name");

  assertNoError(groupsResult, "create groups");

  const customersResult = await supabase
    .from(TABLES.customers)
    .insert(
      Array.from({ length: 6 }, (_, index) => ({
        game_id: game?.id,
        name: `Customer ${index + 1}`,
        customer_slot: index + 1,
        physical_position: null,
      })),
    )
    .select("id, name");

  assertNoError(customersResult, "create customers");

  console.log(`✅ Created game: ${game?.id}`);
  console.log("✅ Created 3 rounds, 6 groups, and 6 customers");

  return game?.id;
}

async function main() {
  console.log("\n🍳 Seeding Overcooked 26 data...\n");

  await seedFoodItems();
  await seedOrderTemplates([...EASY_ORDERS, ...HARD_ORDERS]);
  const gameId = await createBaseGame();

  console.log("\n🎉 Seed completed successfully");
  console.log(`Game ID: ${gameId}`);
  console.log("\nNext: build the order assignment API/screen.");
}

main().catch((error) => {
  console.error("\n❌ Seed crashed");
  console.error(error);
  process.exit(1);
});
