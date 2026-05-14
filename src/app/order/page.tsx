import { Suspense } from "react";
import OrderClient from "@/app/order/OrderClient";

export default function OrderPage() {
  return (
    <Suspense fallback={<div>Loading data...</div>}>
      <OrderClient />
    </Suspense>
  );
}
