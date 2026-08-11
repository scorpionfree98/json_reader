import katex from 'katex';
import 'katex/dist/katex.min.css';

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export const hasLatex = (value: string): boolean =>
  value.includes('$') || /\\(?:frac|times)\b|\{(?:frac|times)\}/.test(value);

export const renderLatexString = (value: string): string => {
  try {
    const formulaPattern = /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g;
    let result = '';
    let lastIndex = 0;

    for (const match of value.matchAll(formulaPattern)) {
      const token = match[0];
      const index = match.index ?? 0;
      const displayMode = token.startsWith('$$');
      const tex = token.slice(displayMode ? 2 : 1, displayMode ? -2 : -1);
      result += escapeHtml(value.slice(lastIndex, index));
      result += `<span class="${displayMode ? 'latex-block' : 'latex-inline'}">${katex.renderToString(tex, {
        displayMode,
        throwOnError: false,
        output: 'html'
      })}</span>`;
      lastIndex = index + token.length;
    }

    return result + escapeHtml(value.slice(lastIndex));
  } catch (error) {
    console.error('KaTeX Render Error', error);
    return escapeHtml(value);
  }
};
