export type Zone = "A" | "B" | "C" | "D";
export type Difficulty = "easy" | "hard";

export type FoodItem = {
  id: string;
  name: string;
  requiresCooking: boolean;
  cookTimeSeconds: number;
  imageUrl?: string;
};

export type OrderItem = {
  zone: Zone;
  foodItemId: string;
  colour: string;
  sequence?: number;
  parentItem?: string;
};

export type OrderTemplate = {
  orderNo: string;
  difficulty: Difficulty;
  customerSlot: 1 | 2 | 3 | 4 | 5 | 6;
  items: OrderItem[];
  spokenText: string;
};

export const ZONES: Zone[] = ["A", "B", "C", "D"];

export const PLACEHOLDER_COLOURS = [
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "pink",
  "brown",
  "orange",
] as const;
