const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export function findJsonErrorPosition(source: string): number {
  let index = 0;
  const fail = (position = index): never => { throw position; };
  const skipWhitespace = () => {
    while (/\s/.test(source[index] || '')) index += 1;
  };

  const parseString = () => {
    if (source[index] !== '"') fail();
    index += 1;
    while (index < source.length) {
      const char = source[index++];
      if (char === '"') return;
      if (char < ' ') fail(index - 1);
      if (char !== '\\') continue;
      if (index >= source.length) fail();
      const escape = source[index++];
      if ('"\\/bfnrt'.includes(escape)) continue;
      if (escape !== 'u') fail(index - 1);
      if (!/^[0-9a-fA-F]{4}$/.test(source.slice(index, index + 4))) fail(index);
      index += 4;
    }
    fail(source.length);
  };

  const parseNumber = () => {
    const match = source.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) fail();
    index += match[0].length;
  };

  const parseLiteral = (literal: string) => {
    if (source.slice(index, index + literal.length) !== literal) fail();
    index += literal.length;
  };

  const parseValue = () => {
    skipWhitespace();
    const char = source[index];
    if (char === '"') return parseString();
    if (char === '{') return parseObject();
    if (char === '[') return parseArray();
    if (char === 't') return parseLiteral('true');
    if (char === 'f') return parseLiteral('false');
    if (char === 'n') return parseLiteral('null');
    if (char === '-' || /\d/.test(char || '')) return parseNumber();
    fail();
  };

  const parseObject = () => {
    index += 1;
    skipWhitespace();
    if (source[index] === '}') { index += 1; return; }
    while (index < source.length) {
      skipWhitespace();
      parseString();
      skipWhitespace();
      if (source[index] !== ':') fail();
      index += 1;
      parseValue();
      skipWhitespace();
      if (source[index] === '}') { index += 1; return; }
      if (source[index] !== ',') fail();
      index += 1;
    }
    fail(source.length);
  };

  const parseArray = () => {
    index += 1;
    skipWhitespace();
    if (source[index] === ']') { index += 1; return; }
    while (index < source.length) {
      parseValue();
      skipWhitespace();
      if (source[index] === ']') { index += 1; return; }
      if (source[index] !== ',') fail();
      index += 1;
    }
    fail(source.length);
  };

  try {
    parseValue();
    skipWhitespace();
    if (index !== source.length) fail();
  } catch (position) {
    return typeof position === 'number' ? position : index;
  }
  return -1;
}

export const parseJsonError = (json: string, errorMessage: string): string => {
  const positionMatch = errorMessage.match(/position\s+(\d+)/i);
  const lineMatch = errorMessage.match(/line\s+(\d+)/i);
  const columnMatch = errorMessage.match(/column\s+(\d+)/i);

  let position = positionMatch ? parseInt(positionMatch[1]) : -1;
  let line = lineMatch ? parseInt(lineMatch[1]) : -1;
  let column = columnMatch ? parseInt(columnMatch[1]) : -1;

  if (position < 0 && line < 0) position = findJsonErrorPosition(json);

  if (line === -1 && position >= 0) {
    const linesBeforeError = json.substring(0, position).split('\n');
    line = linesBeforeError.length;
    column = linesBeforeError[linesBeforeError.length - 1].length + 1;
  }

  let result = escapeHtml(errorMessage);
  if (line <= 0) return result;

  result += `<br><strong>位置：第 ${line} 行`;
  if (column > 0) result += `，第 ${column} 列`;
  result += '</strong>';

  const lines = json.split('\n');
  if (line > lines.length) return result;

  const contextStart = Math.max(0, line - 2);
  const contextEnd = Math.min(lines.length, line + 1);
  result += '<br><br><strong>上下文：</strong><pre style="background:#f5f5f5;padding:8px;border-radius:4px;margin-top:5px;overflow-x:auto;">';

  for (let index = contextStart; index < contextEnd; index += 1) {
    const lineNumber = index + 1;
    const isErrorLine = lineNumber === line;
    const prefix = isErrorLine ? '<strong style="color:red;">→ ' : '  ';
    const suffix = isErrorLine ? '</strong>' : '';
    result += `${prefix}${lineNumber}: ${escapeHtml(lines[index])}${suffix}\n`;
  }

  return result + '</pre>';
};
