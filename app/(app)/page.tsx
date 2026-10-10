import { Suspense } from "react";
import { Home } from "@/components/home/home";
import { LiveRefresh } from "@/components/app/live-refresh";
import { Skeleton } from "@/components/ui/skeleton";
import { getHomeData } from "@/lib/queries";

// Re-render the server data whenever the agents act or money moves.
const LIVE_TABLES = ["audit_log", "approvals", "orders", "payments"];

export default function HomePage() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeLoader />
    </Suspense>
  );
}

async function HomeLoader() {
  const data = await getHomeData();
  return (
    <>
      <LiveRefresh tables={LIVE_TABLES} />
      <Home data={data} />
    </>
  );
}

// Same box the home draws into, so nothing jumps when the data lands.
function HomeFallback() {
  return (
    <div className="relative flex h-[calc(100dvh-var(--header-height,3.5rem)-2rem)] flex-col items-center overflow-hidden rounded-2xl border bg-gradient-to-b from-primary/[0.12] to-transparent to-45% px-4 pt-10 md:h-[calc(100dvh-var(--header-height,3.5rem)-3rem)] lg:h-[calc(100dvh-var(--header-height,3.5rem)-4rem)]">
      <Skeleton className="h-3 w-40 rounded-full" />
      <Skeleton className="mt-3 h-9 w-72 rounded-lg" />
      <Skeleton className="mt-8 h-11 w-96 max-w-full rounded-full" />
      <div className="mt-8 w-full max-w-xl space-y-2">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    </div>
  );
}
