export interface OrderItem {
  orderNumber: number;
  text: string;
}

export const ORDER_LIST: OrderItem[] = [
  {
    orderNumber: 1001,
    text: "I want a LIGHT GREEN WAFFLE at Zone A and 2 DARK BLUE FRIES at Zone B",
  },
  {
    orderNumber: 1002,
    text: "I want 2 LIGHT BLUE WAFFLES at Zone C and 3 DARK GREEN FRIES at Zone B",
  },
  {
    orderNumber: 1003,
    text: "I want 3 PINK PIZZA at Zone A and 5 PURPLE FISH BALLS at Zone C",
  },
  {
    orderNumber: 1004,
    text: "I want a LIGHT GREEN DUMPLING at Zone C and 2 DARK BLUE WAFFLES at Zone B",
  },
  {
    orderNumber: 1005,
    text: "I want a LIGHT GREEN PIZZA at Zone D and 2 DARK BLUE WAFFLES at Zone B",
  },
  {
    orderNumber: 1006,
    text: "I want a LIGHT GREEN LETTUCE at Zone A and 3 RED DUMPLINGS at Zone D",
  },
  // { orderNumber: 1005, text: "Order one zero zero five" },
  // { orderNumber: 1006, text: "Order one zero zero six" },
  // { orderNumber: 1007, text: "Order one zero zero seven" },
  // { orderNumber: 1008, text: "Order one zero zero eight" },
  // { orderNumber: 1009, text: "Order one zero zero nine" },
  // { orderNumber: 1010, text: "Order one zero one zero" },
  // { orderNumber: 1011, text: "Order one zero one one" },
  // { orderNumber: 1012, text: "Order one zero one two" },
  // { orderNumber: 1013, text: "Order one zero one three" },
  // { orderNumber: 1014, text: "Order one zero one four" },
  // { orderNumber: 1015, text: "Order one zero one five" },
  // { orderNumber: 1016, text: "Order one zero one six" },
  // { orderNumber: 1017, text: "Order one zero one seven" },
  // { orderNumber: 1018, text: "Order one zero one eight" },
  // { orderNumber: 1019, text: "Order one zero one nine" },
  // { orderNumber: 1020, text: "Order one zero two zero" },
  // { orderNumber: 1021, text: "Order one zero two one" },
  // { orderNumber: 1022, text: "Order one zero two two" },
  // { orderNumber: 1023, text: "Order one zero two three" },
  // { orderNumber: 1024, text: "Order one zero two four" },
  // { orderNumber: 1025, text: "Order one zero two five" },
  // { orderNumber: 1026, text: "Order one zero two six" },
  // { orderNumber: 1027, text: "Order one zero two seven" },
  // { orderNumber: 1028, text: "Order one zero two eight" },
  // { orderNumber: 1029, text: "Order one zero two nine" },
  // { orderNumber: 1030, text: "Order one zero three zero" },
  // { orderNumber: 1031, text: "Order one zero three one" },
  // { orderNumber: 1032, text: "Order one zero three two" },
  // { orderNumber: 1033, text: "Order one zero three three" },
  // { orderNumber: 1034, text: "Order one zero three four" },
  // { orderNumber: 1035, text: "Order one zero three five" },
  // { orderNumber: 1036, text: "Order one zero three six" },
  // { orderNumber: 1037, text: "Order one zero three seven" },
  // { orderNumber: 1038, text: "Order one zero three eight" },
  // { orderNumber: 1039, text: "Order one zero three nine" },
  // { orderNumber: 1040, text: "Order one zero four zero" },
  // { orderNumber: 1041, text: "Order one zero four one" },
  // { orderNumber: 1042, text: "Order one zero four two" },
  // { orderNumber: 1043, text: "Order one zero four three" },
  // { orderNumber: 1044, text: "Order one zero four four" },
  // { orderNumber: 1045, text: "Order one zero four five" },
  // { orderNumber: 1046, text: "Order one zero four six" },
  // { orderNumber: 1047, text: "Order one zero four seven" },
  // { orderNumber: 1048, text: "Order one zero four eight" },
  // { orderNumber: 1049, text: "Order one zero four nine" },
  // { orderNumber: 1050, text: "Order one zero five zero" },
];

/** Helper: get all order numbers as a flat array */
export const ALL_ORDER_NUMBERS = ORDER_LIST.map((o) => o.orderNumber);

/** Helper: lookup text by order number */
export const ORDER_TEXT_MAP = new Map(
  ORDER_LIST.map((o) => [o.orderNumber, o.text]),
);
