import { EASY_ORDERS } from "./easy-orders";
import { HARD_ORDERS } from "./hard-orders";
import { FOOD_ITEMS } from "./food-items";
import type { OrderTemplate, Zone } from "./types";
import { calculateOrderCookTimeSeconds } from "./helpers";

const VALID_ZONES: Zone[] = ["A", "B", "C", "D"];
const CUSTOMER_SLOTS = [1, 2, 3, 4, 5, 6] as const;

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function validateOrderSet(name: string, orders: OrderTemplate[]) {
  console.log(`\nChecking ${name} orders...`);

  assert(orders.length === 36, `${name} should have exactly 36 orders`);

  for (const slot of CUSTOMER_SLOTS) {
    const count = orders.filter((order) => order.customerSlot === slot).length;
    assert(
      count === 6,
      `${name} customer slot ${slot} should have 6 orders, but has ${count}`,
    );
  }

  for (const order of orders) {
    assert(order.orderNo.trim().length > 0, `Order missing orderNo`);
    assert(
      order.spokenText.trim().length > 0,
      `Order ${order.orderNo} missing spokenText`,
    );
    assert(
      order.items.length >= 2,
      `Order ${order.orderNo} should have at least 2 items`,
    );

    for (const item of order.items) {
      assert(
        VALID_ZONES.includes(item.zone),
        `Order ${order.orderNo} has invalid zone: ${item.zone}`,
      );

      const foodExists = FOOD_ITEMS.some((food) => food.id === item.foodItemId);
      assert(
        foodExists,
        `Order ${order.orderNo} has invalid foodItemId: ${item.foodItemId}`,
      );

      assert(
        item.colour.trim().length > 0,
        `Order ${order.orderNo} has item with missing colour`,
      );
    }

    const cookTime = calculateOrderCookTimeSeconds(order);
    assert(
      Number.isFinite(cookTime),
      `Order ${order.orderNo} has invalid cook time`,
    );
  }

  console.log(`✅ ${name} orders valid`);
}

function validateNoDuplicateOrderNumbers() {
  const allOrders = [...EASY_ORDERS, ...HARD_ORDERS];
  const seen = new Set<string>();

  for (const order of allOrders) {
    assert(
      !seen.has(order.orderNo),
      `Duplicate order number found: ${order.orderNo}`,
    );

    seen.add(order.orderNo);
  }

  console.log("✅ No duplicate order numbers");
}

function main() {
  console.log("Validating game data...");

  assert(FOOD_ITEMS.length > 0, "FOOD_ITEMS should not be empty");

  validateOrderSet("Easy", EASY_ORDERS);
  validateOrderSet("Hard", HARD_ORDERS);
  validateNoDuplicateOrderNumbers();

  console.log("\n🎉 All game data checks passed");
}

main();
