import fs from 'node:fs';
import { LogEntry } from '../src/app/models';
import { KB_FILE } from './config';

interface KbCategory {
  id: string;
  group: string;
  match: { anyRegex: string[] };
}

interface Compiled {
  id: string;
  group: string;
  patterns: RegExp[];
}

let cache: { mtimeMs: number; rules: Compiled[] } | undefined;
let warned = false;

/** Rules of the agent repo's logs-failure-categories.json, compiled once (re-read whenever the file changes). */
function loadRules(): Compiled[] | undefined {
  try {
    const { mtimeMs } = fs.statSync(KB_FILE);
    if (cache?.mtimeMs === mtimeMs) return cache.rules;
    const kb = JSON.parse(fs.readFileSync(KB_FILE, 'utf-8')) as { categories?: KbCategory[] };
    const rules = (kb.categories ?? []).map((c) => ({
      id: c.id,
      group: c.group,
      patterns: c.match.anyRegex.map((r) => new RegExp(r, 'i')),
    }));
    cache = { mtimeMs, rules };
    warned = false;
    return rules;
  } catch (e) {
    if (!warned) console.warn(`[category] could not read ${KB_FILE}: ${(e as Error).message}. Using built-in keyword rules.`);
    warned = true;
    return undefined;
  }
}

/** Whether the agent repo's rule file is available. */
export const kbAvailable = (): boolean => !!loadRules()?.length;

/**
 * Category group of a single record: the first rule (in file order) with a matching regex wins, tested against the
 * message plus the stack trace / error text, exactly as the agent repo's analyzer does. Undefined when nothing matches.
 */
function groupOf(rules: Compiled[], r: LogEntry): string | undefined {
  const text = `${r.message}\n${r.stackTrace ?? ''}\n${r.error ?? ''}`;
  return rules.find((rule) => rule.patterns.some((p) => p.test(text)))?.group;
}

/**
 * Category of a cluster = the group most of its records fall into (ties go to the group that comes first in the rule
 * file). 'Uncategorized' when no record matches any rule. Returns undefined only when the rule file cannot be read,
 * so the caller can fall back to the built-in keyword rules.
 */
export function categorizeRecords(records: LogEntry[]): string | undefined {
  const rules = loadRules();
  if (!rules?.length) return undefined;
  const order = [...new Set(rules.map((r) => r.group))];
  const votes = new Map<string, number>();
  for (const r of records) {
    const g = groupOf(rules, r);
    if (g) votes.set(g, (votes.get(g) ?? 0) + 1);
  }
  if (!votes.size) return 'Uncategorized';
  return [...votes].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))[0][0];
}
