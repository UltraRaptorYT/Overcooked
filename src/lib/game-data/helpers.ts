import { FOOD_ITEMS } from "./food-items";
import type { OrderTemplate } from "./types";

export function getFoodItem(foodItemId: string) {
  const item = FOOD_ITEMS.find((food) => food.id === foodItemId);

  if (!item) {
    throw new Error(`Food item not found: ${foodItemId}`);
  }

  return item;
}

export function calculateOrderCookTimeSeconds(order: OrderTemplate) {
  return order.items.reduce((total, item) => {
    const food = getFoodItem(item.foodItemId);
    return total + food.cookTimeSeconds;
  }, 0);
}

export function getOrdersForCustomer(
  orders: OrderTemplate[],
  customerSlot: 1 | 2 | 3 | 4 | 5 | 6,
) {
  return orders.filter((order) => order.customerSlot === customerSlot);
}

export function validateOrderDistribution(orders: OrderTemplate[]) {
  const counts = [1, 2, 3, 4, 5, 6].map((slot) => ({
    customerSlot: slot,
    count: orders.filter((order) => order.customerSlot === slot).length,
  }));

  const orderNumbers = orders.map((order) => order.orderNo);
  const duplicatedOrderNumbers = orderNumbers.filter(
    (orderNo, index) => orderNumbers.indexOf(orderNo) !== index,
  );

  return {
    totalOrders: orders.length,
    counts,
    duplicatedOrderNumbers,
  };
}
