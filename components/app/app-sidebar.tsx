"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { BrandName, Logo } from "@/components/app/logo";
import { NAV, type NavItem } from "@/components/app/nav";
import { usePendingApprovals } from "@/components/app/site-header";

// Nav row: 15px label, icon, solid ink pill when it's the current section
// (gold text) and a quieter cream wash on hover, so the two never read alike.
const NAV_BUTTON =
  "h-9 gap-2.5 rounded-lg px-2.5 text-[15px] font-medium text-sidebar-foreground/85 " +
  "hover:bg-sidebar-accent hover:text-sidebar-foreground active:bg-sidebar-accent active:text-sidebar-foreground " +
  "data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:font-semibold " +
  "data-active:hover:bg-sidebar-primary data-active:hover:text-sidebar-primary-foreground " +
  "data-active:active:bg-sidebar-primary data-active:active:text-sidebar-primary-foreground " +
  "group-data-[collapsible=icon]:rounded-md [&_svg]:size-4";

// Live count of agent actions waiting on a human, on the Approvals row.
function ApprovalsBadge() {
  const { count } = usePendingApprovals();
  if (count <= 0) return null;
  return (
    <span className="bg-primary text-primary-foreground ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-none font-semibold tabular-nums group-data-[collapsible=icon]:hidden">
      {count > 9 ? "9+" : count}
    </span>
  );
}

function NavRow({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: () => void }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.title} className={NAV_BUTTON}>
        <Link href={item.href} onClick={onNavigate}>
          <item.icon />
          <span>{item.title}</span>
          {item.href === "/approvals" && <ApprovalsBadge />}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NavGroups({ isActive, onNavigate }: { isActive: (href: string) => boolean; onNavigate: () => void }) {
  return NAV.map((g) => {
    // A group that is just its own name (Home) needs no eyebrow.
    const showLabel = !(g.items.length === 1 && g.items[0].title === g.label);
    return (
      <SidebarGroup key={g.label} className="px-3 py-1.5 group-data-[collapsible=icon]:px-2">
        {showLabel && (
          <SidebarGroupLabel className="text-sidebar-foreground/55 h-7 px-2.5 text-[10.5px] font-semibold tracking-[0.14em] uppercase">
            {g.label}
          </SidebarGroupLabel>
        )}
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5">
            {g.items.map((item) => (
              <NavRow key={item.href} item={item} active={isActive(item.href)} onNavigate={onNavigate} />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  });
}

// The only part of the sidebar that reads the route. It sits in its own Suspense
// so the static shell can prerender around it (the pathname is unknown under
// dynamic params), while the Sidebar frame hydrates with the provider.
function NavList({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return <NavGroups isActive={isActive} onNavigate={onNavigate} />;
}

// The AgntID card: every agent action passes a check before it runs.
function ProtectedCard() {
  return (
    <>
      <div className="bg-foreground text-background dark:border-sidebar-border dark:bg-muted dark:text-foreground rounded-xl p-4 shadow-sm group-data-[collapsible=icon]:hidden dark:border">
        <p className="text-primary flex items-center gap-1.5 text-[10px] leading-none font-semibold tracking-[0.14em] uppercase">
          <ShieldCheck className="size-3.5 -translate-y-px" />
          Protected by AgntID
        </p>
        <p className="mt-2 text-[15px] leading-snug font-semibold tracking-tight">Every action is checked</p>
        <p className="text-background/70 dark:text-muted-foreground mt-1 text-xs leading-relaxed">
          Allowed, held for your approval, or blocked — before it runs.
        </p>
        <Button asChild className="mt-3 w-full rounded-full">
          <Link href="/audit">
            View audit log
            <ArrowUpRight />
          </Link>
        </Button>
      </div>
      {/* Collapsed rail: the same promise as one icon. */}
      <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip="Protected by AgntID · View audit log" className="rounded-md">
            <Link href="/audit">
              <ShieldCheck className="text-brand-text" />
              <span>View audit log</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  );
}

export function AppSidebar() {
  const { isMobile, setOpenMobile } = useSidebar();
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="px-3 pt-3 pb-2 group-data-[collapsible=icon]:px-2">
        <Link
          href="/"
          onClick={closeOnMobile}
          className="focus-visible:ring-sidebar-ring flex h-9 items-center gap-2 rounded-lg outline-hidden focus-visible:ring-2 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:justify-center"
        >
          <Logo className="size-7" />
          <BrandName className="text-[17px] group-data-[collapsible=icon]:hidden" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <ScrollArea className="h-full">
          <Suspense fallback={<NavGroups isActive={() => false} onNavigate={closeOnMobile} />}>
            <NavList onNavigate={closeOnMobile} />
          </Suspense>
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter className="p-3 group-data-[collapsible=icon]:p-2">
        <ProtectedCard />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
