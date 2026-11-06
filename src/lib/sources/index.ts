import type { SourceAdapter } from "../types";
import { devpostAdapter } from "./devpost";
import { devfolioAdapter } from "./devfolio";
import { unstopAdapter } from "./unstop";
import { mlhAdapter } from "./mlh";
import { ethglobalAdapter } from "./ethglobal";
import { codeforcesAdapter } from "./codeforces";
import { codechefAdapter } from "./codechef";
import { greenhouseAdapter } from "./greenhouse";
import { arbeitnowAdapter } from "./arbeitnow";
import { adzunaAdapter } from "./adzuna";
import { kaggleAdapter } from "./kaggle";
import { lumaAdapter } from "./luma";
import { dorahacksAdapter } from "./dorahacks";
import { hackerearthAdapter } from "./hackerearth";

const adzunaConfigured = !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
const kaggleConfigured = !!(process.env.KAGGLE_USERNAME && process.env.KAGGLE_KEY);

/**
 * The live-source registry. The aggregator runs them all concurrently and
 * isolates failures. Key-gated sources (Adzuna, Kaggle) only join the registry
 * once their env vars are set in .env.local — add the keys, restart, done.
 * Adapters with illustrative, non-current dates (curated scholarships and seed
 * examples) are deliberately excluded from the live corpus.
 */
export const ADAPTERS: SourceAdapter[] = [
  devpostAdapter,
  devfolioAdapter,
  unstopAdapter,
  ethglobalAdapter,
  mlhAdapter,
  codeforcesAdapter,
  codechefAdapter,
  greenhouseAdapter,
  arbeitnowAdapter,
  ...(adzunaConfigured ? [adzunaAdapter] : []),
  ...(kaggleConfigured ? [kaggleAdapter] : []),
  lumaAdapter,
  dorahacksAdapter,
  hackerearthAdapter,
];

export const SOURCE_META = ADAPTERS.map((a) => a.meta);
