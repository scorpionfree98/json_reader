export const DEFAULT_MAX_JSON_SOURCE_SIZE = 5 * 1024 * 1024;
export const DEFAULT_MAX_JSON_DEPTH = 100;

export interface JsonParseOptions {
  parseJsonString: boolean;
  maxSize?: number;
  maxDepth?: number;
}

export type JsonParseResult =
  | { ok: true; value: unknown; formatted: string }
  | { ok: false; kind: 'empty' }
  | { ok: false; kind: 'too-large'; maxSize: number }
  | { ok: false; kind: 'invalid'; stage: 'outer' | 'inner'; error: Error; errorSource: string }
  | {
      ok: false;
      kind: 'too-deep';
      maxDepth: number;
      detectedDepth: number;
      error: RangeError;
      errorSource: string;
    }
  | { ok: false; kind: 'format-error'; error: Error; errorSource: string };

const asError = (error: unknown): Error => error instanceof Error ? error : new Error(String(error));

type JsonContainer = unknown[] | Record<string, unknown>;

const isContainer = (value: unknown): value is JsonContainer => typeof value === 'object' && value !== null;

function findExceededDepth(value: unknown, maxDepth: number): number | undefined {
  if (!isContainer(value)) return undefined;

  const stack: Array<{ value: JsonContainer; depth: number }> = [{ value, depth: 1 }];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.depth > maxDepth) return current.depth;

    const childDepth = current.depth + 1;
    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        const child = current.value[index];
        if (isContainer(child)) stack.push({ value: child, depth: childDepth });
      }
      continue;
    }

    const keys = Object.keys(current.value);
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const child = current.value[keys[index]];
      if (isContainer(child)) stack.push({ value: child, depth: childDepth });
    }
  }

  return undefined;
}

export function parseJsonSource(source: string, options: JsonParseOptions): JsonParseResult {
  if (!source.trim()) return { ok: false, kind: 'empty' };

  const maxSize = options.maxSize ?? DEFAULT_MAX_JSON_SOURCE_SIZE;
  if (source.length > maxSize) return { ok: false, kind: 'too-large', maxSize };

  let value: unknown;
  let effectiveSource = source;
  try {
    value = JSON.parse(source);
  } catch (error) {
    return { ok: false, kind: 'invalid', stage: 'outer', error: asError(error), errorSource: source };
  }

  if (options.parseJsonString && typeof value === 'string') {
    const innerSource = value;
    try {
      value = JSON.parse(innerSource);
      effectiveSource = innerSource;
    } catch (error) {
      return {
        ok: false,
        kind: 'invalid',
        stage: 'inner',
        error: new SyntaxError(`JSON Str 的字符串内容不是有效 JSON：${asError(error).message}`),
        errorSource: innerSource
      };
    }
  }

  const maxDepth = options.maxDepth ?? DEFAULT_MAX_JSON_DEPTH;
  const detectedDepth = findExceededDepth(value, maxDepth);
  if (detectedDepth !== undefined) {
    return {
      ok: false,
      kind: 'too-deep',
      maxDepth,
      detectedDepth,
      error: new RangeError(`JSON 嵌套层级超过限制（最大 ${maxDepth} 层）`),
      errorSource: effectiveSource
    };
  }

  try {
    return { ok: true, value, formatted: JSON.stringify(value, null, 2) };
  } catch (error) {
    return { ok: false, kind: 'format-error', error: asError(error), errorSource: effectiveSource };
  }
}
