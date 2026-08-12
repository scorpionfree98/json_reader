import $ from 'jquery';
import {
  bindImagePreviewEvents,
  createHtmlPreviewCard,
  createSandboxedHtmlPreview,
  detectImagePreview,
  markImagePreview,
  MAX_HTML_PREVIEW_LENGTH,
  MAX_IMAGE_PREVIEW_BYTES
} from '../contentPreview';

const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const MINIMAL_JPEG = '/9j/2Q==';

const bytesToBase64 = (bytes: number[]): string =>
  btoa(String.fromCharCode(...bytes));
const asciiBytes = (value: string): number[] =>
  Array.from(value, character => character.charCodeAt(0));

describe('createSandboxedHtmlPreview', () => {
  test('普通文本不创建 HTML 预览', () => {
    expect(createSandboxedHtmlPreview('plain text')).toBeNull();
  });

  test('超出长度上限时拒绝创建预览', () => {
    const oversized = `<p>${'x'.repeat(MAX_HTML_PREVIEW_LENGTH)}</p>`;
    expect(createSandboxedHtmlPreview(oversized)).toBeNull();
  });

  test('使用空 sandbox 和严格 CSP 创建受限 iframe', () => {
    const $iframe = createSandboxedHtmlPreview('<table><tr><td>safe</td></tr></table>');

    expect($iframe).not.toBeNull();
    expect($iframe!.attr('sandbox')).toBe('');
    expect($iframe!.attr('srcdoc')).toContain("default-src 'none'");
    expect($iframe!.attr('srcdoc')).toContain('img-src data:');
    expect($iframe!.attr('srcdoc')).toContain("style-src 'unsafe-inline'");
    expect($iframe!.attr('srcdoc')).toContain("base-uri 'none'");
    expect($iframe!.attr('srcdoc')).toContain("form-action 'none'");
    expect($iframe!.attr('srcdoc')).not.toContain('blob:');
    expect($iframe!.attr('srcdoc')).not.toContain('allow-scripts');
  });

  test('长度刚好达到上限时仍允许预览', () => {
    const html = `<p>${'x'.repeat(MAX_HTML_PREVIEW_LENGTH - 7)}</p>`;
    expect(createSandboxedHtmlPreview(html)).not.toBeNull();
  });

  test('只在 HTML 文本中展开字面量换行和缩进转义', () => {
    const html = '<a title="大于 > 保留\\n属性">第一行\\r\\n第二行\\t缩进</a>';
    const srcdoc = createSandboxedHtmlPreview(html)!.attr('srcdoc')!;

    expect(srcdoc).toContain('title="大于 > 保留\\n属性"');
    expect(srcdoc).toContain('第一行\n第二行\t缩进');
    expect(srcdoc).not.toContain('第一行\\r\\n第二行\\t缩进');
  });

  test('正文中的孤立小于号不阻断后续转义展开', () => {
    const html = '<p>比较</p> 1 < 2\\n下一行';
    const srcdoc = createSandboxedHtmlPreview(html)!.attr('srcdoc')!;

    expect(srcdoc).toContain('1 < 2\n下一行');
    expect(srcdoc).not.toContain('2\\n下一行');
  });
});

describe('createHtmlPreviewCard', () => {
  test('保留原始换行并可在预览和源码之间切换', () => {
    const html = '<div>第一行\\n第二行</div>';
    const $card = createHtmlPreviewCard(html, { copySource: jest.fn() });

    expect($card).not.toBeNull();
    expect($card!.find('.html-preview-source').text()).toBe(html);
    expect($card!.find('.html-inline-preview').attr('srcdoc')).toContain('第一行\n第二行');
    expect($card!.find('.html-inline-preview').attr('srcdoc')).toContain('white-space:pre-wrap');
    expect($card!.find('.html-preview-source').hasClass('hidden')).toBe(true);

    $card!.find('.html-preview-tab').filter((_, element) => $(element).text() === '源码').trigger('click');
    expect($card!.find('.html-preview-source').hasClass('hidden')).toBe(false);
    expect($card!.find('.html-inline-preview').hasClass('hidden')).toBe(true);

    $card!.find('.html-preview-tab').filter((_, element) => $(element).text() === '预览').trigger('click');
    expect($card!.find('.html-preview-source').hasClass('hidden')).toBe(true);
    expect($card!.find('.html-inline-preview').hasClass('hidden')).toBe(false);
  });

  test('复制按钮只复制完整原始 HTML 一次', () => {
    const copySource = jest.fn();
    const html = '<table>\n<tr><td>完整内容</td></tr>\n</table>';
    const $card = createHtmlPreviewCard(html, { copySource });

    $card!.find('.html-preview-copy').trigger('click');
    expect(copySource).toHaveBeenCalledTimes(1);
    expect(copySource).toHaveBeenCalledWith(html);
  });

  test('普通文本和超大 HTML 不创建卡片', () => {
    const options = { copySource: jest.fn() };
    expect(createHtmlPreviewCard('plain text', options)).toBeNull();
    expect(createHtmlPreviewCard(`<p>${'x'.repeat(MAX_HTML_PREVIEW_LENGTH)}</p>`, options)).toBeNull();
  });
});

describe('detectImagePreview', () => {
  test('识别并规范化允许的 PNG data URL', () => {
    const preview = detectImagePreview(`data:image/png;base64,\n${ONE_PIXEL_PNG}`);
    expect(preview).toEqual({
      src: `data:image/png;base64,${ONE_PIXEL_PNG}`,
      mimeType: 'image/png',
      format: 'PNG'
    });
  });

  test('识别原始 Base64 图片及 MIME 别名', () => {
    expect(detectImagePreview(ONE_PIXEL_PNG)?.format).toBe('PNG');
    expect(detectImagePreview(`data:image/jpg;base64,${MINIMAL_JPEG}`)).toMatchObject({
      mimeType: 'image/jpeg',
      format: 'JPEG'
    });
  });

  test.each([
    ['GIF', 'image/gif', bytesToBase64([...asciiBytes('GIF89a'), ...Array(7).fill(0)])],
    ['WebP', 'image/webp', bytesToBase64([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, ...Array(8).fill(0)
    ])],
    ['BMP', 'image/bmp', bytesToBase64([0x42, 0x4d, ...Array(24).fill(0)])],
    ['ICO', 'image/x-icon', bytesToBase64([0, 0, 1, 0, ...Array(18).fill(0)])]
  ])('按完整文件头识别 %s', (format, mimeType, base64) => {
    expect(detectImagePreview(base64)).toMatchObject({ format, mimeType });
  });

  test('规范化 ICO MIME 别名', () => {
    const ico = bytesToBase64([0, 0, 1, 0, ...Array(18).fill(0)]);
    expect(detectImagePreview(`data:image/vnd.microsoft.icon;base64,${ico}`)).toMatchObject({
      format: 'ICO',
      mimeType: 'image/x-icon'
    });
  });

  test.each([
    `data:image/svg+xml;base64,${ONE_PIXEL_PNG}`,
    `data:text/html;base64,${ONE_PIXEL_PNG}`,
    `data:image/png,${ONE_PIXEL_PNG}`,
    `data:image/png;charset=utf-8;base64,${ONE_PIXEL_PNG}`
  ])('拒绝不安全或畸形 data URL: %s', value => {
    expect(detectImagePreview(value)).toBeNull();
  });

  test('拒绝声明 MIME 与真实图片签名不一致的 data URL', () => {
    expect(detectImagePreview(`data:image/jpeg;base64,${ONE_PIXEL_PNG}`)).toBeNull();
    expect(detectImagePreview(`data:image/png;base64,${MINIMAL_JPEG}`)).toBeNull();
  });

  test.each([
    'not base64',
    'AAAA',
    'QUJDRA=',
    'AB==',
    `data:image/png;base64,${ONE_PIXEL_PNG.slice(0, -1)}!`,
    'data:image/png;base64,'
  ])('拒绝非法、非规范或没有图片签名的 Base64: %s', value => {
    expect(detectImagePreview(value)).toBeNull();
  });

  test('拒绝只有部分 WebP 文件头的数据', () => {
    const riffWithoutWebp = btoa(`RIFF${'\0'.repeat(20)}`);
    expect(detectImagePreview(riffWithoutWebp)).toBeNull();
  });

  test('拒绝超过解码大小上限的图片', () => {
    const oversized = 'iVBORw0KGgo' + 'AAAA'.repeat(Math.ceil(MAX_IMAGE_PREVIEW_BYTES / 3));
    expect(detectImagePreview(oversized)).toBeNull();
  });

  test('Base64 解码器异常时安全拒绝预览', () => {
    const decode = jest.spyOn(globalThis, 'atob').mockImplementation(() => {
      throw new Error('decode failed');
    });
    expect(detectImagePreview(ONE_PIXEL_PNG)).toBeNull();
    decode.mockRestore();
  });
});

describe('markImagePreview', () => {
  test('只为有效图片添加可访问的预览标记', () => {
    const $valid = $('<span>');
    const $invalid = $('<span>');

    expect(markImagePreview($valid, ONE_PIXEL_PNG)?.format).toBe('PNG');
    expect($valid.hasClass('image-preview-source')).toBe(true);
    expect($valid.attr('tabindex')).toBe('0');
    expect($valid.data('image-preview')).toMatchObject({ mimeType: 'image/png' });

    expect(markImagePreview($invalid, 'not an image')).toBeNull();
    expect($invalid.hasClass('image-preview-source')).toBe(false);
  });
});

describe('bindImagePreviewEvents', () => {
  afterEach(() => {
    jest.useRealTimers();
    $(document).off('.imagePreview');
    $('.image-preview-source, #image-preview-popover').remove();
  });

  test('聚焦、移动、加载和失败事件更新悬浮预览', () => {
    const $source = $('<span>').appendTo(document.body);
    markImagePreview($source, ONE_PIXEL_PNG);
    bindImagePreviewEvents();
    bindImagePreviewEvents();

    $source.trigger('focusin');
    const $popover = $('#image-preview-popover');
    const $image = $popover.find('img');
    expect($('#image-preview-popover')).toHaveLength(1);
    expect($popover.hasClass('visible')).toBe(true);
    expect($popover.find('.image-preview-meta').text()).toContain('加载中');
    expect($image.attr('src')).toContain('data:image/png;base64,');

    $image.trigger('load');
    expect($popover.find('.image-preview-meta').text()).toMatch(/PNG · \d+ × \d+/);

    $source.trigger($.Event('mousemove', { clientX: 20, clientY: 30 }));
    expect(Number.parseInt($popover.css('left'), 10)).toBeGreaterThanOrEqual(12);
    expect(Number.parseInt($popover.css('top'), 10)).toBeGreaterThanOrEqual(12);

    $image.trigger('error');
    expect($popover.find('.image-preview-meta').text()).toBe('图片数据无效，无法预览');
  });

  test('离开来源后隐藏并清理图片资源', () => {
    jest.useFakeTimers();
    const $source = $('<span>').appendTo(document.body);
    markImagePreview($source, ONE_PIXEL_PNG);
    bindImagePreviewEvents();
    $source.trigger('mouseenter');
    expect($('#image-preview-popover').hasClass('visible')).toBe(true);

    $source.trigger('mouseleave');
    jest.advanceTimersByTime(50);
    expect($('#image-preview-popover').hasClass('visible')).toBe(false);
    expect($('#image-preview-popover img').attr('src')).toBeUndefined();
  });

  test('来源仍保持焦点时不隐藏预览', () => {
    jest.useFakeTimers();
    const $source = $('<span>').appendTo(document.body);
    markImagePreview($source, ONE_PIXEL_PNG);
    bindImagePreviewEvents();
    $source[0].focus();
    $source.trigger('focusin');
    $source.trigger('mouseleave');
    jest.advanceTimersByTime(50);
    expect($('#image-preview-popover').hasClass('visible')).toBe(true);
  });

  test('没有图片数据的伪来源不会打开预览', () => {
    const $source = $('<span class="image-preview-source">').appendTo(document.body);
    bindImagePreviewEvents();
    $source.trigger('focusin');
    expect($('#image-preview-popover').hasClass('visible')).toBe(false);
  });
});
