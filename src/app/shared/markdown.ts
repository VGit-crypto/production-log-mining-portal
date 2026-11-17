/**
 * Minimal, safe Markdown parsing for AI-written text (bug story description, RCA).
 * It produces plain data (blocks of styled text runs) that templates render as elements, so no HTML is ever
 * injected: log-derived text can never become markup.
 *
 * Supported: `#` headings, a line that is only **bold** (shown as a section heading), `-`/`*` and `1.` lists,
 * paragraphs with hard line breaks (two trailing spaces), and inline **bold**, *italic*, _italic_ and `code`.
 */
export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export type BlockType = 'heading' | 'p' | 'ul' | 'ol';

/** `lines`: for p, hard-broken lines; for lists, one entry per item; for heading, a single entry. */
export interface MdBlock {
  type: BlockType;
  lines: Run[][];
}

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/;

export function parseInline(text: string, flags: Omit<Run, 'text'> = {}): Run[] {
  const runs: Run[] = [];
  for (const part of text.split(INLINE)) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      runs.push(...parseInline(part.slice(2, -2), { ...flags, bold: true }));
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      runs.push({ text: part.slice(1, -1), ...flags, code: true });
    } else if (
      ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) &&
      part.length > 2
    ) {
      runs.push(...parseInline(part.slice(1, -1), { ...flags, italic: true }));
    } else {
      runs.push({ text: part, ...flags });
    }
  }
  return runs;
}

/** Older RCA text ended with "Suggested checks: a; b; c." on one line; show it as a heading plus a list. */
function normalizeLegacy(source: string): string {
  return source.replace(/(^|\n)Suggested checks: ([^\n]+?)\.?(?=\n|$)/g, (_m, lead: string, items: string) =>
    `${lead}**Suggested checks**\n${items.split(/;\s*/).map((i) => `- ${i}`).join('\n')}`,
  );
}

export function parseMarkdown(rawSource: string): MdBlock[] {
  const source = normalizeLegacy(rawSource);
  const blocks: MdBlock[] = [];
  // State lives in an object (not a closure-assigned `let`) so TypeScript tracks its type correctly.
  const state: { current: { type: BlockType; raw: string[] } | null } = { current: null };
  const flush = () => {
    const c = state.current;
    if (!c) return;
    blocks.push({ type: c.type, lines: c.raw.map((l) => parseInline(l.trim())) });
    state.current = null;
  };
  const push = (type: BlockType, text: string) => {
    if (!state.current || state.current.type !== type) {
      flush();
      state.current = { type, raw: [] };
    }
    state.current.raw.push(text);
  };

  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) {
      flush();
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^\s*#{1,4}\s+(.+?)\s*#*\s*$/.exec(line))) {
      flush();
      push('heading', m[1]);
      flush();
    } else if ((m = /^\s*\*\*([^*\n]+?)\*\*:?\s*$/.exec(line))) {
      // A line that is only bold text acts as a section heading ("**Business context**").
      flush();
      push('heading', m[1].replace(/:$/, ''));
      flush();
    } else if ((m = /^\s*[-*•]\s+(.*)$/.exec(line))) {
      push('ul', m[1]);
    } else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
      push('ol', m[1]);
    } else if (state.current && (state.current.type === 'ul' || state.current.type === 'ol') && /^\s{2,}\S/.test(line)) {
      state.current.raw[state.current.raw.length - 1] += ' ' + line.trim(); // wrapped list item
    } else if (state.current?.type === 'p') {
      const raw = state.current.raw;
      if (/ {2,}$/.test(raw[raw.length - 1])) raw.push(line); // hard line break
      else raw[raw.length - 1] += ' ' + line.trim();
    } else {
      push('p', line);
    }
  }
  flush();
  return blocks;
}

/** Plain-text preview of Markdown: the first paragraph (or list item), without markup, cut at a word boundary. */
export function summarize(source: string, max = 280): string {
  const blocks = parseMarkdown(source);
  const first = blocks.find((b) => b.type === 'p') ?? blocks.find((b) => b.type !== 'heading');
  const text = (first?.lines ?? []).map((l) => l.map((r) => r.text).join('')).join(' ').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 30)).trimEnd() + '…';
}
