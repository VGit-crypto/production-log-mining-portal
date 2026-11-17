import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CountBucket } from '../../models';

export const SEVERITY_COLORS: Record<string, string> = {
  Critical: '#b3261e',
  High: '#c75300',
  Medium: '#8f6b00',
  Low: '#2e7d32',
};
const PALETTE = ['#1a4b8c', '#00838f', '#6a1b9a', '#ad1457', '#4e6b00', '#ef6c00', '#455a64', '#3949ab'];

/** Horizontal bar list. Values are rendered as text so the chart is readable without colour or vision. */
@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bar-chart.component.html',
  styles: `
    .bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
    li { display: grid; grid-template-columns: minmax(70px, 30%) 1fr 48px; align-items: center; gap: 12px; font-size: 14px; }
    .lbl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .track { background: #eef1f6; border-radius: 6px; height: 14px; overflow: hidden; }
    .fill { display: block; height: 100%; border-radius: 6px; min-width: 2px; }
    .val { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
    .empty { color: #5f6b7a; margin: 0; }
  `,
})
export class BarChartComponent {
  readonly data = input.required<CountBucket[]>();
  readonly label = input('Bar chart');
  readonly severityColors = input(false);

  protected readonly rows = computed(() => {
    const d = this.data();
    const max = Math.max(1, ...d.map((x) => x.value));
    return d.map((x, i) => ({
      ...x,
      pct: (x.value / max) * 100,
      color: this.severityColors() ? (SEVERITY_COLORS[x.label] ?? PALETTE[0]) : PALETTE[i % PALETTE.length],
    }));
  });
}

@Component({
  selector: 'app-donut-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './donut-chart.component.html',
  styles: `
    .wrap { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; justify-content: center; }
    svg { width: 190px; max-width: 100%; }
    .total { font-size: 22px; font-weight: 700; fill: #12233f; }
    .sub { font-size: 8px; fill: #5f6b7a; }
    .legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; font-size: 14px; }
    .legend li { display: flex; align-items: center; gap: 8px; }
    .legend strong { margin-left: auto; padding-left: 16px; }
    .dot { width: 12px; height: 12px; border-radius: 3px; flex: none; }
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
        dash: `${len} ${C - len}`,
        offset: -acc,
      };
      acc += len;
      return s;
    });
  });
}

@Component({
  selector: 'app-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './line-chart.component.html',
  styles: `
    svg { width: 100%; height: auto; }
    .axis { font-size: 11px; fill: #5f6b7a; }
    .empty { color: #5f6b7a; margin: 0; }
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
    return idx.filter((i) => p[i]).map((i) => ({ x: p[i].x, label: p[i].label.slice(5) }));
  });
  protected readonly summary = computed(() => this.data().map((d) => `${d.label} ${d.value}`).join(', '));
}
