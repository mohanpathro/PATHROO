"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Search, Star } from "lucide-react";
import type { Category, Profile, ScoredOpportunity } from "@/lib/types";
import { BRANCHES, YEARS, INTEREST_OPTIONS, SKILLS } from "@/lib/taxonomy";
import { CATEGORY_ICON, CATEGORY_COLOR } from "@/components/feed/category-icon";
import { OpportunityCard } from "@/components/feed/opportunity-card";
import { Wordmark } from "@/components/brand/mark";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/primitives";
import { useProfile } from "@/store/profile";
import { cn } from "@/lib/utils";

const STEPS = ["You", "Interests", "Skills", "Preview"];

export function OnboardingFlow() {
  const router = useRouter();
  const completeOnboarding = useProfile((s) => s.completeOnboarding);
  const existing = useProfile((s) => s.profile);

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Profile>({
    name: existing.name,
    branch: existing.branch,
    year: existing.year,
    interests: existing.interests?.length ? existing.interests : ["internship", "scholarship", "competition", "hackathon"],
    skills: existing.skills ?? [],
  });

  const set = (patch: Partial<Profile>) => setDraft((d) => ({ ...d, ...patch }));

  const canNext =
    step === 0 ? !!draft.branch && !!draft.year : step === 1 ? draft.interests.length > 0 : true;

  const finish = () => {
    completeOnboarding(draft);
    router.push("/feed");
  };

  return (
    <div className="relative min-h-dvh">
      {/* faint grid backdrop */}
      <div className="aim-grid pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-6">
        {/* header */}
        <div className="flex items-center justify-between">
          <Wordmark size={24} />
          <span className="font-mono text-[12px] text-ink-3">
            {step + 1} / {STEPS.length}
          </span>
        </div>

        {/* progress */}
        <div className="mt-5 flex gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-signal-500" : "bg-line-strong")} />
          ))}
        </div>

        <div className="flex flex-1 flex-col justify-center py-8">
          {step === 0 && <StepIdentity draft={draft} set={set} />}
          {step === 1 && <StepInterests draft={draft} set={set} />}
          {step === 2 && <StepSkills draft={draft} set={set} />}
          {step === 3 && <StepPreview draft={draft} onFinish={finish} />}
        </div>

        {/* nav */}
        {step < 3 && (
          <div className="flex items-center justify-between border-t border-line pt-4">
            <Button variant="ghost" size="md" onClick={() => setStep((s) => Math.max(0, s - 1))} className={cn(step === 0 && "invisible")}>
              <ArrowLeft size={16} /> Back
            </Button>
            <div className="flex items-center gap-2">
              {step === 2 && (
                <Button variant="ghost" onClick={() => setStep(3)}>
                  Skip
                </Button>
              )}
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                {step === 2 ? "Find my matches" : "Continue"} <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepIdentity({ draft, set }: { draft: Profile; set: (p: Partial<Profile>) => void }) {
  return (
    <div className="space-y-6 motion-safe:animate-rise">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Let’s set you up</h1>
        <p className="mt-2 text-sm text-ink-2">Three quick taps and we’ll surface real opportunities matched to you — no signup wall.</p>
      </div>

      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-ink-2">Your name (optional)</label>
        <input
          value={draft.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. Aarav"
          className="h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-ink-3"
        />
      </div>

      <div>
        <label className="mb-2 block text-[13px] font-medium text-ink-2">Your branch / stream</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {BRANCHES.map((b) => (
            <button
              key={b.slug}
              onClick={() => set({ branch: b.slug, skills: draft.skills })}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left text-[13px] font-medium transition-colors",
                draft.branch === b.slug
                  ? "border-signal-500/60 bg-signal-500/10 text-ink"
                  : "border-line text-ink-2 hover:border-ink-3 hover:text-ink",
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-[13px] font-medium text-ink-2">Year of study</label>
        <div className="flex flex-wrap gap-2">
          {YEARS.map((y) => (
            <button
              key={y.value}
              onClick={() => set({ year: y.value })}
              className={cn(
                "rounded-xl border px-4 py-2.5 text-[13px] font-medium transition-colors",
                draft.year === y.value ? "border-signal-500/60 bg-signal-500/10 text-ink" : "border-line text-ink-2 hover:border-ink-3 hover:text-ink",
              )}
            >
              {y.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepInterests({ draft, set }: { draft: Profile; set: (p: Partial<Profile>) => void }) {
  const toggle = (c: Category) =>
    set({ interests: draft.interests.includes(c) ? draft.interests.filter((x) => x !== c) : [...draft.interests, c] });
  return (
    <div className="space-y-6 motion-safe:animate-rise">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">What are you looking for?</h1>
        <p className="mt-2 text-sm text-ink-2">Pick everything you care about — we aggregate them into one feed.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {INTEREST_OPTIONS.map((opt) => {
          const Icon = CATEGORY_ICON[opt.value];
          const active = draft.interests.includes(opt.value);
          const color = CATEGORY_COLOR[opt.value];
          return (
            <button
              key={opt.value}
              onClick={() => toggle(opt.value)}
              className={cn(
                "relative flex items-start gap-3 rounded-2xl border p-4 text-left transition-all",
                active ? "border-transparent" : "border-line hover:border-ink-3",
              )}
              style={active ? { background: `color-mix(in oklab, ${color} 12%, transparent)`, boxShadow: `inset 0 0 0 1px ${color}66` } : undefined}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}>
                <Icon size={20} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
                  {opt.label}
                  {active && <Check size={15} className="text-signal-500" />}
                </span>
                <span className="mt-0.5 block text-[12px] text-ink-2">{opt.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepSkills({ draft, set }: { draft: Profile; set: (p: Partial<Profile>) => void }) {
  const [q, setQ] = useState("");
  const branch = BRANCHES.find((b) => b.slug === draft.branch);
  const suggested = branch?.affinity ?? [];

  const groups = useMemo(() => {
    const filtered = SKILLS.filter((s) => (q ? s.label.toLowerCase().includes(q.toLowerCase()) : true));
    const byGroup = new Map<string, typeof SKILLS>();
    for (const s of filtered) {
      if (!byGroup.has(s.group)) byGroup.set(s.group, []);
      byGroup.get(s.group)!.push(s);
    }
    return [...byGroup.entries()];
  }, [q]);

  const toggle = (slug: string) =>
    set({ skills: draft.skills.includes(slug) ? draft.skills.filter((x) => x !== slug) : [...draft.skills, slug] });

  return (
    <div className="space-y-5 motion-safe:animate-rise">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">What are you into?</h1>
        <p className="mt-2 text-sm text-ink-2">
          Optional, but it sharpens your match score. {draft.skills.length > 0 && <span className="text-signal-600">{draft.skills.length} selected</span>}
        </p>
      </div>

      {suggested.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
            <Star size={13} className="text-signal-500" /> Suggested for {branch?.label}
          </p>
          <div className="flex flex-wrap gap-2">
            {suggested.map((slug) => {
              const s = SKILLS.find((x) => x.slug === slug);
              if (!s) return null;
              return (
                <Chip key={slug} active={draft.skills.includes(slug)} onClick={() => toggle(slug)}>
                  {draft.skills.includes(slug) && <Check size={12} />}
                  {s.label}
                </Chip>
              );
            })}
          </div>
        </div>
      )}

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search skills & interests…"
          className="h-10 w-full rounded-full border border-line bg-surface pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-ink-3"
        />
      </div>

      <div className="max-h-[34vh] space-y-4 overflow-y-auto pr-1">
        {groups.map(([group, items]) => (
          <div key={group}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{group}</p>
            <div className="flex flex-wrap gap-1.5">
              {items.map((s) => (
                <Chip key={s.slug} active={draft.skills.includes(s.slug)} onClick={() => toggle(s.slug)}>
                  {draft.skills.includes(s.slug) && <Check size={12} />}
                  {s.label}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepPreview({ draft, onFinish }: { draft: Profile; onFinish: () => void }) {
  const [items, setItems] = useState<ScoredOpportunity[] | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const started = Date.now();
      try {
        const res = await fetch("/api/feed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: draft, sort: "match" }),
        });
        const json = await res.json();
        // hold the scan for a beat so the reveal feels earned
        const elapsed = Date.now() - started;
        setTimeout(() => {
          if (!cancelled) {
            setItems((json.items ?? []).slice(0, 4));
            setRevealed(true);
          }
        }, Math.max(0, 1600 - elapsed));
      } catch {
        if (!cancelled) {
          setItems([]);
          setRevealed(true);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [draft]);

  if (!revealed) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-14 text-center motion-safe:animate-rise">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-signal-500/12 text-signal-600">
          <Star size={26} className="motion-safe:animate-pulse-soft" />
        </span>
        <div>
          <p className="text-base font-semibold text-ink">Finding your matches…</p>
          <p className="mt-1 max-w-xs text-sm text-ink-2">Matching internships, scholarships, competitions & hackathons to your profile.</p>
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2 w-2 rounded-full bg-signal-500/40 motion-safe:animate-pulse-soft" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 motion-safe:animate-rise">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-signal-500/30 bg-signal-500/10 px-3 py-1 text-[12px] font-medium text-signal-600">
          <Star size={13} /> {items?.length ? `${items.length} strong matches found` : "All set"}
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">You’re all set</h1>
        <p className="mt-2 text-sm text-ink-2">Here’s a taste — real, deadline-aware, matched to you. Your full feed has more.</p>
      </div>

      {items && items.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {items.map((s, i) => (
            <OpportunityCard key={s.opportunity.id} scored={s} onOpen={() => {}} index={i} />
          ))}
        </div>
      )}

      <Button onClick={onFinish} size="lg" className="w-full">
        Enter PATHROO <ArrowRight size={18} />
      </Button>
    </div>
  );
}
