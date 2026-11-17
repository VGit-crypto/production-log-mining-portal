import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { parseMarkdown } from '../markdown';

/** Renders AI-written Markdown as real elements (headings, lists, bold, code) without using innerHTML. */
@Component({
  selector: 'app-markdown-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  templateUrl: './markdown-view.component.html',
  styles: `
    :host { display: block; line-height: 1.6; overflow-wrap: anywhere; }
    .md-h { margin: 16px 0 4px; font-size: 14px; font-weight: 600; color: var(--app-navy); }
    .md-h:first-child { margin-top: 0; }
    p { margin: 0 0 10px; }
    ul, ol { margin: 0 0 10px; padding-left: 22px; }
    li { margin: 2px 0; }
    code { font-family: ui-monospace, Consolas, monospace; font-size: 0.9em; background: #eef2f8; border-radius: 4px; padding: 1px 5px; }
    strong code { font-weight: 700; }
  `,
})
export class MarkdownViewComponent {
  readonly source = input.required<string>();
  protected readonly blocks = computed(() => parseMarkdown(this.source() ?? ''));
}
