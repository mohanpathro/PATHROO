"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Search, MapPin, GraduationCap, LayoutGrid, Star, SlidersHorizontal, LogOut } from "lucide-react"; /* eslint-disable-line @typescript-eslint/no-unused-vars */
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import type { Category, Gender, SocialCategory } from "@/lib/types";
import { BRANCHES, YEARS, SOCIAL_CATEGORIES, INDIAN_STATES, STATE_LABELS, INTEREST_OPTIONS, SKILLS } from "@/lib/taxonomy";
import { clusterFor, KNOWN_CITIES } from "@/lib/geo";
import { CATEGORY_ICON, CATEGORY_COLOR } from "../feed/category-icon";
import { Button } from "../ui/button";
import { Chip, Toggle } from "../ui/primitives";
import { useProfile } from "@/store/profile";
import { cn } from "@/lib/utils";
import { ResumeProfileTune } from "./resume-profile-tune";

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="panel p-4 sm:p-5">
      <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink">
        <span className="text-signal-500">{icon}</span>
        {title}
      </p>
      {children}
    </div>
  );
}

export function ProfileClient() {
  const router = useRouter(); /* eslint-disable-line @typescript-eslint/no-unused-vars */
  const profile = useProfile((s) => s.profile);
  const setProfile = useProfile((s) => s.setProfile);
  const [skillQuery, setSkillQuery] = useState("");
  const [user, setUser] = useState<any> /* eslint-disable-line @typescript-eslint/no-explicit-any */(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(setUser);
    return () => unsubscribe();
  }, []);

  const toggleInterest = (c: Category) => {
    const interests = profile.interests || [];
    setProfile({ interests: interests.includes(c) ? interests.filter((x) => x !== c) : [...interests, c] });
  };
  const toggleSkill = (slug: string) => {
    const skills = profile.skills || [];
    setProfile({ skills: skills.includes(slug) ? skills.filter((x) => x !== slug) : [...skills, slug] });
  };

  const skillGroups = useMemo(() => {
    const filtered = SKILLS.filter((s) => (skillQuery ? s.label.toLowerCase().includes(skillQuery.toLowerCase()) : true));
    const map = new Map<string, typeof SKILLS>();
    for (const s of filtered) {
      if (!map.has(s.group)) map.set(s.group, []);
      map.get(s.group)!.push(s);
    }
    return [...map.entries()];
  }, [skillQuery]);

  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (user && !profile.name) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsEditing(true);
    }
  }, [user, profile.name]);

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-8 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {isEditing ? "Edit profile" : "Your profile"}
          </h1>
          {user && (
            <p className="mt-1 text-[13px] text-ink-3">
              Signed in as <span className="font-medium text-ink">{user.email}</span>
            </p>
          )}
          {isEditing && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-2">
              <Check size={14} className="text-success" /> Changes save instantly and re-tune your feed.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <Button size="sm" onClick={() => setIsEditing(false)}>
              Done editing
            </Button>
          ) : (
            <Button size="sm" onClick={() => setIsEditing(true)}>
              Edit Profile
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => signOut(auth)}>
            <LogOut size={14} /> Sign out
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <ResumeProfileTune />
      </div>

      {isEditing ? (
        <>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {/* Identity */}
            <Section title="Identity" icon={<GraduationCap size={15} />}>
              <div className="space-y-4">
                <Field label="Name">
                  <input
                    value={profile.name ?? ""}
                    onChange={(e) => setProfile({ name: e.target.value })}
                    placeholder="Your name"
                    className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-ink-3"
                  />
                </Field>
                <Field label="Degree">
                  <input
                    value={profile.degree ?? ""}
                    onChange={(e) => setProfile({ degree: e.target.value })}
                    placeholder="e.g. B.Tech"
                    className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-ink-3"
                  />
                </Field>
                <Field label="College">
                  <input
                    value={profile.college ?? ""}
                    onChange={(e) => setProfile({ college: e.target.value })}
                    placeholder="e.g. IIT Bombay"
                    className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-ink-3"
                  />
                </Field>
                <Field label="Branch / stream">
                  <div className="flex flex-wrap gap-1.5">
                    {BRANCHES.map((b) => (
                      <Chip key={b.slug} active={profile.branch === b.slug} onClick={() => setProfile({ branch: b.slug })}>
                        {b.label}
                      </Chip>
                    ))}
                  </div>
                </Field>
                <Field label="Year">
                  <div className="flex flex-wrap gap-1.5">
                    {YEARS.map((y) => (
                      <Chip key={y.value} active={profile.year === y.value} onClick={() => setProfile({ year: y.value })}>
                        {y.label}
                      </Chip>
                    ))}
                  </div>
                </Field>
              </div>
            </Section>

            {/* Eligibility */}
            <Section title="Eligibility details" icon={<SlidersHorizontal size={15} />}>
              <div className="space-y-4">
                <Field label="CGPA (optional)">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={profile.cgpa ?? ""}
                    onChange={(e) => setProfile({ cgpa: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="e.g. 8.2"
                    className="h-10 w-28 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-ink-3"
                  />
                </Field>
                <Field label="Category (for scholarships)">
                  <div className="flex flex-wrap gap-1.5">
                    {SOCIAL_CATEGORIES.map((c) => (
                      <Chip
                        key={c.value}
                        active={profile.socialCategory === c.value}
                        onClick={() => setProfile({ socialCategory: profile.socialCategory === c.value ? undefined : (c.value as SocialCategory) })}
                      >
                        {c.label}
                      </Chip>
                    ))}
                  </div>
                </Field>
                <Field label="Gender (for gender-specific awards)">
                  <div className="flex flex-wrap gap-1.5">
                    {(["female", "male", "other", "prefer-not"] as Gender[]).map((g) => (
                      <Chip key={g} active={profile.gender === g} onClick={() => setProfile({ gender: profile.gender === g ? undefined : g })}>
                        {g === "prefer-not" ? "Prefer not to say" : g[0].toUpperCase() + g.slice(1)}
                      </Chip>
                    ))}
                  </div>
                </Field>
                <Field label="Home state">
                  <select
                    value={profile.state ?? ""}
                    onChange={(e) => setProfile({ state: e.target.value || undefined })}
                    className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-ink-3"
                  >
                    <option value="">Select state…</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>
                        {STATE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </Section>

            {/* Location prefs */}
            <Section title="Location preferences" icon={<MapPin size={15} />}>
              <div className="space-y-4">
                <Field label="Home city">
                  <input
                    value={profile.location ?? ""}
                    onChange={(e) => setProfile({ location: e.target.value })}
                    placeholder="e.g. Noida"
                    list="known-cities"
                    autoComplete="off"
                    className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-ink-3"
                  />
                  <datalist id="known-cities">
                    {KNOWN_CITIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <RegionHint location={profile.location} state={profile.state} />
                </Field>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-ink-2">Open to relocating</span>
                  <Toggle checked={!!profile.willingToRelocate} onChange={(v) => setProfile({ willingToRelocate: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-ink-2">Remote-only (hide on-site roles)</span>
                  <Toggle checked={!!profile.remoteOnly} onChange={(v) => setProfile({ remoteOnly: v })} />
                </div>
              </div>
            </Section>

            {/* Interests */}
            <Section title="Feed categories" icon={<LayoutGrid size={15} />}>
              <div className="grid grid-cols-2 gap-2">
                {INTEREST_OPTIONS.map((opt) => {
                  const Icon = CATEGORY_ICON[opt.value];
                  const active = (profile.interests || []).includes(opt.value);
                  const color = CATEGORY_COLOR[opt.value];
                  return (
                    <button
                      key={opt.value}
                      onClick={() => toggleInterest(opt.value)}
                      className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-medium transition-colors", active ? "border-transparent text-ink" : "border-line text-ink-2 hover:border-ink-3")}
                      style={active ? { background: `color-mix(in oklab, ${color} 12%, transparent)`, boxShadow: `inset 0 0 0 1px ${color}66` } : undefined}
                    >
                      <Icon size={16} style={{ color: active ? color : undefined }} />
                      {opt.label}
                      {active && <Check size={14} className="ml-auto text-signal-500" />}
                    </button>
                  );
                })}
              </div>
            </Section>
          </div>

          <div className="mt-4">
            <Section title={`Skills & interests${(profile.skills || []).length ? ` · ${(profile.skills || []).length} selected` : ""}`} icon={<Star size={15} />}>
              <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
                <input
                  value={skillQuery}
                  onChange={(e) => setSkillQuery(e.target.value)}
                  placeholder="Search skills…"
                  className="h-10 w-full rounded-full border border-line bg-surface pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-ink-3"
                />
              </div>
              <div className="max-h-[40vh] space-y-4 overflow-y-auto pr-1">
                {skillGroups.map(([group, items]) => (
                  <div key={group}>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{group}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((s) => (
                        <Chip key={s.slug} active={(profile.skills || []).includes(s.slug)} onClick={() => toggleSkill(s.slug)}>
                          {(profile.skills || []).includes(s.slug) && <Check size={12} />}
                          {s.label}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </>
      ) : (
        <div className="mt-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 rounded-3xl bg-surface border border-line p-8">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-signal-50 text-3xl font-bold text-signal-600">
              {profile.name ? profile.name.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || "A"}
            </div>
            <div className="text-center sm:text-left">
              <h2 className="text-2xl font-bold text-ink">{profile.name || "Anonymous User"}</h2>
              <p className="mt-1 text-base text-ink-2">
                {profile.degree && profile.branch ? `${profile.degree} in ${BRANCHES.find(b => b.slug === profile.branch)?.label || profile.branch}` : (profile.degree || profile.branch || "No degree specified")}
              </p>
              <p className="mt-1 text-sm font-medium text-ink-3">
                {profile.college || "No college specified"}
                {profile.year ? ` • ${YEARS.find(y => y.value === profile.year)?.label || profile.year}` : ""}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Section title="About You" icon={<GraduationCap size={15} />}>
              <dl className="grid grid-cols-2 gap-y-4 gap-x-4 text-sm">
                <div>
                  <dt className="text-ink-3 mb-1">Location</dt>
                  <dd className="font-medium text-ink">{profile.location || "Not specified"}</dd>
                </div>
                <div>
                  <dt className="text-ink-3 mb-1">State</dt>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <dd className="font-medium text-ink">{profile.state ? STATE_LABELS[profile.state as any] : "Not specified"}</dd>
                </div>
                <div>
                  <dt className="text-ink-3 mb-1">CGPA</dt>
                  <dd className="font-medium text-ink">{profile.cgpa || "Not specified"}</dd>
                </div>
                <div>
                  <dt className="text-ink-3 mb-1">Gender</dt>
                  <dd className="font-medium text-ink capitalize">{profile.gender || "Not specified"}</dd>
                </div>
                <div>
                  <dt className="text-ink-3 mb-1">Social Category</dt>
                  <dd className="font-medium text-ink">{profile.socialCategory ? SOCIAL_CATEGORIES.find(c => c.value === profile.socialCategory)?.label : "General"}</dd>
                </div>
              </dl>
            </Section>

            <Section title="Preferences" icon={<MapPin size={15} />}>
              <dl className="space-y-4 text-sm">
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <span className="text-ink-3">Open to relocating</span>
                  <span className="font-medium text-ink">{profile.willingToRelocate ? "Yes" : "No"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-3">Remote-only roles</span>
                  <span className="font-medium text-ink">{profile.remoteOnly ? "Yes" : "No"}</span>
                </div>
              </dl>
            </Section>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Section title="Interested in" icon={<LayoutGrid size={15} />}>
              <div className="flex flex-wrap gap-2">
                {(profile.interests || []).length > 0 ? (profile.interests || []).map(i => {
                  const opt = INTEREST_OPTIONS.find(o => o.value === i);
                  if (!opt) return null;
                  const Icon = CATEGORY_ICON[opt.value];
                  const color = CATEGORY_COLOR[opt.value];
                  return (
                    <span key={i} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border" style={{ borderColor: `${color}40`, backgroundColor: `${color}10`, color: color }}>
                      <Icon size={14} />
                      {opt.label}
                    </span>
                  )
                }) : <span className="text-ink-3 text-sm">No interests selected</span>}
              </div>
            </Section>

            <Section title="Skills" icon={<Star size={15} />}>
              <div className="flex flex-wrap gap-2">
                {(profile.skills || []).length > 0 ? (profile.skills || []).map(s => {
                  const skill = SKILLS.find(x => x.slug === s);
                  return (
                    <span key={s} className="inline-flex items-center rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-ink border border-line">
                      {skill?.label || s}
                    </span>
                  )
                }) : <span className="text-ink-3 text-sm">No skills selected</span>}
              </div>
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Confirms the commuter region we resolved the student's city to, and names the
 * neighbouring cities they will now see. Without this, a Delhi student getting
 * Noida results has no way to tell that it is intentional.
 */
function RegionHint({ location, state }: { location?: string; state?: string }) {
  const region = clusterFor(location, state);
  if (!location?.trim()) return null;
  if (!region) {
    return (
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
        We don&apos;t recognise this city yet, so nearby matching is off. Try the nearest large city.
      </p>
    );
  }
  const others = region.cities.filter((c) => c.toLowerCase() !== location.trim().toLowerCase());
  return (
    <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
      <span className="font-medium text-ink-2">{region.label}</span>
      {others.length > 0 && (
        <> — you&apos;ll also see events in {others.slice(0, 6).join(", ")}
        {others.length > 6 ? ` +${others.length - 6} more` : ""}.</>
      )}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-ink-3">{label}</label>
      {children}
    </div>
  );
}
