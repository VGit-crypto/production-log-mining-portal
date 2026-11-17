import { Injectable } from '@angular/core';
import { BugStory, ErrorCluster, TestCase } from '../models';

/** Client-side file generation: Markdown, CSV and Excel. */
@Injectable({ providedIn: 'root' })
export class ExportService {
  // ---------------------------------------------------------------- Markdown

  /** Format: # Title / ## Description / ## RCA / ## Business Impact / ## Acceptance Criteria */
  bugStoryToMarkdown(s: BugStory): string {
    return [
      `# ${s.title}`,
      '',
      '## Description',
      '',
      s.description,
      '',
      '## RCA',
      '',
      s.rootCause,
      '',
      '## Business Impact',
      '',
      s.businessImpact,
      '',
      '## Acceptance Criteria',
      '',
      ...s.acceptanceCriteria.map((a) => `- [ ] ${a.description}`),
      '',
    ].join('\n');
  }

  downloadBugStoryMarkdown(s: BugStory): void {
    this.download(this.bugStoryToMarkdown(s), `${this.slug(s.id + '-' + s.title)}.md`, 'text/markdown');
  }

  downloadAllBugStoriesMarkdown(stories: BugStory[]): void {
    this.download(stories.map((s) => this.bugStoryToMarkdown(s)).join('\n---\n\n'), 'bug-stories.md', 'text/markdown');
  }

  downloadErrorAnalysisReport(clusters: ErrorCluster[]): void {
    const sorted = [...clusters].sort((a, b) => b.occurrences - a.occurrences);
    const lines = [
      '# Error Analysis Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Clusters: ${clusters.length} | Total occurrences: ${clusters.reduce((n, c) => n + c.occurrences, 0)}`,
      '',
      '| Cluster | Severity | Category | Module | Occurrences | Last Seen | Confidence |',
      '|---|---|---|---|---|---|---|',
      ...sorted.map(
        (c) =>
          `| ${c.id} | ${c.severity} | ${c.category} | ${this.mdCell(c.module)} | ${c.occurrences} | ${c.lastSeen.slice(0, 10)} | ${Math.round(c.confidenceScore * 100)}% |`,
      ),
      '',
      ...sorted.flatMap((c) => [
        `## ${c.id}: ${c.bugTitle}`,
        '',
        `**Signature:** \`${c.signature.replace(/`/g, "'")}\``,
        '',
        `**Business impact:** ${c.businessImpact}`,
        '',
        `**Root cause analysis:** ${c.rootCause}`,
        '',
      ]),
    ];
    this.download(lines.join('\n'), 'error-analysis-report.md', 'text/markdown');
  }

  // --------------------------------------------------------------------- CSV

  testCasesToCsv(tests: TestCase[]): string {
    const header = ['Test Case ID', 'Cluster Id', 'Test Scenario', 'Preconditions', 'Test Steps', 'Expected Results', 'Priority'];
    const rows = this.testRows(tests).map((r) => Object.values(r));
    return [header, ...rows].map((r) => r.map((c) => this.csvCell(String(c))).join(',')).join('\r\n');
  }

  exportTestCasesCsv(tests: TestCase[]): void {
    // BOM so Excel detects UTF-8.
    this.download('﻿' + this.testCasesToCsv(tests), 'regression-test-cases.csv', 'text/csv;charset=utf-8');
  }

  // ------------------------------------------------------------------- Excel

  async exportTestCasesExcel(tests: TestCase[]): Promise<void> {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, this.sheet(XLSX, this.testRows(tests)), 'Test Cases');
    XLSX.writeFile(wb, 'regression-test-cases.xlsx');
  }

  async exportWorkbook(clusters: ErrorCluster[], stories: BugStory[], tests: TestCase[]): Promise<void> {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const clusterRows = clusters.map((c) => ({
      'Cluster Id': c.id,
      'Error Signature': c.signature,
      Category: c.category,
      Module: c.module,
      Severity: c.severity,
      Occurrences: c.occurrences,
      'Last Seen': c.lastSeen,
      'Confidence Score': c.confidenceScore,
      'Business Impact': c.businessImpact,
    }));
    const storyRows = stories.map((s) => ({
      'Bug Id': s.id,
      Title: s.title,
      Severity: s.severity,
      Cluster: s.clusterId,
      Description: s.description,
      RCA: s.rootCause,
      'Business Impact': s.businessImpact,
      'Acceptance Criteria': s.acceptanceCriteria.map((a) => a.description).join('\n'),
    }));
    XLSX.utils.book_append_sheet(wb, this.sheet(XLSX, clusterRows), 'Error Clusters');
    XLSX.utils.book_append_sheet(wb, this.sheet(XLSX, storyRows), 'Bug Stories');
    XLSX.utils.book_append_sheet(wb, this.sheet(XLSX, this.testRows(tests)), 'Test Cases');
    XLSX.writeFile(wb, 'log-mining-export.xlsx');
  }

  // ----------------------------------------------------------------- helpers

  private testRows(tests: TestCase[]) {
    const list = (items: string[]) => items.map((x, i) => `${i + 1}. ${x}`).join('\n');
    return tests.map((t) => ({
      'Test Case ID': t.id,
      'Cluster Id': t.clusterId,
      'Test Scenario': t.scenario,
      Preconditions: list(t.preconditions),
      'Test Steps': list(t.steps),
      'Expected Results': list(t.expectedResults),
      Priority: t.priority,
    }));
  }

  private sheet(XLSX: typeof import('xlsx'), rows: object[]) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const keys = Object.keys(rows[0] ?? {});
    ws['!cols'] = keys.map((k) => ({ wch: Math.min(60, Math.max(k.length + 2, 16)) }));
    return ws;
  }

  /** Log-derived text is untrusted: neutralise spreadsheet formula injection. */
  private csvCell(v: string): string {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  }

  private mdCell(v: string): string {
    return v.replace(/\|/g, '\\|');
  }

  private slug(v: string): string {
    return v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  }

  private download(content: string, fileName: string, mime: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
