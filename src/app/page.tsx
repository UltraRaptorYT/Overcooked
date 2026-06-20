import Link from "next/link";
import {
  ChefHat,
  ClipboardList,
  CookingPot,
  Monitor,
  ShoppingBag,
  Users,
  type LucideIcon,
} from "lucide-react";

type AppLink = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  color: string;
  background: string;
  border: string;
};

const APP_LINKS: AppLink[] = [
  {
    title: "Order",
    description: "Choose a group and place the next food order.",
    href: "/order",
    icon: ClipboardList,
    color: "text-orange-700",
    background: "bg-orange-100",
    border: "group-hover:border-orange-300",
  },
  {
    title: "Customer",
    description: "Open a customer station to receive and judge orders.",
    href: "/customer",
    icon: Users,
    color: "text-emerald-700",
    background: "bg-emerald-100",
    border: "group-hover:border-emerald-300",
  },
  {
    title: "Cooking",
    description: "Start the kitchen timer and manage active dishes.",
    href: "/cooking",
    icon: CookingPot,
    color: "text-sky-700",
    background: "bg-sky-100",
    border: "group-hover:border-sky-300",
  },
  {
    title: "Display",
    description: "Show the live game status on the main screen.",
    href: "/display",
    icon: Monitor,
    color: "text-violet-700",
    background: "bg-violet-100",
    border: "group-hover:border-violet-300",
  },
];

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-stone-50 px-6 py-12 sm:py-20">
      <div
        aria-hidden="true"
        className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-orange-200/50 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-amber-100/70 blur-3xl"
      />

      <div className="relative mx-auto max-w-5xl">
        <header className="mx-auto max-w-2xl text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-lg shadow-orange-600/20">
            <ChefHat className="h-9 w-9" aria-hidden="true" />
          </div>
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.25em] text-orange-700">
            Kitchen control
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-stone-950 sm:text-5xl">
            Overcooked
          </h1>
          <p className="mt-4 text-base leading-7 text-stone-600 sm:text-lg">
            Choose the station you want to open.
          </p>
        </header>

        <section
          aria-label="Overcooked stations"
          className="mt-12 grid gap-5 sm:grid-cols-2"
        >
          {APP_LINKS.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex min-h-48 flex-col rounded-3xl border border-stone-200 bg-white p-7 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-stone-900/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200 ${item.border}`}
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl ${item.background} ${item.color}`}
                >
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </div>

                <div className="mt-7 flex items-end justify-between gap-6">
                  <div>
                    <h2 className="text-2xl font-semibold text-stone-950">
                      {item.title}
                    </h2>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-stone-600">
                      {item.description}
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className={`mb-1 shrink-0 text-2xl transition-transform duration-200 group-hover:translate-x-1 ${item.color}`}
                  >
                    →
                  </span>
                </div>
              </Link>
            );
          })}
        </section>

        <footer className="mt-10 flex items-center justify-center gap-2 text-sm text-stone-500">
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          <span>Select a station to get started</span>
        </footer>
      </div>
    </main>
  );
}
