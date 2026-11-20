import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CountBucket } from '../../models';

/** Status colors: danger / warning / secondary / success. Validated as an ordered set; every use also carries a text label. */
export const SEVERITY_COLORS: Record<string, string> = {
  Critical: '#ef4444',
  High: '#f59e0b',
  Medium: '#7c3aed',
  Low: '#10b981',
};
/** Brand primary: the single-series colour (bars). Values are always printed next to the marks. */
export const BRAND_PRIMARY = '#635bff';
/** Categorical fallback (the validated reference order; passes the adjacent-pair CVD and normal-vision gates). */
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

/** Horizontal bar list. Values are rendered as text so the chart is readable without colour or vision. */
@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './bar-chart.component.html',
  styles: `
    .bars { list-style: none; margin: 0; padding: 4px 0; display: grid; gap: 16px; }
    li { display: grid; grid-template-columns: minmax(120px, 320px) 1fr 48px; align-items: center; gap: 16px; font-size: 14px; }
    .lbl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #334155; font-weight: 500; }
    .track { background: #f1f5f9; border-radius: 999px; height: 8px; overflow: hidden; }
    .fill { display: block; height: 100%; border-radius: 999px; min-width: 6px; transform-origin: left center;
      animation: grow 700ms cubic-bezier(.2,.7,.2,1) both; transition: filter 150ms ease; }
    li:hover .fill { filter: brightness(1.08); }
    .val { text-align: right; font-weight: 600; color: #0f172a; font-variant-numeric: tabular-nums; }
    .empty { color: #64748b; margin: 0; }
    .more { margin: 16px 0 -8px -12px; }
    @keyframes grow { from { transform: scaleX(0); } }
  `,
})
export class BarChartComponent {
  readonly data = input.required<CountBucket[]>();
  readonly label = input('Bar chart');
  readonly severityColors = input(false);
  /** Show only this many rows first; the rest go behind a "View more" button. null = show everything. */
  readonly limit = input<number | null>(null);
  /** Labels longer than this are cut and end in "..." (null = never cut). */
  readonly maxChars = input<number | null>(null);
  protected readonly expanded = signal(false);

  private truncate(label: string): string {
    const max = this.maxChars();
    return max !== null && label.length > max ? label.slice(0, max).trimEnd() + "..." : label;
  }

  protected readonly rows = computed(() => {
    const d = this.data();
    const max = Math.max(1, ...d.map((x) => x.value));
    return d.map((x) => ({
      ...x,
      // One line per label: cut after maxChars characters and add "..."; the full text stays in the tooltip.
      shown: this.truncate(x.label),
      pct: (x.value / max) * 100,
      // One series = one colour: bars must not change colour with their rank.
      color: this.severityColors() ? (SEVERITY_COLORS[x.label] ?? BRAND_PRIMARY) : BRAND_PRIMARY,
    }));
  });
  protected readonly visibleRows = computed(() => {
    const limit = this.limit();
    return limit === null || this.expanded() ? this.rows() : this.rows().slice(0, limit);
  });
  protected readonly hiddenCount = computed(() => this.rows().length - this.visibleRows().length);
  protected readonly collapsible = computed(() => this.limit() !== null && this.rows().length > (this.limit() ?? 0));
}

@Component({
  selector: 'app-donut-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './donut-chart.component.html',
  styles: `
    .wrap { display: flex; align-items: center; gap: 32px; flex-wrap: wrap; justify-content: center; padding: 4px 0; }
    svg { width: 200px; max-width: 100%; }
    .slice { animation: draw 900ms cubic-bezier(.2,.7,.2,1) both; transition: stroke-width 150ms ease; }
    .slice:hover { stroke-width: 19; }
    .total { font-size: 24px; font-weight: 700; fill: #0f172a; }
    .sub { font-size: 7.5px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; fill: #64748b; }
    .legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; font-size: 14px; min-width: 200px; }
    .legend li { display: flex; align-items: center; gap: 8px; color: #334155; }
    .legend strong { margin-left: auto; padding-left: 16px; font-weight: 600; font-variant-numeric: tabular-nums; color: #0f172a; }
    .legend .pct { color: #64748b; font-size: 12px; font-weight: 500; min-width: 36px; text-align: right; }
    .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
    @keyframes draw { from { stroke-dasharray: 0 289; } }
  `,
})
export class DonutChartComponent {
  readonly data = input.required<CountBucket[]>();
  readonly label = input('Donut chart');
  readonly centerLabel = input('clusters');

  protected readonly total = computed(() => this.data().reduce((n, d) => n + d.value, 0));
  protected readonly summary = computed(() => this.data().map((d) => `${d.label} ${d.value}`).join(', '));
  protected readonly slices = computed(() => {
    const C = 2 * Math.PI * 46;
    const total = this.total() || 1;
    let acc = 0;
    return this.data().map((d, i) => {
      const len = (d.value / total) * C;
      const s = {
        ...d,
        color: SEVERITY_COLORS[d.label] ?? PALETTE[i % PALETTE.length],
        pct: Math.round((d.value / total) * 100),
        dash: `${len} ${C - len}`,
        offset: -acc,
      };
      acc += len;
      return s;
    });
  });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-29" -> "29 Oct 2026" (or "29 Oct" when `withYear` is false). Other labels are returned unchanged. */
function readableDay(label: string, withYear: boolean): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label);
  if (!m || !MONTHS[+m[2] - 1]) return label;
  return `${+m[3]} ${MONTHS[+m[2] - 1]}${withYear ? ` ${m[1]}` : ''}`;
}

@Component({
  selector: 'app-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './line-chart.component.html',
  styles: `
    svg { width: 100%; height: auto; }
    .axis { font-size: 11px; fill: #64748b; }
    .empty { color: #64748b; margin: 0; }
  `,
})
export class LineChartComponent {
  readonly data = input.required<CountBucket[]>();
  readonly label = input('Line chart');
  protected readonly pad = 44;
  private readonly top = 12;
  private readonly bottom = 204;

  private readonly max = computed(() => Math.max(1, ...this.data().map((d) => d.value)));
  protected readonly points = computed(() => {
    const d = this.data();
    const w = 640 - this.pad - 12;
    return d.map((p, i) => ({
      ...p,
      pretty: readableDay(p.label, true),
      x: this.pad + (d.length === 1 ? w / 2 : (i / (d.length - 1)) * w),
      y: this.bottom - (p.value / this.max()) * (this.bottom - this.top),
    }));
  });
  protected readonly line = computed(() => this.points().map((p) => `${p.x},${p.y}`).join(' '));
  protected readonly area = computed(() => {
    const p = this.points();
    return p.length ? `M${p[0].x},${this.bottom} ${p.map((q) => `L${q.x},${q.y}`).join(' ')} L${p[p.length - 1].x},${this.bottom} Z` : '';
  });
  protected readonly yTicks = computed(() =>
    [0, 0.5, 1].map((f) => ({ v: Math.round(this.max() * f), y: this.bottom - f * (this.bottom - this.top) })),
  );
  protected readonly xTicks = computed(() => {
    const p = this.points();
    const idx = [...new Set([0, Math.floor((p.length - 1) / 2), p.length - 1])];
    return idx.filter((i) => p[i]).map((i) => ({ x: p[i].x, label: readableDay(p[i].label, false) }));
  });
  protected readonly summary = computed(() => this.data().map((d) => `${readableDay(d.label, true)} ${d.value}`).join(', '));
}
