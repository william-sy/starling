export interface NameSegment {
  text: string;
  color: string | null;
}

export const NAME_COLORS: Record<number, string> = {
  1: 'oklch(0.65 0.22 25)',   // red
  2: 'oklch(0.72 0.18 145)',  // green
  3: 'oklch(0.70 0.18 240)',  // blue
  4: 'oklch(0.90 0.18 95)',   // yellow
  5: 'oklch(0.72 0.22 330)',  // pink
  6: 'oklch(0.72 0.20 55)',   // orange
  7: 'oklch(0.80 0.14 200)',  // cyan
  8: 'oklch(0.65 0.18 280)',  // purple
  9: 'oklch(0.85 0.15 80)',   // gold
};

export function parseColoredName(raw: string): NameSegment[] {
  const segments: NameSegment[] = [];
  const re = /\[c=(\d+)\]/gi;
  let last = 0;
  let color: string | null = null;
  let m: RegExpExecArray | null;

  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) {
      segments.push({ text: raw.slice(last, m.index), color });
    }
    const idx = parseInt(m[1], 10);
    color = idx === 0 ? null : (NAME_COLORS[idx] ?? null);
    last = m.index + m[0].length;
  }

  if (last < raw.length) {
    segments.push({ text: raw.slice(last), color });
  }

  return segments.filter(s => s.text.length > 0);
}

export function hasColorCodes(raw: string): boolean {
  return /\[c=\d+\]/i.test(raw);
}

export function stripColorCodes(raw: string): string {
  return raw.replace(/\[c=\d+\]/gi, '');
}
