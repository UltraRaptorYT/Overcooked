export type Zone = "A" | "B" | "C" | "D";
export type Difficulty = "easy" | "hard";

export const FOOD_COLOURS = [
  "light green",
  "purple",
  "orange",
  "pink",
  "white",
  "red",
  "yellow",
  "blue",
  "dark green",
  "black",
  "brown",
  "light blue",
  "beige",
] as const;

export type FoodColour = (typeof FOOD_COLOURS)[number];

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
  colour: FoodColour;
  sequence?: number;
  parentItem?: string;
};

export type OrderTemplate = {
  orderNo: string;
  difficulty: Difficulty;
  customerSlot: 1 | 2 | 3 | 4 | 5 | 6;
  items: OrderItem[];
  spokenText: string;
  audioPath?: string;
};

export const ZONES: Zone[] = ["A", "B", "C", "D"];

export const PLACEHOLDER_COLOURS = FOOD_COLOURS;
