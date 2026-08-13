import {
  DEFAULT_MAX_JSON_SOURCE_SIZE,
  parseJsonSource,
  type JsonParseResult
} from './jsonParser';

export type WorkbenchLayout = 'editor' | 'split' | 'result';
export type WorkbenchResultView = 'tree' | 'highlight';

export interface WorkbenchState {
  source: string;
  layout: WorkbenchLayout;
  resultView: WorkbenchResultView;
  parseJsonString: boolean;
  richContent: boolean;
  explain: boolean;
}

type WorkbenchOptions = Partial<Omit<WorkbenchState, 'source'>> & {
  source?: string;
  maxSourceSize?: number;
};

export class WorkbenchController {
  private state: WorkbenchState;
  private parseCache?: JsonParseResult;
  private parseCount = 0;
  private readonly maxSourceSize: number;

  constructor(options: WorkbenchOptions = {}) {
    this.state = {
      source: options.source ?? '',
      layout: options.layout ?? 'split',
      resultView: options.resultView ?? 'tree',
      parseJsonString: options.parseJsonString ?? false,
      richContent: options.richContent ?? false,
      explain: options.explain ?? false
    };
    this.maxSourceSize = options.maxSourceSize ?? DEFAULT_MAX_JSON_SOURCE_SIZE;
  }

  get snapshot(): Readonly<WorkbenchState> {
    return { ...this.state };
  }

  get source(): string {
    return this.state.source;
  }

  get layout(): WorkbenchLayout {
    return this.state.layout;
  }

  get resultView(): WorkbenchResultView {
    return this.state.resultView;
  }

  get renderOptions(): Readonly<Pick<WorkbenchState, 'explain' | 'richContent'>> {
    return {
      explain: this.state.explain,
      richContent: this.state.richContent
    };
  }

  setSource(source: string): void {
    if (source === this.state.source) return;
    this.state.source = source;
    this.parseCache = undefined;
  }

  setLayout(layout: WorkbenchLayout): void {
    this.state.layout = layout;
  }

  setResultView(resultView: WorkbenchResultView): void {
    this.state.resultView = resultView;
  }

  setParseJsonString(enabled: boolean): void {
    if (enabled === this.state.parseJsonString) return;
    this.state.parseJsonString = enabled;
    this.parseCache = undefined;
  }

  setRichContent(enabled: boolean): void {
    this.state.richContent = enabled;
  }

  setExplain(enabled: boolean): void {
    this.state.explain = enabled;
  }

  parse(): JsonParseResult {
    if (!this.parseCache) {
      this.parseCache = parseJsonSource(this.state.source, {
        parseJsonString: this.state.parseJsonString,
        maxSize: this.maxSourceSize
      });
      this.parseCount += 1;
    }
    return this.parseCache;
  }

  commitFormattedResult(value: unknown, formatted: string): void {
    this.state.source = formatted;
    this.parseCache = { ok: true, value, formatted };
  }

  getParseCount(): number {
    return this.parseCount;
  }
}
