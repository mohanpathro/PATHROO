// ─────────────────────────────────────────────────────────────────────────────
// Geography resolution for locality-aware recommendations.
//
// Source `location` strings are free text and wildly inconsistent:
//   "Bengaluru, India" · "Bangalore" · "Bengaluru-VTP, India" · "Noida, India"
//   "New Delhi, Delhi, India" · "Online" · "Pan-India" · "Hybrid; In-Office"
//   "Bellevue, Washington; Mountain View, California"
//
// A student in Delhi should see Noida / Gurugram / Ghaziabad events as *local*,
// not as "somewhere else". Plain substring matching cannot express that, so we
// resolve both sides onto a shared vocabulary of METRO CLUSTERS — commuter
// regions people actually treat as one place — then grade the relationship.
//
// Design rule inherited from eligibility.ts: an UNRESOLVED location is neutral,
// never a penalty. Noisy scraped geography must not hide a valid opportunity.
// ─────────────────────────────────────────────────────────────────────────────

import { INDIAN_STATES, STATE_LABELS } from "./taxonomy";
import { slugify, uniq } from "./utils";

export interface MetroCluster {
  slug: string;
  /** Display name, e.g. "Delhi NCR". */
  label: string;
  /** Primary state slug (see taxonomy.INDIAN_STATES). */
  state: string;
  /** Extra states the cluster spans (NCR straddles Delhi/UP/Haryana). */
  alsoStates?: string[];
  /** Every settlement that belongs to this commuter region. */
  cities: string[];
  /** Alternative spellings, old names, and well-known sub-localities. */
  aliases?: string[];
}

/**
 * Indian metro clusters. `cities` are places a resident would consider "here";
 * `aliases` cover renames (Bangalore→Bengaluru) and tech-park sub-localities
 * that sources emit as if they were cities (Hinjewadi, Gachibowli, Whitefield).
 */
export const METRO_CLUSTERS: MetroCluster[] = [
  {
    slug: "delhi-ncr",
    label: "Delhi NCR",
    state: "delhi",
    alsoStates: ["uttar-pradesh", "haryana"],
    cities: [
      "Delhi", "New Delhi", "Noida", "Greater Noida", "Ghaziabad", "Gurugram",
      "Faridabad", "Sonipat", "Bahadurgarh", "Rohtak", "Panipat", "Meerut",
      "Baghpat", "Rewari", "Manesar", "Palwal", "Hapur", "Bulandshahr",
    ],
    aliases: [
      "ncr", "delhi ncr", "national capital region", "gurgaon", "gautam buddha nagar",
      "noida extension", "dwarka", "rohini", "saket", "connaught place", "nehru place",
      "okhla", "aerocity", "cyber city", "cyberhub", "udyog vihar", "sector 62",
      "greater noida west", "new delhi delhi", "delhi nct", "nct of delhi",
    ],
  },
  {
    slug: "mumbai-mmr",
    label: "Mumbai MMR",
    state: "maharashtra",
    cities: [
      "Mumbai", "Navi Mumbai", "Thane", "Kalyan", "Dombivli", "Vasai", "Virar",
      "Panvel", "Mira Bhayandar", "Ulhasnagar", "Bhiwandi", "Ambernath", "Badlapur",
    ],
    aliases: [
      "bombay", "mmr", "mumbai metropolitan region", "powai", "andheri", "bkc",
      "bandra kurla complex", "bandra", "goregaon", "lower parel", "worli", "vikhroli",
      "airoli", "vashi", "belapur", "turbhe", "malad", "borivali", "chembur", "nerul",
    ],
  },
  {
    slug: "bengaluru",
    label: "Bengaluru",
    state: "karnataka",
    cities: ["Bengaluru", "Ramanagara", "Hosur", "Devanahalli", "Nelamangala", "Anekal"],
    aliases: [
      "bangalore", "bengaluru urban", "bengaluru rural", "whitefield", "electronic city",
      "electronics city", "koramangala", "indiranagar", "hebbal", "yelahanka", "marathahalli",
      "hsr layout", "jp nagar", "jayanagar", "bellandur", "sarjapur", "mg road bangalore",
      "manyata tech park", "bagmane", "ecospace", "outer ring road", "bengaluru vtp", "btm layout",
    ],
  },
  {
    slug: "hyderabad",
    label: "Hyderabad",
    state: "telangana",
    cities: ["Hyderabad", "Secunderabad", "Medchal", "Sangareddy", "Shamshabad"],
    aliases: [
      "cyberabad", "gachibowli", "hitec city", "hi-tech city", "hitech city", "madhapur",
      "kondapur", "banjara hills", "jubilee hills", "kukatpally", "rangareddy", "ranga reddy",
      "financial district", "nanakramguda", "uppal", "begumpet",
    ],
  },
  {
    slug: "chennai",
    label: "Chennai",
    state: "tamil-nadu",
    cities: ["Chennai", "Tambaram", "Chengalpattu", "Sriperumbudur", "Kanchipuram", "Avadi"],
    aliases: [
      "madras", "omr", "old mahabalipuram road", "guindy", "sholinganallur", "perungudi",
      "taramani", "porur", "ambattur", "velachery", "adyar", "siruseri", "navalur", "mahabalipuram",
    ],
  },
  {
    slug: "pune",
    label: "Pune",
    state: "maharashtra",
    cities: ["Pune", "Pimpri Chinchwad", "Talegaon", "Chakan", "Lonavala"],
    aliases: [
      "poona", "hinjewadi", "hinjawadi", "wakad", "kharadi", "baner", "aundh", "viman nagar",
      "magarpatta", "hadapsar", "kothrud", "pimpri", "chinchwad", "yerwada", "koregaon park",
    ],
  },
  {
    slug: "kolkata",
    label: "Kolkata",
    state: "west-bengal",
    cities: ["Kolkata", "Howrah", "Kalyani", "Barasat", "Barrackpore", "Serampore"],
    aliases: [
      "calcutta", "salt lake", "salt lake city", "sector v", "rajarhat", "new town",
      "bidhannagar", "dum dum", "behala", "garia",
    ],
  },
  {
    slug: "ahmedabad",
    label: "Ahmedabad",
    state: "gujarat",
    cities: ["Ahmedabad", "Gandhinagar", "Sanand", "Kalol"],
    aliases: ["amdavad", "gift city", "gujarat international finance tec-city", "sabarmati", "bopal", "satellite"],
  },
  {
    slug: "chandigarh-tricity",
    label: "Chandigarh Tricity",
    state: "chandigarh",
    alsoStates: ["punjab", "haryana"],
    cities: ["Chandigarh", "Mohali", "Panchkula", "Zirakpur", "Kharar", "Derabassi"],
    aliases: ["tricity", "sas nagar", "sahibzada ajit singh nagar", "new chandigarh", "mullanpur"],
  },
  {
    slug: "kochi",
    label: "Kochi",
    state: "kerala",
    cities: ["Kochi", "Ernakulam", "Aluva", "Kalamassery", "Kothamangalam", "Perumbavoor", "Angamaly"],
    aliases: ["cochin", "kakkanad", "infopark", "smart city kochi", "fort kochi", "edappally", "thrikkakara"],
  },
  { slug: "coimbatore", label: "Coimbatore", state: "tamil-nadu", cities: ["Coimbatore", "Tiruppur", "Pollachi"], aliases: ["kovai", "peelamedu", "saravanampatti"] },
  { slug: "thiruvananthapuram", label: "Thiruvananthapuram", state: "kerala", cities: ["Thiruvananthapuram", "Kollam", "Kazhakkoottam"], aliases: ["trivandrum", "technopark"] },
  { slug: "indore", label: "Indore", state: "madhya-pradesh", cities: ["Indore", "Dewas", "Pithampur"], aliases: ["crystal it park"] },
  { slug: "bhopal", label: "Bhopal", state: "madhya-pradesh", cities: ["Bhopal", "Sehore"], aliases: [] },
  { slug: "jaipur", label: "Jaipur", state: "rajasthan", cities: ["Jaipur", "Jagatpura"], aliases: ["mansarovar", "sitapura"] },
  { slug: "lucknow", label: "Lucknow", state: "uttar-pradesh", cities: ["Lucknow", "Barabanki", "Unnao"], aliases: ["gomti nagar"] },
  { slug: "kanpur", label: "Kanpur", state: "uttar-pradesh", cities: ["Kanpur"], aliases: ["cawnpore"] },
  { slug: "varanasi", label: "Varanasi", state: "uttar-pradesh", cities: ["Varanasi", "Prayagraj"], aliases: ["banaras", "benares", "allahabad"] },
  { slug: "nagpur", label: "Nagpur", state: "maharashtra", cities: ["Nagpur"], aliases: ["mihan"] },
  { slug: "nashik", label: "Nashik", state: "maharashtra", cities: ["Nashik"], aliases: ["nasik"] },
  { slug: "surat", label: "Surat", state: "gujarat", cities: ["Surat"], aliases: [] },
  { slug: "vadodara", label: "Vadodara", state: "gujarat", cities: ["Vadodara", "Anand"], aliases: ["baroda"] },
  { slug: "bhubaneswar", label: "Bhubaneswar", state: "odisha", cities: ["Bhubaneswar", "Cuttack", "Puri"], aliases: ["infocity bhubaneswar"] },
  { slug: "visakhapatnam", label: "Visakhapatnam", state: "andhra-pradesh", cities: ["Visakhapatnam", "Vizianagaram"], aliases: ["vizag", "waltair"] },
  { slug: "vijayawada", label: "Vijayawada", state: "andhra-pradesh", cities: ["Vijayawada", "Guntur", "Amaravati", "Mangalagiri"], aliases: ["bezawada"] },
  { slug: "guwahati", label: "Guwahati", state: "assam", cities: ["Guwahati", "Dispur"], aliases: ["gauhati"] },
  { slug: "patna", label: "Patna", state: "bihar", cities: ["Patna"], aliases: [] },
  { slug: "ranchi", label: "Ranchi", state: "jharkhand", cities: ["Ranchi", "Jamshedpur", "Dhanbad"], aliases: ["tatanagar"] },
  { slug: "raipur", label: "Raipur", state: "chhattisgarh", cities: ["Raipur", "Bhilai", "Naya Raipur"], aliases: [] },
  { slug: "dehradun", label: "Dehradun", state: "uttarakhand", cities: ["Dehradun", "Roorkee", "Haridwar", "Rishikesh"], aliases: [] },
  { slug: "mysuru", label: "Mysuru", state: "karnataka", cities: ["Mysuru", "Mandya"], aliases: ["mysore"] },
  { slug: "mangaluru", label: "Mangaluru", state: "karnataka", cities: ["Mangaluru", "Udupi", "Manipal"], aliases: ["mangalore"] },
  { slug: "hubballi", label: "Hubballi Dharwad", state: "karnataka", cities: ["Hubballi", "Dharwad", "Belagavi"], aliases: ["hubli", "belgaum"] },
  { slug: "madurai", label: "Madurai", state: "tamil-nadu", cities: ["Madurai"], aliases: [] },
  { slug: "tiruchirappalli", label: "Tiruchirappalli", state: "tamil-nadu", cities: ["Tiruchirappalli", "Thanjavur"], aliases: ["trichy"] },
  { slug: "amritsar", label: "Amritsar", state: "punjab", cities: ["Amritsar", "Jalandhar"], aliases: [] },
  { slug: "ludhiana", label: "Ludhiana", state: "punjab", cities: ["Ludhiana", "Patiala"], aliases: [] },
  { slug: "jodhpur", label: "Jodhpur", state: "rajasthan", cities: ["Jodhpur", "Ajmer"], aliases: [] },
  { slug: "udaipur", label: "Udaipur", state: "rajasthan", cities: ["Udaipur", "Chittorgarh"], aliases: [] },
  { slug: "kota", label: "Kota", state: "rajasthan", cities: ["Kota"], aliases: [] },
  { slug: "goa", label: "Goa", state: "goa", cities: ["Panaji", "Vasco da Gama", "Margao", "Mapusa", "Ponda"], aliases: ["panjim", "goa"] },
  { slug: "jammu", label: "Jammu & Srinagar", state: "jammu-kashmir", cities: ["Jammu", "Srinagar"], aliases: [] },
  { slug: "shimla", label: "Shimla", state: "himachal-pradesh", cities: ["Shimla", "Solan", "Mandi", "Hamirpur"], aliases: ["simla"] },
  { slug: "siliguri", label: "Siliguri", state: "west-bengal", cities: ["Siliguri", "Darjeeling", "Jalpaiguri"], aliases: [] },
  { slug: "kozhikode", label: "Kozhikode", state: "kerala", cities: ["Kozhikode", "Thrissur", "Malappuram", "Kannur"], aliases: ["calicut", "trichur"] },
  { slug: "warangal", label: "Warangal", state: "telangana", cities: ["Warangal", "Karimnagar", "Nizamabad"], aliases: [] },
  { slug: "gwalior", label: "Gwalior", state: "madhya-pradesh", cities: ["Gwalior", "Jabalpur", "Ujjain"], aliases: [] },
  { slug: "agra", label: "Agra", state: "uttar-pradesh", cities: ["Agra", "Mathura", "Aligarh"], aliases: [] },
  { slug: "gorakhpur", label: "Gorakhpur", state: "uttar-pradesh", cities: ["Gorakhpur", "Bareilly", "Moradabad"], aliases: [] },
];

// ─── Lookup indices (built once at module load) ──────────────────────────────

const CITY_TO_CLUSTER = new Map<string, MetroCluster>();
const CITY_LABEL = new Map<string, string>();
/** alias slug → canonical city slug, so old and new names collapse to one key. */
const CITY_CANONICAL = new Map<string, string>();

/**
 * Renamed cities. Without these "Bangalore" (profile) and "Bengaluru" (source)
 * would only ever match at cluster level, costing a full tier of precision.
 */
const CITY_RENAMES: Record<string, string> = {
  bangalore: "Bengaluru", bombay: "Mumbai", calcutta: "Kolkata", madras: "Chennai",
  poona: "Pune", gurgaon: "Gurugram", cochin: "Kochi", trivandrum: "Thiruvananthapuram",
  mysore: "Mysuru", mangalore: "Mangaluru", hubli: "Hubballi", calicut: "Kozhikode",
  trichy: "Tiruchirappalli", vizag: "Visakhapatnam", waltair: "Visakhapatnam",
  baroda: "Vadodara", allahabad: "Prayagraj", banaras: "Varanasi", benares: "Varanasi",
  simla: "Shimla", nasik: "Nashik", panjim: "Panaji", gauhati: "Guwahati",
  amdavad: "Ahmedabad", cawnpore: "Kanpur", tatanagar: "Jamshedpur", bezawada: "Vijayawada",
  belgaum: "Belagavi", kovai: "Coimbatore", trichur: "Thrissur", "sas nagar": "Mohali",
  "gautam buddha nagar": "Noida", "greater noida west": "Greater Noida",
};

for (const c of METRO_CLUSTERS) {
  for (const city of c.cities) {
    const key = slugify(city);
    if (!CITY_TO_CLUSTER.has(key)) CITY_TO_CLUSTER.set(key, c);
    if (!CITY_LABEL.has(key)) CITY_LABEL.set(key, city);
    CITY_CANONICAL.set(key, key);
  }
  for (const alias of c.aliases ?? []) {
    const key = slugify(alias);
    if (!CITY_TO_CLUSTER.has(key)) CITY_TO_CLUSTER.set(key, c);
    // A renamed city folds onto its modern name; a sub-locality (Whitefield,
    // Gachibowli) folds onto its cluster's primary city, which is where it is.
    const renamed = CITY_RENAMES[alias];
    const target = renamed ? slugify(renamed) : slugify(c.cities[0] ?? alias);
    if (!CITY_CANONICAL.has(key)) CITY_CANONICAL.set(key, target);
  }
}

/** Collapse an alias slug onto the canonical city slug it denotes. */
function canonicalCity(slug: string): string {
  return CITY_CANONICAL.get(slug) ?? slug;
}

const INDIAN_STATE_SET = new Set(INDIAN_STATES);

/** State slugs plus the abbreviations and spellings sources actually emit. */
const STATE_ALIASES: Record<string, string> = {
  "up": "uttar-pradesh", "uttar pradesh": "uttar-pradesh", "u p": "uttar-pradesh",
  "mp": "madhya-pradesh", "madhya pradesh": "madhya-pradesh",
  "ap": "andhra-pradesh", "andhra pradesh": "andhra-pradesh",
  "hp": "himachal-pradesh", "himachal pradesh": "himachal-pradesh",
  "wb": "west-bengal", "west bengal": "west-bengal",
  "tn": "tamil-nadu", "tamil nadu": "tamil-nadu", "tamilnadu": "tamil-nadu",
  "mh": "maharashtra", "ka": "karnataka", "ts": "telangana", "tg": "telangana",
  "kl": "kerala", "gj": "gujarat", "rj": "rajasthan", "hr": "haryana", "pb": "punjab",
  "br": "bihar", "od": "odisha", "orissa": "odisha", "jk": "jammu-kashmir",
  "jammu and kashmir": "jammu-kashmir", "jammu & kashmir": "jammu-kashmir",
  "uk": "uttarakhand", "uttarakhand": "uttarakhand", "uttaranchal": "uttarakhand",
  "ch": "chandigarh", "dl": "delhi", "nct": "delhi", "pondicherry": "puducherry",
};

const INDIA_TOKENS = new Set([
  "india", "bharat", "in", "ind", "pan india", "pan-india", "all india", "across india",
  "anywhere in india", "india remote", "republic of india",
]);

const VIRTUAL_TOKENS = new Set([
  "online", "virtual", "remote", "anywhere", "worldwide", "global", "internet",
  "work from home", "wfh", "online mode", "digital", "everywhere", "web", "zoom",
  "google meet", "discord", "virtual event", "online event", "fully remote",
]);

/** Work-arrangement noise that occupies the `location` field but names no place. */
const NON_PLACE_TOKENS = new Set([
  "in-office", "in office", "onsite", "on-site", "on site", "hybrid", "offline",
  "tbd", "tba", "to be announced", "n/a", "na", "various", "multiple locations",
  "unknown", "flexible", "office", "campus", "venue", "not specified",
]);

/**
 * Markers that positively identify a NON-Indian location. Used only to
 * distinguish "definitely far away" from "we could not parse this", so an
 * unrecognised string stays neutral rather than being penalised.
 */
const FOREIGN_TOKENS = new Set([
  // countries
  "usa", "u s a", "united states", "united states of america", "us", "america",
  "uk", "united kingdom", "england", "scotland", "wales", "ireland", "canada",
  "germany", "deutschland", "france", "spain", "portugal", "italy", "netherlands",
  "belgium", "switzerland", "austria", "poland", "czechia", "czech republic",
  "sweden", "norway", "denmark", "finland", "serbia", "greece", "turkey", "romania",
  "japan", "china", "south korea", "korea", "singapore", "malaysia", "indonesia",
  "thailand", "vietnam", "philippines", "taiwan", "hong kong", "australia",
  "new zealand", "uae", "united arab emirates", "dubai", "abu dhabi", "qatar",
  "saudi arabia", "israel", "egypt", "kenya", "nigeria", "ghana", "south africa",
  "brazil", "mexico", "argentina", "chile", "colombia", "peru", "russia", "ukraine",
  "pakistan", "bangladesh", "sri lanka", "nepal", "bhutan",
  // frequent foreign cities / subdivisions in the corpus
  "san francisco", "mountain view", "new york", "nyc", "seattle", "bellevue",
  "boston", "chicago", "austin", "denver", "boulder", "irvine", "milpitas",
  "los angeles", "san jose", "sunnyvale", "palo alto", "redmond", "atlanta",
  "california", "washington", "texas", "virginia", "massachusetts", "illinois",
  "new jersey", "colorado", "oregon", "arizona", "florida", "georgia", "ontario",
  "toronto", "vancouver", "montreal", "peterborough", "london", "cambridge",
  "oxford", "manchester", "berlin", "munich", "munchen", "hamburg", "cologne",
  "frankfurt", "stuttgart", "dusseldorf", "leipzig", "dresden", "heidelberg",
  "mannheim", "essen", "bochum", "bonn", "wurzburg", "kempten", "puchheim",
  "paris", "lyon", "madrid", "barcelona", "lisbon", "porto", "rome", "milan",
  "amsterdam", "rotterdam", "brussels", "zurich", "geneva", "vienna", "prague",
  "warsaw", "krakow", "stockholm", "oslo", "copenhagen", "helsinki", "belgrade",
  "athens", "istanbul", "tokyo", "osaka", "kyoto", "seoul", "beijing", "shanghai",
  "shenzhen", "sydney", "melbourne", "brisbane", "auckland", "mexico city",
  "sao paulo", "buenos aires", "nairobi", "lagos", "cape town", "tel aviv",
]);

/** A structured reading of one free-text location string. */
export interface PlaceRef {
  /** Slugified city keys that resolved to a known settlement. */
  cities: string[];
  /** Metro cluster slugs the cities belong to. */
  clusters: string[];
  /** Indian state slugs, from explicit state tokens or inferred from clusters. */
  states: string[];
  /** True when the string denotes an online/remote venue rather than a place. */
  virtual: boolean;
  /** True for "Pan-India" style nationwide postings. */
  panIndia: boolean;
  /** True when any token positively identifies India. */
  india: boolean;
  /** True when any token positively identifies a non-Indian place. */
  foreign: boolean;
  /** Best human label for the most specific place found. */
  label?: string;
}

const EMPTY_PLACE: PlaceRef = {
  cities: [], clusters: [], states: [], virtual: false,
  panIndia: false, india: false, foreign: false,
};

/**
 * Split a raw string into comparable segments. ` - ` with spaces is a separator
 * ("Remote - USA" → two segments); a tight dash is part of one name, so
 * "Bengaluru-VTP" yields both the full token and its head.
 */
function segmentize(raw: string): string[] {
  const cleaned = raw
    .toLowerCase()
    .replace(/[()[\]]/g, " ")
    .replace(/\b\d{4,6}\b/g, " ")      // postcodes
    .replace(/\s+-\s+/g, ",")          // spaced dash = separator
    .replace(/\s+/g, " ");
  return cleaned
    .split(/[;|/,\u2013\u2014]+/)
    .flatMap((seg) => {
      const t = seg.trim();
      if (!t) return [];
      const head = t.split("-")[0]?.trim();
      return head && head !== t ? [t, head] : [t];
    })
    .filter(Boolean);
}

/**
 * Candidate phrases to test a segment against, longest first: the whole
 * segment, then bigrams ("san francisco", "greater noida"), then single words.
 * This rescues place names buried in prose like "India Community Centre".
 */
function candidates(segment: string): string[] {
  const words = segment.split(" ").filter(Boolean);
  if (words.length <= 1) return [segment];
  const out = [segment];
  for (let i = 0; i + 1 < words.length; i++) out.push(`${words[i]} ${words[i + 1]}`);
  for (const w of words) if (w.length > 2) out.push(w);
  return out;
}

/** Resolve a free-text location string into structured geography. */
export function parseLocation(raw: string | undefined | null): PlaceRef {
  if (!raw || !raw.trim()) return { ...EMPTY_PLACE };

  const out: PlaceRef = { ...EMPTY_PLACE, cities: [], clusters: [], states: [] };
  const cities: string[] = [];
  const clusters: string[] = [];
  const states: string[] = [];

  for (const segment of segmentize(raw)) {
    // Whole-segment checks first. These sets contain short, ambiguous entries
    // ("in", "us", "web") that are only safe to match against a complete
    // segment — never against a stray word inside a longer phrase.
    if (NON_PLACE_TOKENS.has(segment)) continue;
    if (VIRTUAL_TOKENS.has(segment)) { out.virtual = true; continue; }
    if (INDIA_TOKENS.has(segment)) {
      out.india = true;
      if (/pan|all india|across/.test(segment)) out.panIndia = true;
      continue;
    }

    // Place lookup, longest candidate first, stopping at the first hit.
    let matched = false;
    for (const cand of candidates(segment)) {
      const slug = slugify(cand);

      const cluster = CITY_TO_CLUSTER.get(slug);
      if (cluster) {
        out.india = true;
        cities.push(canonicalCity(slug));
        clusters.push(cluster.slug);
        states.push(cluster.state);
        matched = true;
        break;
      }

      const stateSlug = STATE_ALIASES[cand] ?? (INDIAN_STATE_SET.has(slug) ? slug : undefined);
      if (stateSlug) {
        out.india = true;
        states.push(stateSlug);
        matched = true;
        break;
      }

      if (FOREIGN_TOKENS.has(cand)) { out.foreign = true; matched = true; break; }

      // "india" is the one country token safe to match mid-phrase.
      if (cand === "india") { out.india = true; matched = true; break; }
    }
    if (matched) continue;
  }

  out.cities = uniq(cities);
  out.clusters = uniq(clusters);
  out.states = uniq(states);

  // A place resolved inside India is never simultaneously "foreign".
  if (out.cities.length || out.states.length) out.foreign = false;

  out.label =
    (out.cities[0] && CITY_LABEL.get(out.cities[0])) ||
    (out.clusters[0] && METRO_CLUSTERS.find((c) => c.slug === out.clusters[0])?.label) ||
    undefined;

  return out;
}

// ─── Relating an opportunity's place to a student's home ─────────────────────

/**
 * How close an opportunity is to the student, most specific first.
 *  - `remote`  : attendable from anywhere (online / virtual / pan-India)
 *  - `city`    : the same settlement
 *  - `metro`   : the same commuter region — Noida for a Delhi resident
 *  - `state`   : the same state, different metro
 *  - `country` : elsewhere in India
 *  - `far`     : positively identified as outside India
 *  - `unknown` : unparseable — treated as neutral, never penalised
 */
export type ProximityTier = "remote" | "city" | "metro" | "state" | "country" | "far" | "unknown";

export interface Proximity {
  tier: ProximityTier;
  /** 0–1 signal for the ranking engine. */
  score: number;
  /** Short human phrase for a reason chip, e.g. "Near you in Noida". */
  label?: string;
  /** Metro cluster label when the match was regional, e.g. "Delhi NCR". */
  region?: string;
}

/**
 * Signal strengths per tier. `unknown` sits at 0.6 — deliberately above
 * `country` — because an unparsed string must never rank below a place we know
 * to be far away. The relocation-friendly variants lift the distance penalties
 * for students who said they are willing to move.
 */
const TIER_SCORE: Record<ProximityTier, number> = {
  remote: 1, city: 1, metro: 0.92, state: 0.7, country: 0.35, far: 0.12, unknown: 0.6,
};
const TIER_SCORE_RELOCATING: Record<ProximityTier, number> = {
  remote: 1, city: 1, metro: 0.92, state: 0.8, country: 0.68, far: 0.45, unknown: 0.65,
};

/** Resolve a student's home from their free-text city plus their state slug. */
export function resolveHome(location?: string, state?: string): PlaceRef {
  const fromCity = parseLocation(location);
  if (fromCity.cities.length || fromCity.clusters.length) {
    // Fold in the declared state so a state-level match still works.
    if (state && !fromCity.states.includes(state)) fromCity.states = [...fromCity.states, state];
    return fromCity;
  }
  if (state) {
    return {
      ...EMPTY_PLACE,
      states: [state],
      india: true,
      label: STATE_LABELS[state],
      cities: [], clusters: [],
    };
  }
  return fromCity;
}

/**
 * Grade how local an opportunity is for a student. `isRemote` on the
 * opportunity is authoritative and short-circuits the geographic comparison.
 */
export function proximity(
  opp: { location?: string; isRemote?: boolean },
  home: PlaceRef,
  opts: { willingToRelocate?: boolean } = {},
): Proximity {
  const table = opts.willingToRelocate ? TIER_SCORE_RELOCATING : TIER_SCORE;
  const make = (tier: ProximityTier, label?: string, region?: string): Proximity => ({
    tier, score: table[tier], label, region,
  });

  const there = parseLocation(opp.location);

  if (there.panIndia) return make("remote", "Open across India");

  if (opp.isRemote || there.virtual) {
    // Region-locked remote ("Remote - USA") is still remote, but it is not
    // equivalent to a globally open online event for a student in India.
    if (there.foreign && !there.india) {
      return {
        tier: "remote",
        score: opts.willingToRelocate ? 0.6 : 0.45,
        label: "Remote — region-restricted",
      };
    }
    return make("remote", "Online — join from anywhere");
  }

  // No home on file: everything is equally unknown, so stay neutral.
  const hasHome = home.cities.length > 0 || home.clusters.length > 0 || home.states.length > 0;
  if (!hasHome) return make("unknown");

  if (!there.cities.length && !there.states.length) {
    return there.foreign ? make("far") : make("unknown");
  }

  // Same settlement.
  const sameCity = there.cities.find((c) => home.cities.includes(c));
  if (sameCity) {
    const label = CITY_LABEL.get(sameCity) ?? there.label;
    return make("city", label ? `In ${label}` : "In your city");
  }

  // Same commuter region — the case that matters most: a Delhi student and a
  // Noida hackathon share the `delhi-ncr` cluster.
  const sameCluster = there.clusters.find((c) => home.clusters.includes(c));
  if (sameCluster) {
    const region = METRO_CLUSTERS.find((c) => c.slug === sameCluster)?.label;
    const city = there.cities[0] ? CITY_LABEL.get(there.cities[0]) : undefined;
    return make("metro", city ? `Near you in ${city}` : `In ${region}`, region);
  }

  // Same state, different metro.
  const sameState = there.states.find((s) => home.states.includes(s));
  if (sameState) {
    const city = there.cities[0] ? CITY_LABEL.get(there.cities[0]) : undefined;
    const stateLabel = STATE_LABELS[sameState] ?? sameState;
    return make("state", city ? `${city} — same state` : `In ${stateLabel}`);
  }

  if (there.foreign) return make("far");
  if (there.india || there.cities.length || there.states.length) return make("country");
  return make("unknown");
}

/** True when an item should survive the "Near me" filter. */
export function isNearby(tier: ProximityTier): boolean {
  return tier === "city" || tier === "metro" || tier === "state";
}

/** Cluster lookup for the profile UI ("we'll also show you Noida, Gurugram…"). */
export function clusterFor(location?: string, state?: string): MetroCluster | undefined {
  const home = resolveHome(location, state);
  if (home.clusters[0]) return METRO_CLUSTERS.find((c) => c.slug === home.clusters[0]);
  return undefined;
}

/** Every city name we know, for the profile input's autocomplete list. */
export const KNOWN_CITIES: string[] = uniq(
  METRO_CLUSTERS.flatMap((c) => c.cities),
).sort((a, b) => a.localeCompare(b));
