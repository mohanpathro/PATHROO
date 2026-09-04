# Argus

> **Argus** is a student opportunity platform. It pulls internships, scholarships, competitions, hackathons and events from **live sources** into one place, ranks them for your profile with an AI-powered insight layer, and **reminds you before every deadline.**

Most students juggle a dozen siloed platforms and still miss things — and the costliest failure mode isn't a weak profile, it's a **deadline that slipped by**. Argus is a neutral *aggregation + reminder layer* across every category: it surfaces what's relevant to you and pings you in time. We always deep-link out to the original site to apply — we're never the application endpoint.

---
Live Link : https://opportunity-radar-theta.vercel.app/feed
## What it does

| Pillar | How |
| --- | --- |
| **Cross-category feed** | Internships · scholarships · competitions · hackathons · events, normalised into one `Opportunity` schema. No incumbent does this — each is siloed to one vertical. |
| **Live aggregation** | 15 source adapters fetched server-side, cached, deduped. Verified live: **213+ opportunities** across all categories on first scan. |
| **Eligibility-aware filtering** | Branch, year, CGPA, state, category, gender → opportunities you *can't* apply to are hidden. Missing fields default to *eligible* so noisy data never wrongly hides a match. |
| **Transparent ranking** | A deterministic weighted score (no ML training, no pay-to-rank) with a free **"why this matched you"** explanation on every card. |
| **AI insight layer** | Dual-LLM backend (Groq → Gemini fallback) powers AI summaries, match explanations, smart tags, deadline intelligence, resume analysis, side-by-side comparisons, weekly digests and natural-language search. |
| **Deadline nudges** | Reminders at **T-14d / T-7d / T-3d / T-1d / T-3h** via in-app center, **real browser push (web-push/VAPID)**, **email (via Resend)** and one-tap **Add-to-Calendar (.ics + Google)**. |
| **Persistent profiles & auth** | Firebase Auth (Google sign-in) with Firestore-backed profiles, saved collections, and notification preferences that sync across devices. |
| **Distinctive design** | A clean, light "signal" system — an authored cyan-teal palette, Bricolage Grotesque display type, category tiles, deadline-warmed countdowns, per-card match glyphs, a command palette (⌘K) and a floating tab bar. WCAG-minded, mobile-first. |

---

## Quick start

To run Argus locally, you will need a `.env.local` file with your API keys.

1. Create a `.env.local` file in the root directory:
```env
# ── Firebase (required) ──────────────────────────────────────────────────────
NEXT_PUBLIC_FIREBASE_API_KEY="your_firebase_api_key"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your_firebase_auth_domain"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your_firebase_project_id"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your_firebase_storage_bucket"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your_messaging_sender_id"
NEXT_PUBLIC_FIREBASE_APP_ID="your_app_id"

# ── AI providers (at least one recommended) ──────────────────────────────────
GROQ_API_KEY="your_groq_api_key"              # Primary — free at console.groq.com
GEMINI_API_KEY="your_gemini_api_key"           # Fallback — free at aistudio.google.com/apikey

# ── Email notifications ─────────────────────────────────────────────────────
RESEND_API_KEY="your_resend_api_key"           # Free at resend.com

# ── Push notifications (optional, auto-generated if absent) ──────────────────
VAPID_PUBLIC_KEY="your_vapid_public_key"
VAPID_PRIVATE_KEY="your_vapid_private_key"

# ── reCAPTCHA (optional) ─────────────────────────────────────────────────────
NEXT_PUBLIC_RECAPTCHA_SITE_KEY="your_recaptcha_site_key"

# ── Optional API-gated sources ───────────────────────────────────────────────
ADZUNA_APP_ID="your_adzuna_app_id"             # Free at developer.adzuna.com
ADZUNA_APP_KEY="your_adzuna_app_key"
KAGGLE_USERNAME="your_kaggle_username"         # From kaggle.com → Account → API Token
KAGGLE_KEY="your_kaggle_key"
```

2. Install dependencies and start the server:
```bash
npm install
npm run dev
# open http://localhost:3000
```

On first load, the feed performs a live scan across all sources (with skeleton loaders); subsequent loads are extremely fast due to local `.cache/` data. VAPID keys are auto-generated on first push-subscribe if env vars aren't set.

---

## Live data sources

All fetched **server-side** (no per-request scraping in the browser), cached for 30 min, deduped, with per-source health surfaced in the UI. We prefer official APIs/JSON, scrape only public pages politely, and always link back.

| # | Source | Tier | Category | Access |
| --- | --- | --- | --- | --- |
| 1 | **Devpost** | green | Hackathons | Public JSON `devpost.com/api/hackathons` |
| 2 | **Devfolio** | green | Hackathons | Public JSON `api.devfolio.co` (India-heavy) |
| 3 | **Unstop** | amber | All categories | Public JSON (browser UA) — best single India source |
| 4 | **ETHGlobal** | green | Hackathons | HTML scraper via `cheerio` on `ethglobal.com/events` |
| 5 | **MLH** | amber | Hackathons | Embedded JSON extracted from `mlh.com/seasons/2026/events` |
| 6 | **Codeforces** | green | Competitions | Official API `codeforces.com/api` |
| 7 | **CodeChef** | green | Competitions | Public JSON contests API |
| 8 | **Kaggle** ¹ | green | Competitions | Official API `kaggle.com/api/v1` (HTTP Basic auth) |
| 9 | **Greenhouse ATS** | green | Internships | Official board JSON for ~20 India-hiring companies |
| 10 | **Arbeitnow** | green | Internships | Public job-board API (remote/early-career breadth) |
| 11 | **Adzuna** ¹ | green | Internships | `api.adzuna.com` India jobs endpoint |
| 12 | **Luma** | amber | Events | Public JSON `api.luma.com` — meetups, workshops, talks across 5 Indian cities |
| 13 | **HackerEarth** | green | Hackathons + Competitions | Public events JSON `/chrome-extension/events/` — zero-auth, all-online challenges |
| 14 | **Scholarships** | seed | Scholarships | Curated dataset of ~29 real Indian awards (govt + private + study-abroad) |
| 15 | **Seed** | seed | Mixed | ~20 curated India-relevant fallbacks so the feed is never empty offline |

> ¹ **Env-gated** — these sources only join the registry when their API keys are set in `.env.local`. Add the keys, restart, done.

> **Avoided on purpose:** LinkedIn / Indeed / Internshala scraping (ToS / legal risk) and DoraHacks (strict anti-bot WAFs/hidden search APIs). **HackCulture** has no usable public surface — its listing page is client-rendered, its sitemap lists no individual events, its detail pages server-render only an `og:title` (no dates, location or prize), and the `/api/v1/hackathons/` endpoint that holds the real data is both credential-gated and explicitly `Disallow`ed in their `robots.txt`. We deep-link out instead. See `src/lib/sources/*` — each adapter implements the same `SourceAdapter` contract and one failure never sinks the run (`Promise.allSettled`).

---

## How ranking works (`src/lib/rank.ts`)

A transparent two-stage recommender that runs as a pure function in milliseconds:

1. **Hard eligibility filter** — drop closed deadlines and anything the student is provably ineligible for. *Only* high-confidence fields filter; missing = eligible.
2. **Weighted soft score** (semantic embeddings off by default):

   ```
   skill 0.40 · interest 0.25 · urgency 0.15 · recency 0.10 · popularity 0.05 · location 0.05
   ```

   Location rises to **0.15** (and the rest renormalise) as soon as the student's home city resolves — at 0.05 even a perfect local match moved the final score by less than 0.03.

   - **skill** — overlap of your skills with the opportunity's tags over a shared ~150-term controlled vocabulary (with a synonym map: `ml → machine-learning`, `js → javascript`, …). Branch affinity seeds matches for cold-start profiles.
   - **urgency** — peaks ~8 days out (the sweet spot to act), penalises <2 days and far-off items.
   - **recency** — `exp(-ageDays/14)`. **popularity** — `log1p` of applicants.
   - **location** — see locality below.
   - **Cold-start**: signals a new profile can't produce are dropped and the weights renormalise.
   - **Explainability is free** — the top contributing signals are templated into chips like *"Matches 2 of your skills: Machine Learning, Python · Closes in 5 days"*. Open any card → **"How this was scored"** shows the full weighted breakdown.

Default feed sort is **Closing soonest** (the deadline value prop); also Best match and Newest.

### Locality (`src/lib/geo.ts`)

Source locations are free text — `Bengaluru, India`, `Bangalore`, `Bengaluru-VTP`, `New Delhi, Delhi, India`, `Hybrid; In-Office`, `Remote - USA`. Substring-matching a student's city against that treats a Noida hackathon exactly like a Munich one, which is wrong for anyone in a commuter region.

Both sides are resolved onto shared **metro clusters** — the region people actually treat as one place — and the relationship is graded:

```
remote 1.00 · city 1.00 · metro 0.92 · state 0.70 · country 0.35 · far 0.12 · unknown 0.60
```

`unknown` deliberately sits **above** `country`: an unparseable location must never rank below one we know to be far away, matching the eligibility rule that missing data means open. Region-locked remote (`Remote - USA`) scores 0.45 — surfaced, never hidden, but not equal to a globally open online event.

So a student in **Delhi** sees Noida, Gurugram, Ghaziabad, Faridabad and Greater Noida as local, with a *"Near you in Noida"* chip explaining why. The **Near me** feed filter keeps city / metro / state plus online items and lists physically local events first. The profile names the detected region back to you (*"Delhi NCR — you'll also see events in Noida, Gurugram…"*) so nearby results read as intentional.

Clusters cover ~50 Indian metros with renames (`Bangalore→Bengaluru`, `Gurgaon→Gurugram`), tech-park sub-localities (Whitefield, Gachibowli, Hinjewadi) and the multi-city / prose shapes the corpus actually contains.

---

## AI features (`src/lib/ai/`)

A dual-LLM backend with automatic failover keeps AI features virtually immune to rate limits:

| Chain | Model | Role |
| --- | --- | --- |
| **Primary** | Groq `llama-3.3-70b-versatile` | Fastest inference; 100k TPD free tier |
| **Fallback 1** | Groq `llama-3.1-8b-instant` | Auto-switches on 429; 500k TPD free tier |
| **Fallback 2** | Google `gemini-2.5-flash` | Independent quota; used only when all Groq attempts exhaust |

All AI responses are **file-cached for 7 days** (`.cache/ai/`) with content-hash invalidation — if an opportunity changes, the cache busts automatically.

### Feature catalogue

| Feature | Endpoint | What it does |
| --- | --- | --- |
| **AI Summary** | `/api/ai/summary` | Structured breakdown: what, who should apply, eligibility, skills, benefits, difficulty |
| **Why This Matches You** | `/api/ai/match` | Personalised 2-3 sentence match explanation referencing your actual skills |
| **Smart Tags** | `/api/ai/tags` | Auto-classifies from a 24-tag vocabulary (Beginner Friendly, Remote, Paid, etc.) |
| **Natural-language Search** | `/api/ai/search` | Query expansion: "remote AI internships" → 12-15 search terms with synonyms |
| **Deadline Intelligence** | `/api/ai/deadline-insight` | Action-oriented insight: preparation time, early-close risk, what to do now |
| **Resume Analysis** | `/api/ai/resume` | Upload PDF → skill extraction, gap analysis, match score against an opportunity |
| **Side-by-side Compare** | `/api/ai/compare` | Multi-opportunity comparison table with a best-pick recommendation |
| **Weekly Digest** | `/api/ai/digest` | Personalised weekly roundup with urgent-deadline callouts |

---

## Deadline nudges (`src/lib/nudges.ts`, `/api/test-nudge`)

- Deadline-**relative** schedule (not a fixed weekly blast): **T-14d** (high-effort scholarships/competitions/hackathons), **T-7d, T-3d, T-1d, T-3h**.
- **Relevance-gated** — only high-relevance matches (score > 0.5 or top-N) with a real deadline.
- **Multi-channel**: in-app center + **real Web Push** (VAPID) + **Email Notifications** (via Resend) + one-tap **.ics / Google Calendar**.
- **Anti-fatigue**: per-channel toggles, quiet hours (default 8am–9pm IST), frequency cap, snooze, weekly digest.

---

## Architecture

```
Browser (Next.js 16 App Router, React 19, Tailwind v4, React Compiler)
  ├── Auth ─── Firebase Auth (Google sign-in)
  ├── Profile / Saved / Prefs ─── Firebase Firestore
  ├── Command Palette (⌘K) ─── client-side fuzzy search
  └── reads /api/feed, /api/nudges, /api/score, /api/ai/*
        │
   Route Handlers ── getCorpus() ── 30-min cache (.cache/corpus.json + memory)
        │                               │
        │                        AI cache (.cache/ai/ — 7-day TTL, hash-gated)
        │
        └─ aggregate() ── Promise.allSettled over 14 SourceAdapters
                              normalize → dedupe → corpus
```

### Key layers

| Layer | Technology | Notes |
| --- | --- | --- |
| **Frontend** | Next.js 16 (App Router, RSC), React 19, Tailwind v4, Framer Motion | React Compiler enabled; Bricolage Grotesque + Geist + Noto Devanagari |
| **State** | Zustand | Client stores for profile, prefs, collections, nudges, command palette, theme, toasts |
| **Auth** | Firebase Auth | Google sign-in with auth-guard wrapper |
| **Database** | Firebase Firestore | Persistent user profiles, saved collections, notification preferences |
| **AI** | Groq SDK + Google GenAI SDK | Dual-provider cascade with file-based response cache |
| **Data pipeline** | File-cache + `SourceAdapter` contract | Production-shaped — swap the cache for Postgres/Prisma and run the aggregator on a cron without touching the UI |
| **Push** | `web-push` (VAPID) + Service Worker | Zero-config local demo: VAPID keys auto-generated, subscriptions persisted to `.cache/` |
| **Email** | Resend SDK | Integrated via Next.js serverless API routes |

### Pages & routes

| Route | Description |
| --- | --- |
| `/` | Redirects to `/feed` |
| `/feed` | Full live catalogue — browse, filter, sort, detail drawer |
| `/for-you` | Personalised, ranked feed with match glyphs |
| `/c` | Discover — category tiles grid |
| `/saved` | Bookmarked / collected opportunities |
| `/notifications` | In-app nudge timeline |
| `/profile` | Profile editor, resume upload, preference toggles |
| `/onboarding` | First-run guided profile setup |

---

## Project structure

```
src/
├── app/                     # Next.js App Router pages & API routes
│   ├── api/
│   │   ├── ai/              # 8 AI feature endpoints (summary, match, tags, …)
│   │   ├── feed/            # Corpus retrieval (triggers refresh if stale)
│   │   ├── ics/             # .ics calendar export
│   │   ├── ingest/          # Manual corpus refresh trigger
│   │   ├── nudges/          # Nudge timeline builder
│   │   ├── opportunities/   # Single-opportunity lookup
│   │   ├── push/            # Web Push subscription management
│   │   ├── score/           # On-demand scoring for a profile × opportunity
│   │   └── test-nudge/      # Dev helper: fire a test push notification
│   ├── feed/                # Feed page
│   ├── for-you/             # Personalised recommendations page
│   ├── c/                   # Discover / category browsing
│   ├── saved/               # Saved opportunities page
│   ├── notifications/       # Notification center page
│   ├── profile/             # Profile editor page
│   └── onboarding/          # First-run onboarding flow
├── components/
│   ├── ai/                  # AI feature UIs (summary, match, tags, compare, resume, digest)
│   ├── brand/               # Logo mark, ping bar
│   ├── command/             # Command palette (⌘K)
│   ├── discover/            # Category tiles, discover client
│   ├── feed/                # Opportunity cards, detail drawer, filter bar, countdown
│   ├── for-you/             # For-You personalised client
│   ├── layout/              # App shell (floating tab bar)
│   ├── notifications/       # Notification center client
│   ├── onboarding/          # Multi-step onboarding flow
│   ├── profile/             # Profile editor, auth guard, resume upload
│   ├── saved/               # Saved / collections client
│   └── ui/                  # Shared primitives (button, modal, toaster, reveal, animated number)
├── lib/
│   ├── ai/                  # AI orchestration (groq.ts, gemini.ts, prompts.ts, cache.ts)
│   ├── aggregator/          # Concurrent adapter runner (Promise.allSettled)
│   ├── sources/             # 14 source adapters + shared fetch/build utilities
│   ├── corpus.ts            # Corpus entry-point for route handlers
│   ├── dedupe.ts            # Two-pass deduplication (id + title+org key)
│   ├── eligibility.ts       # Hard eligibility filter
│   ├── feed.ts              # Feed composition (filter, sort, paginate)
│   ├── firebase.ts          # Firebase client init (Auth, Firestore, Storage)
│   ├── format.ts            # Date/deadline formatting
│   ├── ics.ts               # iCalendar (.ics) generation
│   ├── normalize.ts         # Tag normalisation via controlled vocabulary
│   ├── nudges.ts            # Deadline-relative nudge scheduler
│   ├── parse.ts             # Date/money parsing helpers
│   ├── push.ts              # VAPID Web Push server (broadcast, subscribe, prune)
│   ├── push-client.ts       # Client-side push subscription helper
│   ├── rank.ts              # Weighted scoring engine
│   ├── store.ts             # Server-side corpus cache (memory + disk)
│   ├── taxonomy.ts          # Controlled vocabulary: branches, skills, synonyms
│   ├── types.ts             # Canonical domain types (Opportunity, Profile, Nudge, AI types)
│   └── utils.ts             # Tiny helpers (clamp, slugify, stableHash, uniq)
├── store/                   # Zustand client stores (profile, prefs, collections, nudges, …)
└── types/                   # Ambient type declarations (pdf-parse)
```

---

## Scripts

```bash
npm run dev      # dev server (Turbopack)
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint
```

---

## Compliance

Argus is a discovery & notification layer. We aggregate public APIs, RSS and curated datasets; honour `robots.txt`, source ToS and removal requests; store facts not verbatim republication; and **always deep-link out to the original source to apply.**

---

*Built with a live 14-source aggregation pipeline, a dual-LLM AI insight layer, a transparent ranking engine, and a multi-channel deadline-reminder system.*
