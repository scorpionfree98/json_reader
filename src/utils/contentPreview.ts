import $ from 'jquery';

export interface ImagePreviewInfo {
  src: string;
  mimeType: string;
  format: string;
}

const MAX_IMAGE_PREVIEW_BASE64_LENGTH = 20 * 1024 * 1024;
const imageSignatures: Array<{ prefix: string; mimeType: string; format: string }> = [
  { prefix: 'iVBORw0KGgo', mimeType: 'image/png', format: 'PNG' },
  { prefix: '/9j/', mimeType: 'image/jpeg', format: 'JPEG' },
  { prefix: 'R0lGOD', mimeType: 'image/gif', format: 'GIF' },
  { prefix: 'UklGR', mimeType: 'image/webp', format: 'WebP' },
  { prefix: 'Qk', mimeType: 'image/bmp', format: 'BMP' },
  { prefix: 'AAABAA', mimeType: 'image/x-icon', format: 'ICO' }
];

export const isRichContentEnabled = (): boolean =>
  Boolean($('#renderHtml').prop('checked') || $('#splitRenderHtml').prop('checked'));

export const createSandboxedHtmlPreview = (html: string): JQuery | null => {
  if (!/<\/?[a-z][^>]*>/i.test(html)) return null;
  const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:"><style>body{padding:10px;margin:0;font:14px sans-serif;color:#222}table{border-collapse:collapse}th,td{padding:6px 9px;border:1px solid #cbd5cb}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
  return $('<iframe>')
    .addClass('html-inline-preview')
    .attr('title', 'HTML 富内容预览')
    .attr('sandbox', '')
    .attr('srcdoc', documentHtml);
};

export const detectImagePreview = (value: string): ImagePreviewInfo | null => {
  const trimmed = value.trim();
  const dataUrlMatch = trimmed.match(/^data:(image\/(?:png|jpe?g|gif|webp|bmp|x-icon|vnd\.microsoft\.icon));base64,([a-z0-9+/=\s]+)$/i);

  if (dataUrlMatch) {
    const base64 = dataUrlMatch[2].replace(/\s/g, '');
    if (base64.length > MAX_IMAGE_PREVIEW_BASE64_LENGTH) return null;
    const mimeType = dataUrlMatch[1].toLowerCase().replace('image/jpg', 'image/jpeg');
    const format = mimeType.includes('jpeg') ? 'JPEG' : mimeType.split('/')[1].replace('x-icon', 'ICO').toUpperCase();
    return { src: `data:${mimeType};base64,${base64}`, mimeType, format };
  }

  const base64 = trimmed.replace(/\s/g, '');
  if (base64.length < 32 || base64.length > MAX_IMAGE_PREVIEW_BASE64_LENGTH || !/^[a-z0-9+/]+={0,2}$/i.test(base64)) {
    return null;
  }

  const signature = imageSignatures.find(item => base64.startsWith(item.prefix));
  return signature
    ? { src: `data:${signature.mimeType};base64,${base64}`, mimeType: signature.mimeType, format: signature.format }
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
