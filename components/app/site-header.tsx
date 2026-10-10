"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BellIcon,
  Building2,
  ChevronDown,
  HelpCircle,
  MoonIcon,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  SearchIcon,
  ShieldCheck,
  SunIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useSidebar } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/client";
import { NAV } from "@/components/app/nav";

const SUPPORT_EMAIL = "support@example.com";

type PendingApproval = { id: string; tool: string; reason: string };

/** Agent actions waiting for a human decision, kept live over Supabase realtime.
 *  Shared by the header bell and the sidebar's Approvals badge. */
export function usePendingApprovals() {
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [count, setCount] = useState(0);
  // supabase.channel() hands back an existing channel of the same name, and a
  // channel can only be subscribed once, so every subscriber gets its own topic.
  const topic = `approvals-${useId().replace(/\W/g, "")}`;

  useEffect(() => {
    const supabase = createClient();
    const load = async () => {
      const { data, count } = await supabase
        .from("approvals")
        .select("id,tool,reason", { count: "exact" })
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10);
      const rows = (data as PendingApproval[] | null) ?? [];
      setPending(rows);
      setCount(count ?? rows.length);
    };
    load();
    const ch = supabase
      .channel(topic)
      .on("postgres_changes", { event: "*", schema: "public", table: "approvals" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [topic]);

  return { pending, count };
}

// true only on the client; React keeps the server value through hydration, even for a
// boundary that hydrates late, so anything derived from browser state can't mismatch.
const useMounted = () => useSyncExternalStore(() => () => {}, () => true, () => false);

function ThemeSwitch() {
  const mounted = useMounted();
  const { resolvedTheme, setTheme } = useTheme();
  if (!mounted) return <div className="size-8" />;
  return (
    <Button size="icon" variant="ghost" onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}>
      {resolvedTheme === "light" ? <MoonIcon /> : <SunIcon />}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

// Bell shows how many agent actions are waiting for a human decision (live).
function ApprovalsBell() {
  const { pending, count } = usePendingApprovals();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="relative">
          <BellIcon />
          {count > 0 && (
            <span className="bg-destructive ring-background absolute top-1 right-1 block size-2 rounded-full ring-2" />
          )}
          <span className="sr-only">Approvals waiting ({count})</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-80">
        <DropdownMenuLabel>Waiting for your approval ({count})</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {pending.length === 0 && <p className="text-muted-foreground px-2 py-3 text-sm">Nothing waiting. The agent is within its limits.</p>}
        {pending.map((a) => (
          <DropdownMenuItem key={a.id} asChild>
            <Link href="/approvals" className="flex flex-col items-start gap-0.5">
              <span className="font-medium">{a.tool.replace(/_/g, " ")}</span>
              <span className="text-muted-foreground text-xs">{a.reason}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        {pending.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/approvals" className="justify-center font-medium">
                Review all
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Search pill: opens the nav-driven palette; Ctrl/Cmd+K does the same from anywhere.
function Search() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-muted/60 text-muted-foreground border-border/70 hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 hidden h-9 w-64 cursor-pointer items-center gap-2 rounded-full border pr-1.5 pl-3 text-sm transition-colors outline-none focus-visible:ring-3 md:flex lg:w-80"
      >
        <SearchIcon className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">Search or jump to…</span>
        <KbdGroup>
          <Kbd className="bg-background border-border/70 border">Ctrl</Kbd>
          <Kbd className="bg-background border-border/70 border">K</Kbd>
        </KbdGroup>
      </button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)}>
        <SearchIcon />
        <span className="sr-only">Search</span>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Go to…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {NAV.map((g) => (
            <CommandGroup key={g.label} heading={g.label}>
              {g.items.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`${item.title} ${item.hint}`}
                  onSelect={() => {
                    setOpen(false);
                    router.push(item.href);
                  }}
                >
                  <item.icon />
                  <span>{item.title}</span>
                  <span className="text-muted-foreground ml-auto text-xs">{item.hint}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}

function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? "??").slice(0, 2).toUpperCase();
}

// Who is signed in: initials, first name and role, with the account menu beneath.
function UserChip({ company }: { company: string }) {
  const firstName = company.trim().split(/\s+/)[0] || "Owner";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 gap-2 rounded-lg pr-2 pl-1.5">
          <Avatar className="size-8">
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">{initialsOf(company)}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 min-w-0 text-left leading-tight sm:grid">
            <span className="truncate text-sm font-semibold">{firstName}</span>
            <span className="text-muted-foreground truncate text-[11px] font-normal">Owner</span>
          </span>
          <ChevronDown className="text-muted-foreground hidden size-4 sm:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2.5 py-2">
          <Building2 className="text-muted-foreground size-4 shrink-0" />
          <span className="grid min-w-0 leading-tight">
            <span className="truncate font-medium">{company}</span>
            <span className="text-muted-foreground text-xs font-normal">Owner</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/approvals">
            <ShieldCheck /> Approvals
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/audit">
            <ScrollText /> Audit log
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={`mailto:${SUPPORT_EMAIL}`}>
            <HelpCircle /> Need help?
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SiteHeader({ company }: { company: string }) {
  const { toggleSidebar, open, openMobile, isMobile } = useSidebar();
  const mounted = useMounted();
  // Until mounted, mirror the server (desktop state): this header streams in behind the
  // company lookup, by which time isMobile may already have flipped on a phone.
  const sidebarShown = mounted && isMobile ? openMobile : open;

  return (
    <header className="bg-card/85 sticky top-0 z-40 flex h-(--header-height) shrink-0 items-center border-b backdrop-blur-md md:rounded-t-xl">
      <div className="flex w-full items-center gap-1 px-3 md:px-4 lg:gap-2">
        <Button onClick={toggleSidebar} size="icon" variant="ghost">
          {sidebarShown ? <PanelLeftClose /> : <PanelLeftOpen />}
          <span className="sr-only">Toggle sidebar</span>
        </Button>
        <Separator orientation="vertical" className="mx-1 hidden data-[orientation=vertical]:h-4 md:block" />
        <Search />

        <div className="ml-auto flex items-center gap-1 lg:gap-1.5">
          <Button asChild variant="outline" size="sm" className="rounded-full max-sm:size-8 max-sm:px-0">
            <a href={`mailto:${SUPPORT_EMAIL}`} aria-label="Need help?">
              <HelpCircle />
              <span className="hidden sm:inline">Need help?</span>
            </a>
          </Button>
          <ThemeSwitch />
          <ApprovalsBell />
          <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
          <UserChip company={company} />
        </div>
      </div>
    </header>
  );
}
