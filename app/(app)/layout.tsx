import { Suspense } from "react";
import { AppSidebar } from "@/components/app/app-sidebar";
import { SiteHeader } from "@/components/app/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { admin } from "@/lib/supabase-admin";

async function Header() {
  const { data } = await admin().from("companies").select("name").limit(1).maybeSingle();
  return <SiteHeader company={(data as { name?: string } | null)?.name ?? "Your business"} />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 64)",
            "--header-height": "calc(var(--spacing) * 14)",
            "--content-padding": "calc(var(--spacing) * 6)",
          } as React.CSSProperties
        }
      >
        {/* No Suspense here on purpose: the sidebar frame picks desktop vs. sheet from the
            provider's isMobile, so it must hydrate with the provider (a lazily hydrated
            boundary would see isMobile flip first and mismatch). The route-reading nav
            list carries its own Suspense inside. */}
        <AppSidebar />
        {/* min-w-0: a wide page (a table, say) scrolls inside the content area instead of pushing the header past the viewport. */}
        <SidebarInset className="min-w-0">
          <Suspense fallback={<div className="h-(--header-height) shrink-0 border-b md:rounded-t-xl" />}>
            <Header />
          </Suspense>
          <div className="@container/main flex min-w-0 flex-1 flex-col p-(--content-padding)">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
