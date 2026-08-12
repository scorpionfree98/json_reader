import $ from 'jquery';

export interface ImagePreviewInfo {
  src: string;
  mimeType: string;
  format: string;
}

export interface HtmlPreviewOptions {
  copySource: (source: string) => void | Promise<void>;
}

export const MAX_HTML_PREVIEW_LENGTH = 256 * 1024;
export const MAX_IMAGE_PREVIEW_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_PREVIEW_BASE64_LENGTH = Math.ceil(MAX_IMAGE_PREVIEW_BYTES / 3) * 4;
const MAX_BASE64_LINE_WHITESPACE = Math.ceil(MAX_IMAGE_PREVIEW_BASE64_LENGTH / 76) * 2;

interface ImageSignature {
  mimeType: string;
  mimeAliases: string[];
  format: string;
  minimumBytes: number;
  matches: (bytes: number[]) => boolean;
}

const imageSignatures: ImageSignature[] = [
  {
    mimeType: 'image/png',
    mimeAliases: ['image/png'],
    format: 'PNG',
    minimumBytes: 33,
    matches: bytes => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((value, index) => bytes[index] === value)
  },
  {
    mimeType: 'image/jpeg',
    mimeAliases: ['image/jpeg', 'image/jpg'],
    format: 'JPEG',
    minimumBytes: 4,
    matches: bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  },
  {
    mimeType: 'image/gif',
    mimeAliases: ['image/gif'],
    format: 'GIF',
    minimumBytes: 13,
    matches: bytes => ['GIF87a', 'GIF89a'].some(signature =>
      [...signature].every((value, index) => bytes[index] === value.charCodeAt(0)))
  },
  {
    mimeType: 'image/webp',
    mimeAliases: ['image/webp'],
    format: 'WebP',
    minimumBytes: 20,
    matches: bytes =>
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  },
  {
    mimeType: 'image/bmp',
    mimeAliases: ['image/bmp'],
    format: 'BMP',
    minimumBytes: 26,
    matches: bytes => bytes[0] === 0x42 && bytes[1] === 0x4d
  },
  {
    mimeType: 'image/x-icon',
    mimeAliases: ['image/x-icon', 'image/vnd.microsoft.icon'],
    format: 'ICO',
    minimumBytes: 22,
    matches: bytes =>
      bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00
  }
];

const normalizeBase64 = (value: string): { base64: string; byteLength: number } | null => {
  if (value.length > MAX_IMAGE_PREVIEW_BASE64_LENGTH + MAX_BASE64_LINE_WHITESPACE) return null;
  const base64 = value.replace(/[\t\n\f\r ]/g, '');
  if (!base64 || base64.length % 4 !== 0 || !/^[a-z0-9+/]+={0,2}$/i.test(base64)) return null;

  const paddingLength = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const lastValue = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    .indexOf(base64[base64.length - paddingLength - 1]);
  if ((paddingLength === 2 && (lastValue & 0x0f) !== 0) ||
      (paddingLength === 1 && (lastValue & 0x03) !== 0)) return null;

  const byteLength = (base64.length / 4) * 3 - paddingLength;
  return byteLength <= MAX_IMAGE_PREVIEW_BYTES ? { base64, byteLength } : null;
};

const detectImageSignature = (base64: string, byteLength: number): ImageSignature | null => {
  try {
    const header = atob(base64.slice(0, 32));
    const bytes = Array.from(header, character => character.charCodeAt(0));
    return imageSignatures.find(signature =>
      byteLength >= signature.minimumBytes && signature.matches(bytes)) || null;
  } catch {
    return null;
  }
};

const expandEscapedWhitespace = (value: string): string => value
  .replace(/\\r\\n/g, '\n')
  .replace(/\\n|\\r/g, '\n')
  .replace(/\\t/g, '\t');

const expandEscapedWhitespaceInHtmlText = (html: string): string => {
  let result = '';
  let textStart = 0;
  let index = 0;

  while (index < html.length) {
    if (html[index] !== '<') {
      index += 1;
      continue;
    }

    result += expandEscapedWhitespace(html.slice(textStart, index));
    const tagStart = index;
    let quote: '"' | "'" | null = null;
    let tagClosed = false;
    index += 1;

    while (index < html.length) {
      const character = html[index];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        index += 1;
        tagClosed = true;
        break;
      }
      index += 1;
    }

    if (!tagClosed) {
      return result + expandEscapedWhitespace(html.slice(tagStart));
    }

    result += html.slice(tagStart, index);
    textStart = index;
  }

  return result + expandEscapedWhitespace(html.slice(textStart));
};

export const createSandboxedHtmlPreview = (html: string): JQuery | null => {
  if (html.length > MAX_HTML_PREVIEW_LENGTH || !/<\/?[a-z][^>]*>/i.test(html)) return null;
  const previewHtml = expandEscapedWhitespaceInHtmlText(html);
  const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>:root{color-scheme:light}*{box-sizing:border-box}body{padding:18px;margin:0;background:#fffefa;color:#26322b;font:14px/1.7 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-spacing:0;border-collapse:separate;border:1px solid #d9dfda;border-radius:8px;overflow:hidden;white-space:normal}th,td{padding:8px 11px;border-right:1px solid #e4e8e5;border-bottom:1px solid #e4e8e5;text-align:left;vertical-align:top}th{background:#f1f4f1;font-weight:700}tr:last-child td{border-bottom:0}th:last-child,td:last-child{border-right:0}img{display:block;max-width:100%;height:auto;margin:8px 0;border-radius:7px}pre,code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}a{color:#176b4d}</style></head><body>${previewHtml}</body></html>`;
  return $('<iframe>')
    .addClass('html-inline-preview')
    .attr('title', 'HTML 富内容预览')
    .attr('sandbox', '')
    .attr('srcdoc', documentHtml);
};

export const createHtmlPreviewCard = (html: string, options: HtmlPreviewOptions): JQuery | null => {
  const $iframe = createSandboxedHtmlPreview(html);
  if (!$iframe) return null;

  const $previewButton = $('<button type="button">')
    .addClass('html-preview-tab active')
    .attr('aria-pressed', 'true')
    .text('预览');
  const $sourceButton = $('<button type="button">')
    .addClass('html-preview-tab')
    .attr('aria-pressed', 'false')
    .text('源码');
  const $copyButton = $('<button type="button">')
    .addClass('html-preview-copy')
    .attr('title', '复制完整 HTML 原文')
    .text('复制原文');
  const $source = $('<code>').addClass('html-preview-source hidden').text(html);

  const showSource = (visible: boolean): void => {
    $iframe.toggleClass('hidden', visible);
    $source.toggleClass('hidden', !visible);
    $previewButton.toggleClass('active', !visible).attr('aria-pressed', String(!visible));
    $sourceButton.toggleClass('active', visible).attr('aria-pressed', String(visible));
  };

  $previewButton.on('click', event => {
    event.stopPropagation();
    showSource(false);
  });
  $sourceButton.on('click', event => {
    event.stopPropagation();
    showSource(true);
  });
  $copyButton.on('click', event => {
    event.preventDefault();
    event.stopPropagation();
    void options.copySource(html);
  });

  return $('<span>')
    .addClass('html-preview-card')
    .append(
      $('<span>').addClass('html-preview-header').append(
        $('<span>').addClass('html-preview-label').text('HTML'),
        $('<span>').addClass('html-preview-actions').append($previewButton, $sourceButton, $copyButton)
      ),
      $('<span>').addClass('html-preview-content').append($iframe, $source)
    );
};

export const detectImagePreview = (value: string): ImagePreviewInfo | null => {
  const trimmed = value.trim();
  const dataUrlMatch = trimmed.match(/^data:([^;,]+);base64,([\s\S]*)$/i);

  if (dataUrlMatch) {
    const declaredMimeType = dataUrlMatch[1].toLowerCase();
    const declaredSignature = imageSignatures.find(signature =>
      signature.mimeAliases.includes(declaredMimeType));
    const normalized = normalizeBase64(dataUrlMatch[2]);
    if (!declaredSignature || !normalized) return null;

    const detectedSignature = detectImageSignature(normalized.base64, normalized.byteLength);
    if (detectedSignature !== declaredSignature) return null;
    return {
      src: `data:${detectedSignature.mimeType};base64,${normalized.base64}`,
      mimeType: detectedSignature.mimeType,
      format: detectedSignature.format
    };
  }

  if (/^data:/i.test(trimmed)) return null;
  const normalized = normalizeBase64(trimmed);
  if (!normalized) return null;

  const signature = detectImageSignature(normalized.base64, normalized.byteLength);
  return signature
    ? {
        src: `data:${signature.mimeType};base64,${normalized.base64}`,
        mimeType: signature.mimeType,
        format: signature.format
      }
    : null;
};

export const markImagePreview = ($element: JQuery, value: string): ImagePreviewInfo | null => {
  const preview = detectImagePreview(value);
  if (preview) {
    $element
      .addClass('image-preview-source')
      .attr('title', `${preview.format} Base64 图片，悬停预览`)
      .attr('tabindex', '0')
      .data('image-preview', preview);
  }
  return preview;
};

const ensureImagePreviewPopover = (): JQuery => $('#image-preview-popover').length
  ? $('#image-preview-popover')
  : $('<div id="image-preview-popover" class="image-preview-popover" role="tooltip">')
      .append($('<div>').addClass('image-preview-canvas').append($('<img>').attr('alt', 'Base64 图片预览')))
      .append($('<div>').addClass('image-preview-meta'))
      .appendTo(document.body);

const positionImagePreview = ($preview: JQuery, clientX: number, clientY: number): void => {
  const gap = 16;
  const margin = 12;
  const width = $preview.outerWidth() || 360;
  const height = $preview.outerHeight() || 260;
  let left = clientX + gap;
  let top = clientY + gap;

  if (left + width > window.innerWidth - margin) left = clientX - width - gap;
  if (top + height > window.innerHeight - margin) top = clientY - height - gap;

  $preview.css({
    left: Math.max(margin, left),
    top: Math.max(margin, top)
  });
};

let imagePreviewHideTimer: ReturnType<typeof setTimeout> | null = null;

const showImagePreview = ($source: JQuery, event: MouseEvent | FocusEvent | JQuery.TriggeredEvent): void => {
  if (imagePreviewHideTimer) {
    clearTimeout(imagePreviewHideTimer);
    imagePreviewHideTimer = null;
  }
  const preview = $source.data('image-preview') as ImagePreviewInfo | undefined;
  if (!preview) return;

  const $preview = ensureImagePreviewPopover();
  const rect = ($source[0] as HTMLElement).getBoundingClientRect();
  const clientX = 'clientX' in event && event.clientX ? event.clientX : rect.right;
  const clientY = 'clientY' in event && event.clientY ? event.clientY : rect.top;
  const $img = $preview.find('img');
  const $meta = $preview.find('.image-preview-meta').text(`${preview.format} · 加载中`);

  $img.off('.imagePreview').on('load.imagePreview', function() {
    const image = this as HTMLImageElement;
    $meta.text(`${preview.format} · ${image.naturalWidth} × ${image.naturalHeight}`);
    positionImagePreview($preview, clientX, clientY);
  }).on('error.imagePreview', () => {
    $meta.text('图片数据无效，无法预览');
  }).attr('src', preview.src);
  $preview.addClass('visible');
  positionImagePreview($preview, clientX, clientY);
};

const hideImagePreview = (): void => {
  if (imagePreviewHideTimer) clearTimeout(imagePreviewHideTimer);
  imagePreviewHideTimer = setTimeout(() => {
    imagePreviewHideTimer = null;
    if ($(document.activeElement).closest('.image-preview-source').length) return;
    ensureImagePreviewPopover().removeClass('visible').find('img').removeAttr('src').off('.imagePreview');
  }, 50);
};

export const bindImagePreviewEvents = (): void => {
  ensureImagePreviewPopover();

  $(document)
    .off('.imagePreview')
    .on('mouseenter.imagePreview focusin.imagePreview', '.image-preview-source', function(event) {
      showImagePreview($(this), event);
    })
    .on('mousemove.imagePreview', '.image-preview-source', function(event) {
      positionImagePreview(ensureImagePreviewPopover(), event.clientX, event.clientY);
    })
    .on('mouseleave.imagePreview focusout.imagePreview', '.image-preview-source', hideImagePreview);
};
