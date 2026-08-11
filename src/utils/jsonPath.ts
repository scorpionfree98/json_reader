export interface PathToken {
  type: 'object' | 'array';
  value: string;
}

export interface CustomPathFormats {
  key: string;
  index: string;
}

const DEFAULT_CUSTOM_FORMATS: CustomPathFormats = {
  key: '.{key}',
  index: '[{index}]'
};

export const parsePathTokens = (path: string): PathToken[] => {
  const tokens: PathToken[] = [];
  let cursor = 0;

  while (cursor < path.length) {
    if (path[cursor] !== '[') break;
    if (path[cursor + 1] !== '"') {
      const match = path.slice(cursor).match(/^\[(\d+)\]/);
      if (!match) break;
      tokens.push({ type: 'array', value: match[1] });
      cursor += match[0].length;
      continue;
    }

    const stringStart = cursor + 1;
    let stringEnd = stringStart + 1;
    let escaped = false;
    for (; stringEnd < path.length; stringEnd += 1) {
      const char = path[stringEnd];
      if (char === '"' && !escaped) break;
      escaped = char === '\\' && !escaped;
      if (char !== '\\') escaped = false;
    }
    if (path[stringEnd + 1] !== ']') break;

    try {
      tokens.push({ type: 'object', value: JSON.parse(path.slice(stringStart, stringEnd + 1)) });
    } catch {
      break;
    }
    cursor = stringEnd + 2;
  }

  return tokens;
};

const escapeSingleQuotedKey = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export const formatKeyPath = (
  path: string,
  format: string,
  customFormats: CustomPathFormats = DEFAULT_CUSTOM_FORMATS
): string => {
  if (!path) return '';
  const tokens = parsePathTokens(path);

  switch (format) {
    case 'dot':
      return tokens.map((token, index) =>
        token.type === 'array' ? `[${token.value}]` : `${index === 0 ? '' : '.'}${token.value}`
      ).join('');
    case 'jsonpath':
      return '$' + tokens.map(token =>
        token.type === 'array' ? `[${token.value}]` : `.${token.value}`
      ).join('');
    case 'bracket':
      return tokens.map(token =>
        token.type === 'array' ? `[${token.value}]` : `['${escapeSingleQuotedKey(token.value)}']`
      ).join('');
    case 'python':
      return tokens.map(token =>
        token.type === 'array' ? `[${token.value}]` : `.get('${escapeSingleQuotedKey(token.value)}')`
      ).join('');
    case 'custom':
      return tokens.map(token => token.type === 'array'
        ? customFormats.index.replace('{index}', token.value)
        : customFormats.key.replace('{key}', token.value)
      ).join('');
    default:
      return path;
  }
};
