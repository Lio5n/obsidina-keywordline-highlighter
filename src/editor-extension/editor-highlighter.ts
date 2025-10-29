import { SearchCursor } from '@codemirror/search';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, type PluginValue, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { highlightMark } from 'src/editor-extension';
import type { KeywordStyle } from 'src/shared';
import { settingsStore } from 'src/stores/settings-store';
import { get } from 'svelte/store';

type NewDecoration = { from: number; to: number; decoration: Decoration };

export class EditorHighlighter implements PluginValue {
  decorations: DecorationSet;
  unsubscribe: () => void;
  intervalId?: NodeJS.Timeout;

  // 📅 日期关键字 map
  dateKeywordMap: Record<string, () => string> = {
    TODAY: () => this.getRelativeDate(0),
    YESTERDAY: () => this.getRelativeDate(-1),
  };

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);

    this.unsubscribe = settingsStore.subscribe(() => {
      setTimeout(() => {
        try {
          if (view.state) {
            this.decorations = this.buildDecorations(view);
            view.requestMeasure();
          }
        } catch (e) {
          this.unsubscribe();
        }
      }, 0);
    });

    // 每5分钟刷新日期
    this.intervalId = setInterval(() => {
      this.decorations = this.buildDecorations(view);
      view.requestMeasure();
    }, 5 * 60 * 1000);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  destroy(): void {
    this.unsubscribe();
    if (this.intervalId) clearInterval(this.intervalId);
  }

  getRelativeDate(offset: number): string {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const newDecorations: NewDecoration[] = [];
    const settings = get(settingsStore);

    settings.keywords.filter((k) => !!k.keyword).forEach((k) => {
      let keywordToUse = k.keyword;
      const mapFn = this.dateKeywordMap[keywordToUse.toUpperCase()];
      if (mapFn) keywordToUse = mapFn();

      newDecorations.push(...this.buildDecorationsForKeyword(view, { ...k, keyword: keywordToUse }));
    });

    newDecorations.sort((a,b) => a.from - b.from);
    newDecorations.forEach(d => builder.add(d.from, d.to, d.decoration));
    return builder.finish();
  }

  buildDecorationsForKeyword(view: EditorView, keyword: KeywordStyle): NewDecoration[] {
    const newDecorations: NewDecoration[] = [];
    const cursor = new SearchCursor(view.state.doc, keyword.keyword);
    cursor.next();
    while (!cursor.done) {
      // ⬅️ 整行高亮，从行开头到行结束
      const line = view.state.doc.lineAt(cursor.value.from);
      newDecorations.push({
        from: line.from,
        to: line.to,
        decoration: highlightMark(keyword),
      });
      cursor.next();
    }
    return newDecorations;
  }
}

export const editorHighlighter = ViewPlugin.fromClass(EditorHighlighter, {
  decorations: (value: EditorHighlighter) => value.decorations,
});
