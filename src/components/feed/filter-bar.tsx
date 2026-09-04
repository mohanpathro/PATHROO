"use client";

import { useState } from "react";
import { Search, RefreshCw, X, SlidersHorizontal, ChevronDown } from "lucide-react";
import type { Category } from "@/lib/types";
import type { DeadlineWindow, Facets, FilterState, LocationFilter, SortKey } from "@/lib/feed";
import { CATEGORIES } from "@/lib/types";
import { Chip, Segmented } from "../ui/primitives";
import { CATEGORY_COLOR, CATEGORY_ICON, CATEGORY_LABEL } from "./category-icon";
import { SKILL_LABELS } from "@/lib/taxonomy";
import { clusterFor } from "@/lib/geo";
import { useProfile } from "@/store/profile";
import { cn } from "@/lib/utils";

const DEADLINE_OPTS: { value: DeadlineWindow; label: string }[] = [
  { value: "all", label: "Any time" },
  { value: "24h", label: "24 hrs" },
  { value: "3d", label: "≤ 3 days" },
  { value: "7d", label: "This week" },
  { value: "30d", label: "≤ 30 days" },
];

const LOCATION_OPTS: { value: LocationFilter; label: string }[] = [
  { value: "all", label: "Anywhere" },
  { value: "nearby", label: "Near me" },
  { value: "remote", label: "Remote" },
  { value: "onsite", label: "On-site" },
];

const DEADLINE_LABEL: Record<DeadlineWindow, string> = {
  all: "Any time",
  "24h": "24 hrs",
  "3d": "≤ 3 days",
  "7d": "This week",
  "30d": "≤ 30 days",
};

export function FilterBar({
  filter,
  setFilter,
  sort,
  setSort,
  facets,
  onRescan,
  rescanning,
  lockedCategory,
}: {
  filter: FilterState;
  setFilter: (f: FilterState) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  facets: Facets | null;
  onRescan: () => void;
  rescanning: boolean;
  updatedAt?: string;
  lockedCategory?: Category;
}) {
  const [open, setOpen] = useState(false);
  const profile = useProfile((s) => s.profile);

  // Name the student's actual commuter region so "Near me" is self-explanatory:
  // a Delhi student sees "Delhi NCR", which is what makes Noida/Gurugram
  // results make sense rather than looking like a bug.
  const region = clusterFor(profile.location, profile.state);
  const hasHome = Boolean(profile.location?.trim() || profile.state);
  const nearLabel = region ? `Near me · ${region.label}` : "Near me";

  const activeCat = filter.categories?.[0];
  const tags = filter.tags ?? [];
  const dl = filter.deadlineWindow ?? "all";
  const loc = filter.location ?? "all";

  const activeCount = tags.length + (dl !== "all" ? 1 : 0) + (loc !== "all" ? 1 : 0);

  const selectCat = (c?: Category) => setFilter({ ...filter, categories: c ? [c] : [], tags: [] });
  const toggleTag = (t: string) =>
    setFilter({ ...filter, tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t] });
  const clearAll = () => setFilter({ ...filter, tags: [], deadlineWindow: "all", location: "all" });

  return (
    <div className="space-y-2.5">
      {/* always-visible: search + Filters toggle + rescan */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            value={filter.query ?? ""}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
            placeholder="Search roles, skills, organisations…"
            className="h-10 w-full rounded-full border border-line bg-surface pl-9 pr-9 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-signal-500"
          />
          {filter.query && (
            <button
              onClick={() => setFilter({ ...filter, query: "" })}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
            open || activeCount > 0
              ? "border-signal-500/50 bg-signal-500/10 text-signal-600"
              : "border-line bg-surface text-ink-2 hover:border-ink-3 hover:text-ink",
          )}
        >
          <SlidersHorizontal size={15} />
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 && (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-signal-500 px-1 text-[10px] font-bold text-[#042522]">
              {activeCount}
            </span>
          )}
          <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
        </button>

        <button
          onClick={onRescan}
          disabled={rescanning}
          title="Re-scan all live sources"
          aria-label="Rescan sources"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-2 hover:border-ink-3 hover:text-ink disabled:opacity-50"
        >
          <RefreshCw size={15} className={cn(rescanning && "animate-spin")} />
        </button>
      </div>

      {/* sort + (collapsed) active-filter summary */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<SortKey>
          value={sort}
          onChange={setSort}
          options={[
            { value: "closing", label: "Closing" },
            { value: "match", label: "Best match" },
            { value: "newest", label: "Newest" },
          ]}
        />
        {!open && activeCount > 0 && (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tags.map((t) => (
              <Chip key={t} active onClick={() => toggleTag(t)} className="shrink-0">
                {SKILL_LABELS[t] ?? t}
                <X size={12} />
              </Chip>
            ))}
            {dl !== "all" && (
              <Chip active onClick={() => setFilter({ ...filter, deadlineWindow: "all" })} className="shrink-0">
                {DEADLINE_LABEL[dl]}
                <X size={12} />
              </Chip>
            )}
            {loc !== "all" && (
              <Chip active onClick={() => setFilter({ ...filter, location: "all" })} className="shrink-0">
                {loc === "nearby" ? nearLabel : loc === "remote" ? "Remote" : "On-site"}
                <X size={12} />
              </Chip>
            )}
            <button onClick={clearAll} className="shrink-0 px-1 text-[12px] text-ink-3 hover:text-ink">
              Clear
            </button>
          </div>
        )}
      </div>

      {/* collapsible filter panel */}
      {open && (
        <div className="space-y-3 rounded-2xl border border-line bg-base/40 p-3.5">
          {!lockedCategory && (
            <FilterGroup label="Category">
              <Chip active={!activeCat} onClick={() => selectCat(undefined)}>
                All{facets && <span className="text-[11px] tabular-nums opacity-70">{facets.total}</span>}
              </Chip>
              {CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICON[c];
                return (
                  <Chip key={c} active={activeCat === c} onClick={() => selectCat(activeCat === c ? undefined : c)} color={CATEGORY_COLOR[c]} count={facets?.category[c]}>
                    <Icon size={13} />
                    {CATEGORY_LABEL[c]}s
                  </Chip>
                );
              })}
            </FilterGroup>
          )}

          {facets && facets.topTags.length > 0 && (
            <FilterGroup label={lockedCategory ? `${CATEGORY_LABEL[lockedCategory]} skills & themes` : "Skills & themes"}>
              {facets.topTags.map(({ tag, count }) => (
                <Chip key={tag} active={tags.includes(tag)} onClick={() => toggleTag(tag)} count={count}>
                  {SKILL_LABELS[tag] ?? tag}
                </Chip>
              ))}
            </FilterGroup>
          )}

          <FilterGroup label="Deadline">
            {DEADLINE_OPTS.map((o) => (
              <Chip key={o.value} active={dl === o.value} onClick={() => setFilter({ ...filter, deadlineWindow: o.value })}>
                {o.label}
              </Chip>
            ))}
          </FilterGroup>

          <FilterGroup label="Location">
            {LOCATION_OPTS.filter((o) => o.value !== "nearby" || hasHome).map((o) => (
              <Chip
                key={o.value}
                active={loc === o.value}
                onClick={() => setFilter({ ...filter, location: o.value })}
                count={o.value === "nearby" ? facets?.nearby : o.value === "remote" ? facets?.remote : undefined}
              >
                {o.value === "nearby" ? nearLabel : o.label}
              </Chip>
            ))}
          </FilterGroup>
          {loc === "nearby" && region && (
            <p className="-mt-1 text-[11px] leading-relaxed text-ink-3">
              Showing {region.label} — {region.cities.slice(0, 5).join(", ")}
              {region.cities.length > 5 ? " and nearby" : ""} — plus anything online.
            </p>
          )}
          {!hasHome && (
            <p className="-mt-1 text-[11px] leading-relaxed text-ink-3">
              Add your home city in your profile to filter by what&apos;s happening near you.
            </p>
          )}

          {activeCount > 0 && (
            <button onClick={clearAll} className="flex items-center gap-1 pt-1 text-[12px] font-medium text-ink-3 hover:text-ink">
              <X size={13} /> Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
