import { Suspense } from "react";
import ServeClient from "@/app/serve/ServeClient";

export default function ServePage() {
  return (
    <Suspense fallback={<div>Loading data...</div>}>
      <ServeClient />
    </Suspense>
  );
}
