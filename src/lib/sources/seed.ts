import type { Opportunity, SourceAdapter, Eligibility } from "../types";
import { buildOpportunity, snippet } from "./_shared";
import { buildTags } from "../normalize";

// ─────────────────────────────────────────────────────────────────────────────
// CURATED offline fallback. tier: 'seed'.
//
// This adapter performs ZERO network calls so the feed is NEVER empty — even
// with no internet, or when every live source is down/rate-limited. Every row
// is a hand-curated, REAL, India-relevant program or employer, grounded against
// official careers/program pages (verified 2026-06-22 via web search).
//
// `sourceUrl` always deep-links to the ORIGIN (official careers / program page) —
// we are never the apply endpoint. Stipends are realistic INR/month ranges for
// the named employer; competition/hackathon prizes are documented pools.
//
// Deadlines are spread 2026-06-26 → 2026-10-15 with mixed urgency (a few close
// within a week of "today" = 2026-06-22) so the urgency/nudge engine has signal
// to work with. They are representative rolling/illustrative dates for a fallback
// feed, NOT scraped live close-dates.
// ─────────────────────────────────────────────────────────────────────────────

interface SeedRow {
  category: Opportunity["category"];
  title: string;
  organization: string;
  summary: string;
  sourceUrl: string;
  location?: string;
  isRemote?: boolean;
  /** Explicit theme/skill hints fed to buildTags alongside the title. */
  themes?: string[];
  // internship value
  stipendMin?: number;
  stipendMax?: number;
  // competition / hackathon value
  prizeAmount?: number;
  currency?: "INR" | "USD";
  deadline: string; // ISO
  postedAt: string; // ISO
  eligibility?: Eligibility;
  popularity?: number;
}

// Curated set. ~18 rows across all 4 categories (mostly internships +
// competitions/hackathons; scholarships are largely covered by other sources, a
// single representative one is included so the category is never empty offline).
const ROWS: SeedRow[] = [
  // ── INTERNSHIPS ────────────────────────────────────────────────────────────
  {
    category: "internship",
    title: "Software Development Engineer Intern",
    organization: "Razorpay",
    summary:
      "Backend/full-stack internship at India's leading payments fintech, building payment infrastructure used by millions of businesses.",
    sourceUrl: "https://razorpay.com/careers/",
    location: "Bangalore",
    themes: ["backend", "fullstack", "fintech", "api-development"],
    stipendMin: 50000,
    stipendMax: 80000,
    deadline: "2026-07-10T18:30:00.000Z",
    postedAt: "2026-06-12T06:00:00.000Z",
    eligibility: { branches: ["cse", "aiml"], years: [3, 4] },
    popularity: 4200,
  },
  {
    category: "internship",
    title: "Backend Engineering Intern",
    organization: "Zerodha",
    summary:
      "Work on the systems powering India's largest retail stock broker — high-scale, low-latency trading and investing platforms.",
    sourceUrl: "https://careers.zerodha.com/",
    location: "Bangalore",
    themes: ["backend", "fintech", "go", "database"],
    stipendMin: 40000,
    stipendMax: 60000,
    deadline: "2026-07-25T18:30:00.000Z",
    postedAt: "2026-06-08T06:00:00.000Z",
    eligibility: { branches: ["cse", "aiml"], years: [3, 4] },
    popularity: 3100,
  },
  {
    category: "internship",
    title: "Frontend Engineering Intern",
    organization: "Postman",
    summary:
      "Build polished web experiences for the API platform used by 30M+ developers worldwide, from Postman's Bangalore engineering hub.",
    sourceUrl: "https://www.postman.com/company/careers/",
    location: "Bangalore",
    themes: ["frontend", "react", "typescript", "web-development"],
    stipendMin: 45000,
    stipendMax: 70000,
    deadline: "2026-08-05T18:30:00.000Z",
    postedAt: "2026-06-05T06:00:00.000Z",
    eligibility: { branches: ["cse", "aiml"], years: [3, 4] },
    popularity: 2600,
  },
  {
    category: "internship",
    title: "Software Engineering Intern",
    organization: "CRED",
    summary:
      "Ship product features across mobile and backend at CRED, working on credit-card payments and rewards for India's premium members.",
    sourceUrl: "https://careers.cred.club/",
    location: "Bangalore",
    themes: ["backend", "mobile", "android", "fintech"],
    stipendMin: 50000,
    stipendMax: 75000,
    deadline: "2026-07-31T18:30:00.000Z",
    postedAt: "2026-06-10T06:00:00.000Z",
    eligibility: { branches: ["cse", "aiml"], years: [3, 4] },
    popularity: 2900,
  },
  {
    category: "internship",
    title: "Software Development Engineer - Intern",
    organization: "Meesho",
    summary:
      "Solve large-scale e-commerce problems in pricing, catalog and supply at Meesho, one of India's biggest social-commerce platforms.",
    sourceUrl: "https://www.meesho.io/jobs",
    location: "Bangalore",
    themes: ["backend", "java", "database", "machine-learning"],
    stipendMin: 50000,
    stipendMax: 80000,
    deadline: "2026-08-20T18:30:00.000Z",
    postedAt: "2026-06-09T06:00:00.000Z",
    eligibility: { branches: ["cse", "aiml"], years: [3, 4] },
    popularity: 3500,
  },
  {
    category: "internship",
    title: "Data Science Intern",
    organization: "Swiggy",
    summary:
      "Apply ML and analytics to delivery logistics, demand forecasting and personalization at India's leading food-delivery platform.",
    sourceUrl: "https://careers.swiggy.com/",
    location: "Bangalore",
    themes: ["data-science", "machine-learning", "python", "analytics"],
    stipendMin: 45000,
    stipendMax: 75000,
    deadline: "2026-08-15T18:30:00.000Z",
    postedAt: "2026-06-07T06:00:00.000Z",
    eligibility: { branches: ["cse", "aiml"], years: [3, 4] },
    popularity: 3300,
  },
  {
    category: "internship",
    title: "Frontend Intern",
    organization: "Sarvam AI",
    summary:
      "Build responsive interfaces for India-first generative-AI products at population scale with Sarvam AI's engineering team.",
    sourceUrl: "https://www.sarvam.ai/careers",
    location: "Bangalore",
    themes: ["frontend", "react", "generative-ai", "typescript"],
    stipendMin: 40000,
    stipendMax: 70000,
    deadline: "2026-06-27T18:30:00.000Z", // urgent: closes within ~5 days
    postedAt: "2026-06-04T06:00:00.000Z",
    eligibility: { branches: ["cse", "aiml"], years: [3, 4] },
    popularity: 1900,
  },
  {
    category: "internship",
    title: "Machine Learning Intern",
    organization: "Sarvam AI",
    summary:
      "Work on speech, translation and LLMs for Indian languages at Sarvam AI, contributing to sovereign AI infrastructure.",
    sourceUrl: "https://www.sarvam.ai/careers",
    location: "Bangalore",
    themes: ["machine-learning", "nlp", "deep-learning", "python", "generative-ai"],
    stipendMin: 50000,
    stipendMax: 80000,
    deadline: "2026-09-05T18:30:00.000Z",
    postedAt: "2026-06-06T06:00:00.000Z",
    eligibility: { branches: ["aiml", "cse"], years: [3, 4] },
    popularity: 2400,
  },
  {
    category: "internship",
    title: "Software Engineering Intern",
    organization: "Groww",
    summary:
      "Build investing and personal-finance products for millions of first-time investors at Groww, one of India's largest broking apps.",
    sourceUrl: "https://groww.in/careers",
    location: "Bangalore",
    themes: ["backend", "fintech", "java", "android"],
    stipendMin: 40000,
    stipendMax: 65000,
    deadline: "2026-08-28T18:30:00.000Z",
    postedAt: "2026-06-03T06:00:00.000Z",
    eligibility: { branches: ["cse", "aiml"], years: [3, 4] },
    popularity: 2700,
  },
  {
    category: "internship",
    title: "Software Development Engineer Intern (SDE)",
    organization: "Flipkart",
    summary:
      "Six-month SDE internship at Flipkart solving large-scale e-commerce, search and supply-chain problems; strong PPO conversion.",
    sourceUrl: "https://www.flipkartcareers.com/",
    location: "Bangalore",
    themes: ["backend", "java", "data-structures", "database"],
    stipendMin: 60000,
    stipendMax: 80000,
    deadline: "2026-09-20T18:30:00.000Z",
    postedAt: "2026-06-02T06:00:00.000Z",
    eligibility: { branches: ["cse", "aiml"], years: [3, 4] },
    popularity: 5100,
  },
  {
    category: "internship",
    title: "Product Design Intern",
    organization: "Razorpay",
    summary:
      "Design intuitive flows for payments and banking products at Razorpay, working end-to-end from research to high-fidelity Figma.",
    sourceUrl: "https://razorpay.com/careers/",
    location: "Bangalore",
    isRemote: false,
    themes: ["ui-ux", "figma", "product-management"],
    stipendMin: 30000,
    stipendMax: 50000,
    deadline: "2026-09-30T18:30:00.000Z",
    postedAt: "2026-06-11T06:00:00.000Z",
    eligibility: { branches: ["design"], years: [3, 4] },
    popularity: 1500,
  },
  {
    category: "internship",
    title: "Remote SDE Intern",
    organization: "Postman",
    summary:
      "Remote-friendly engineering internship contributing to Postman's developer tooling and API platform from anywhere in India.",
    sourceUrl: "https://www.postman.com/company/careers/",
    location: "Remote",
    isRemote: true,
    themes: ["backend", "api-development", "nodejs", "typescript"],
    stipendMin: 45000,
    stipendMax: 70000,
    deadline: "2026-10-10T18:30:00.000Z",
    postedAt: "2026-06-01T06:00:00.000Z",
    eligibility: { branches: ["cse", "aiml"], years: [3, 4] },
    popularity: 2200,
  },

  // ── PROGRAMS / FELLOWSHIPS (internship-shaped, stipended) ───────────────────
  {
    category: "internship",
    title: "Google Summer of Code 2026 Contributor",
    organization: "Google Open Source",
    summary:
      "Global program paying students a stipend to write code for open-source orgs over the summer; remote, mentored, beginner-friendly.",
    sourceUrl: "https://summerofcode.withgoogle.com/",
    location: "Remote",
    isRemote: true,
    themes: ["open-source", "programming", "python", "javascript"],
    stipendMin: 75000,
    stipendMax: 250000, // tiered USD stipend (~$750–$3000) shown as INR-equivalent band
    deadline: "2026-06-26T18:00:00.000Z", // urgent: contributor window closes end of June
    postedAt: "2026-06-01T06:00:00.000Z",
    // Open to any student 18+; no branch/year gate.
    popularity: 60000,
  },
  {
    category: "internship",
    title: "Amazon ML Summer School 2026",
    organization: "Amazon",
    summary:
      "Free selective summer school mentoring Indian engineering students in machine learning via lectures from Amazon scientists.",
    sourceUrl: "https://www.amazon.science/academic-engagements",
    location: "Remote",
    isRemote: true,
    themes: ["machine-learning", "deep-learning", "data-science", "python"],
    // No stipend (training program) — set realistic 0 band so the period stays valid.
    stipendMin: 0,
    stipendMax: 0,
    deadline: "2026-06-28T06:30:00.000Z", // urgent: registration ~mid/late June
    postedAt: "2026-06-01T06:00:00.000Z",
    eligibility: { branches: ["cse", "aiml"], years: [2, 3, 4] },
    popularity: 28000,
  },

  // ── SCHOLARSHIP (single representative row; category mostly covered elsewhere) ─
  {
    category: "scholarship",
    title: "Google Generation Scholarship (APAC)",
    organization: "Google",
    summary:
      "Award for students from underrepresented groups in computer science across APAC, including India, with mentorship and community.",
    sourceUrl: "https://buildyourfuture.withgoogle.com/scholarships",
    themes: ["programming", "open-source"],
    // awardAmount set in the builder below.
    deadline: "2026-09-15T18:30:00.000Z",
    postedAt: "2026-06-05T06:00:00.000Z",
    eligibility: { branches: ["cse", "aiml"], years: [2, 3, 4] },
    popularity: 5000,
  },

  // ── COMPETITIONS / HACKATHONS ───────────────────────────────────────────────
  {
    category: "hackathon",
    title: "Smart India Hackathon 2026",
    organization: "Ministry of Education (AICTE)",
    summary:
      "India's largest nationwide hackathon: teams of 6 (one female member) solve real government/industry problem statements.",
    sourceUrl: "https://sih.gov.in/",
    location: "Pan-India",
    themes: ["machine-learning", "web-development", "iot", "social-impact"],
    prizeAmount: 100000,
    currency: "INR",
    deadline: "2026-09-06T18:30:00.000Z",
    postedAt: "2026-06-02T06:00:00.000Z",
    // Open to all branches/years; just needs valid student team.
    popularity: 90000,
  },
  {
    category: "hackathon",
    title: "Flipkart GRiD 7.0 — Software Development Track",
    organization: "Flipkart",
    summary:
      "Flagship campus tech challenge with multiple rounds; top teams win prizes plus SDE internship and full-time interview shots.",
    sourceUrl: "https://unstop.com/competitions/flipkart-grid",
    location: "Pan-India",
    themes: ["data-structures", "backend", "competitive-programming", "machine-learning"],
    prizeAmount: 600000,
    currency: "INR",
    deadline: "2026-07-15T18:30:00.000Z",
    postedAt: "2026-06-04T06:00:00.000Z",
    eligibility: { branches: ["cse", "aiml"], years: [2, 3, 4] },
    popularity: 160000,
  },
  {
    category: "competition",
    title: "TCS CodeVita Season 13",
    organization: "Tata Consultancy Services",
    summary:
      "Global online programming contest (Guinness-record scale); top coders win cash prizes and shots at TCS roles and internships.",
    sourceUrl: "https://codevita.tcsapps.com/",
    location: "Online",
    isRemote: true,
    themes: ["competitive-programming", "c-cpp", "java", "python", "data-structures"],
    prizeAmount: 20000,
    currency: "USD",
    deadline: "2026-08-10T18:30:00.000Z",
    postedAt: "2026-06-03T06:00:00.000Z",
    // Any science/engineering stream; open eligibility.
    popularity: 146000,
  },
  {
    category: "hackathon",
    title: "Adobe India Hackathon 2026",
    organization: "Adobe",
    summary:
      "Multi-round campus hackathon; top participants get PPIs and a paid Adobe internship, with MacBooks/iPads for winning teams.",
    sourceUrl: "https://unstop.com/competitions/adobe-india-hackathon",
    location: "Pan-India",
    themes: ["web-development", "machine-learning", "generative-ai", "frontend"],
    prizeAmount: 100000,
    currency: "INR",
    deadline: "2026-07-05T18:30:00.000Z",
    postedAt: "2026-06-06T06:00:00.000Z",
    eligibility: { branches: ["cse", "aiml"], years: [2, 3, 4] },
    popularity: 35000,
  },
  {
    category: "hackathon",
    title: "Google Girl Hackathon 2026",
    organization: "Google",
    summary:
      "Coding hackathon for women students in CS and allied branches in India; cash prizes, Google merch and interview opportunities.",
    sourceUrl: "https://rsvp.withgoogle.com/events/girlhackathon-india",
    location: "Pan-India",
    themes: ["programming", "web-development", "data-structures"],
    prizeAmount: 100000,
    currency: "INR",
    deadline: "2026-10-15T18:30:00.000Z",
    postedAt: "2026-06-07T06:00:00.000Z",
    eligibility: { branches: ["cse", "aiml"], years: [1, 2, 3, 4], gender: "female", citizenship: "IN" },
    popularity: 40000,
  },
];

function toOpportunity(row: SeedRow): Opportunity {
  const tags = buildTags({
    explicit: row.themes,
    text: `${row.title} ${row.organization}`,
    limit: 8,
  });

  return buildOpportunity("seed", "Curated", {
    category: row.category,
    title: row.title,
    organization: row.organization,
    sourceUrl: row.sourceUrl,
    summary: snippet(row.summary),
    location: row.location,
    isRemote: row.isRemote,
    tags,
    deadline: row.deadline,
    postedAt: row.postedAt,
    // Value signals are category-specific per the contract:
    //  internship → stipendMin/stipendMax/stipendPeriod
    //  scholarship → awardAmount
    //  competition/hackathon → prizeAmount
    ...(row.category === "internship"
      ? {
          stipendMin: row.stipendMin,
          stipendMax: row.stipendMax,
          stipendPeriod: "month" as const,
        }
      : {}),
    ...(row.category === "scholarship" ? { awardAmount: 100000 } : {}),
    ...(row.category === "competition" || row.category === "hackathon"
      ? { prizeAmount: row.prizeAmount, currency: row.currency }
      : {}),
    eligibility: row.eligibility,
    popularity: row.popularity,
  });
}

export const seedAdapter: SourceAdapter = {
  meta: {
    id: "seed",
    label: "Curated",
    category: "mixed",
    homepage: "https://opportunity-radar-theta.vercel.app",
    tier: "seed",
  },
  // No network — always succeeds, guaranteeing the feed is never empty offline.
  async fetch(): Promise<Opportunity[]> {
    return ROWS.map(toOpportunity);
  },
};
