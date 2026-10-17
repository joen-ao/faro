export interface RobotsRules {
  allow: string[];
  disallow: string[];
  /** Crawl-delay in seconds, if declared. */
  crawlDelay?: number;
}

export const ALLOW_ALL: RobotsRules = { allow: [], disallow: [] };
export const DISALLOW_ALL: RobotsRules = { allow: [], disallow: ["/"] };

interface Group {
  agents: string[];
  allow: string[];
  disallow: string[];
  crawlDelay?: number;
}

/** Minimal robots.txt parser: groups by User-agent, picks the group for `agent` (product token) or `*`. */
export function parseRobots(text: string, agent = "faro"): RobotsRules {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow" && value) current.allow.push(value);
    else if (key === "disallow" && value) current.disallow.push(value);
    else if (key === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n;
    }
  }
  const token = agent.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && token.startsWith(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  return {
    allow: chosen.flatMap((g) => g.allow),
    disallow: chosen.flatMap((g) => g.disallow),
    crawlDelay: chosen.find((g) => g.crawlDelay !== undefined)?.crawlDelay,
  };
}

function patternMatches(pattern: string, path: string): number {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp("^" + body.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : ""));
  return re.test(path) ? body.replace(/\*/g, "").length : -1;
}

/** Longest matching rule wins; on a tie Allow wins. `path` includes the query string. */
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  let best = -1;
  let allowed = true;
  for (const p of rules.disallow) {
    const len = patternMatches(p, path);
    if (len > best) {
      best = len;
      allowed = false;
    }
  }
  for (const p of rules.allow) {
    const len = patternMatches(p, path);
    if (len >= best && len >= 0) {
      best = len;
      allowed = true;
    }
  }
  return allowed;
}
