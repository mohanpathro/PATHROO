"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Bookmark, User, Bell, Search, Star } from "lucide-react";
import { Wordmark } from "../brand/mark";
import { CommandPalette } from "../command/command-palette";
import { useProfile } from "@/store/profile";
import { useCollections } from "@/store/collections";
import { useNudges } from "@/store/nudges";
import { usePrefs } from "@/store/prefs";
import { useCommand } from "@/store/command";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/feed", label: "Home", icon: Home },
  { href: "/for-you", label: "For You", icon: Star },
  { href: "/saved", label: "Saved", icon: Bookmark },
  { href: "/profile", label: "Profile", icon: User },
];

function useDueCount() {
  const nudges = useNudges((s) => s.nudges);
  const readIds = usePrefs((s) => s.readIds);
  return nudges.filter((n) => n.due && !readIds.includes(n.id)).length;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const profile = useProfile((s) => s.profile);
  const hydrated = useProfile((s) => s.hydrated);
  const saved = useCollections((s) => s.saved);
  const collHydrated = useCollections((s) => s.hydrated);
  const loadNudges = useNudges((s) => s.load);
  const openCommand = useCommand((s) => s.setOpen);
  const due = useDueCount();

  const isActive = (href: string) =>
    pathname === href || (href === "/feed" && (pathname === "/" || pathname.startsWith("/c/")));

  useEffect(() => {
    if (hydrated && collHydrated) loadNudges(profile, saved);
  }, [hydrated, collHydrated, profile, saved, loadNudges]);

  const bell = (
    <Link
      href="/notifications"
      aria-label={`Deadline alerts${due > 0 ? ` (${due} new)` : ""}`}
      className={cn(
        "relative grid h-9 w-9 place-items-center rounded-full transition-colors",
        pathname === "/notifications" ? "bg-signal-500/10 text-signal-600" : "text-ink-2 hover:bg-elevated",
      )}
    >
      <Bell size={18} />
      {due > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white tabular-nums">
          {due}
        </span>
      )}
    </Link>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Top app bar */}
      <header className="glass sticky top-0 z-40 border-b border-line">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <Link href="/feed" aria-label="PATHROO home">
            <Wordmark size={24} />
          </Link>
          <span className="hidden text-[10px] font-medium tracking-wide text-ink-3 lg:inline">
            Find Your Path. Unlock Your Future.
          </span>

          {/* desktop search */}
          <button
            onClick={() => openCommand(true)}
            className="hidden h-9 max-w-sm flex-1 items-center gap-2 rounded-full border border-line bg-base px-4 text-[13px] text-ink-3 transition-colors hover:border-ink-3 md:flex"
          >
            <Search size={15} />
            <span>Search internships, scholarships, hackathons…</span>
            <kbd className="ml-auto rounded border border-line-strong px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
          </button>

          <div className="flex-1 md:hidden" />

          {/* desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors",
                    active ? "bg-signal-500/10 text-signal-600" : "text-ink-2 hover:bg-elevated hover:text-ink",
                  )}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* top-right: search (mobile) + alerts bell */}
          <div className="flex items-center gap-1 md:ml-1">
            <button onClick={() => openCommand(true)} aria-label="Search" className="grid h-9 w-9 place-items-center rounded-full text-ink-2 hover:bg-elevated md:hidden">
              <Search size={18} />
            </button>
            {bell}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 pb-24 md:pb-12">{children}</main>

      <footer className="mx-auto mb-20 flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line px-4 py-4 text-[10px] text-ink-3 md:mb-0 md:px-6">
        <span className="font-medium">Find Your Path. Unlock Your Future.</span>
        <span className="tracking-[0.16em]">DISCOVER · QUALIFY · PREPARE · ACHIEVE</span>
      </footer>

      {/* Floating pill tab bar (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.7rem,env(safe-area-inset-bottom))] md:hidden">
        <div className="flex w-full max-w-sm items-center justify-around rounded-[22px] border border-line bg-surface px-1.5 py-1.5 shadow-[0_10px_34px_-10px_rgba(8,30,33,0.3)]">
          {NAV.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-1 text-[10.5px] font-medium transition-colors",
                  active ? "text-signal-600" : "text-ink-3",
                )}
              >
                <span className={cn("grid h-8 w-8 place-items-center rounded-full transition-colors", active && "bg-signal-500/12")}>
                  <Icon size={19} strokeWidth={active ? 2.5 : 2} />
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <CommandPalette />
    </div>
  );
}
