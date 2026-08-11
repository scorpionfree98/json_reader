import { formatInEditor, formatInSplit, getControlValue, resetWorkspace, safeClick, selectControlValue, toggleLayuiCheckbox, waitForText, waitForVisibility } from '../helpers/utils.js';
import { createLargeCase, imageCases, serializeCase, validCases } from '../fixtures/json-cases.js';

describe('内容渲染与安全边界', () => {
  beforeEach(async () => {
    await browser.execute(() => {
      const main = document.querySelector('#renderHtml');
      const split = document.querySelector('#splitRenderHtml');
      if (main) main.checked = false;
      if (split) split.checked = false;
    });
    await resetWorkspace('editor');
  });

  it('尖括号内容应作为文本显示而不是 HTML', async () => {
    await formatInEditor(serializeCase(validCases.unicodeAndMarkup));
    await waitForText('#json-display', '<image>');
    const text = await $('#json-display').getText();
    expect(text).toContain('<div>content</div>');
    expect(await $('#json-display image').isExisting()).toBe(false);
    expect(await $('#json-display div:not([class])').isExisting()).toBe(false);
  });

  it('树形数组不应显示伪造的索引 key', async () => {
    await formatInSplit(serializeCase(validCases.nested));
    await waitForText('#tree-view', 'reviewer');
    const keyTexts = await browser.execute(() =>
      Array.from(document.querySelectorAll('#tree-view .tree-key'), element => element.textContent || '')
    );
    expect(keyTexts.some(text => /^\d+$/.test(text.trim()))).toBe(false);
  });

  it('标准图片 Data URL 应显示悬浮预览', async () => {
    await formatInSplit(JSON.stringify({ avatar: imageCases.dataUrl }));
    const source = await waitForVisibility('#tree-view .image-preview-source');
    expect(await source.getText()).toContain(imageCases.expectedFormat);
    await source.moveTo();
    await browser.execute(() => document.querySelector('#tree-view .image-preview-source').focus());
    await browser.pause(150);
    const previewState = await browser.execute(() => {
      const preview = document.querySelector('#image-preview-popover');
      const imageSource = document.querySelector('#tree-view .image-preview-source');
      return {
        active: document.activeElement === imageSource,
        className: preview?.className,
        display: preview ? getComputedStyle(preview).display : null,
        metadata: preview?.querySelector('.image-preview-meta')?.textContent
      };
    });
    expect(previewState).toEqual(expect.objectContaining({
      active: true,
      className: expect.stringContaining('visible'),
      display: 'block',
      metadata: expect.stringContaining(imageCases.expectedDimensions)
    }));
  });

  it('无前缀图片 Base64 可识别，普通 Base64 不应误判', async () => {
    await formatInSplit(JSON.stringify({ image: imageCases.rawBase64, text: imageCases.nonImageBase64 }));
    const sources = await $$('#tree-view .image-preview-source');
    expect(sources.length).toBe(1);
  });

  it('编辑器视图勾选后可就地渲染图片和表格', async () => {
    await formatInEditor(serializeCase(validCases.unicodeAndMarkup));
    await toggleLayuiCheckbox('renderHtml');
    await waitForVisibility('#json-display .html-inline-preview');
    const preview = await browser.execute(() => {
      const frames = Array.from(document.querySelectorAll('#json-display .html-inline-preview'));
      return {
        sandboxed: frames.every(frame => frame.getAttribute('sandbox') === ''),
        documents: frames.map(frame => frame.getAttribute('srcdoc') || '').join('\n'),
        inlineImages: document.querySelectorAll('#json-display .inline-image-preview').length
      };
    });
    expect(preview.sandboxed).toBe(true);
    expect(preview.documents).toContain('<table>');
    expect(preview.documents).toContain('<img alt="像素图"');
    expect(preview.inlineImages).toBeGreaterThan(0);
  });

  it('分屏视图的富内容复选框也可触发渲染', async () => {
    await formatInSplit(serializeCase(validCases.unicodeAndMarkup));
    await browser.execute(() => {
      const checkbox = document.querySelector('#splitRenderHtml');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitForVisibility('#tree-view .html-inline-preview');
    expect(await browser.execute(() => document.querySelectorAll('#tree-view .inline-image-preview').length)).toBeGreaterThan(0);
  });

  it('树节点双击应将完整值写入系统剪贴板', async () => {
    const longValue = `copy-${'x'.repeat(160)}`;
    await formatInSplit(JSON.stringify({ message: longValue }));
    await waitForVisibility('#tree-view .tree-string');
    await browser.execute(() => {
      document.querySelector('#tree-view .tree-string')
        .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    await waitForText('.custom-toast, .layui-layer-msg', '已复制');
    await safeClick('#splitPasteBtn');
    expect(await getControlValue('#splitSourceText')).toBe(longValue);
  });

  [
    { format: 'default', expected: '["a.b"]["space key"][0]["quote\\"key"]' },
    { format: 'dot', expected: 'a.b.space key[0].quote"key' },
    { format: 'jsonpath', expected: '$.a.b.space key[0].quote"key' },
    { format: 'bracket', expected: `['a.b']['space key'][0]['quote"key']` },
    { format: 'python', expected: `.get('a.b').get('space key')[0].get('quote"key')` },
    { format: 'custom', expected: '<a.b><space key>(0)<quote"key>' }
  ].forEach(({ format, expected }) => {
    it(`特殊键应按 ${format} 格式复制完整路径`, async () => {
      if (format === 'custom') {
        await browser.execute(() => {
          document.querySelector('#customKeyFormat').value = '<{key}>';
          document.querySelector('#customIndexFormat').value = '({index})';
        });
      }
      await selectControlValue('#copyFormat', format);
      await formatInSplit(serializeCase(validCases.specialKeys));
      await browser.execute(() => {
        const key = Array.from(document.querySelectorAll('#tree-view .tree-key'))
          .find(element => element.textContent === '"quote"key"');
        key.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });
      await waitForText('.custom-toast, .layui-layer-msg', '已复制');
      await safeClick('#splitPasteBtn');
      expect(await getControlValue('#splitSourceText')).toBe(expected);
    });
  });

  it('较大节点集应在限制时间内完成树渲染', async () => {
    const startedAt = Date.now();
    await formatInSplit(JSON.stringify(createLargeCase(250)));
    await waitForText('#tree-view', 'item-249', 15000);
    expect(Date.now() - startedAt).toBeLessThan(15000);
  });

  it('超大集合应分批渲染，后加载节点仍可双击复制', async () => {
    await formatInSplit(JSON.stringify(createLargeCase(1200)));
    await waitForText('#tree-view', 'item-499', 15000);
    expect(await $('#tree-view').getText()).not.toContain('item-1199');

    await safeClick('#tree-view .tree-load-more');
    await safeClick('#tree-view .tree-load-more');
    await waitForText('#tree-view', 'item-1199', 15000);
    expect((await $$('#tree-view .tree-load-more')).length).toBe(0);

    await browser.execute(() => {
      const value = Array.from(document.querySelectorAll('#tree-view .tree-string'))
        .find(element => element.textContent === '"item-1199"');
      value.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    await waitForText('.custom-toast, .layui-layer-msg', '已复制');
    await safeClick('#splitPasteBtn');
    expect(await getControlValue('#splitSourceText')).toBe('item-1199');
  });

  it('格式化失败后不应保留上一棵有效树', async () => {
    await formatInSplit('{"valid":{"value":1}}');
    await waitForText('#tree-view', 'value');
    await formatInSplit('{"invalid":,}');
    await waitForText('#tree-view', 'JSON 格式错误');
    expect(await $('#tree-view').getText()).not.toContain('value');
  });

  it('清空后不应保留高亮结果', async () => {
    await formatInEditor('{"stale":"content"}');
    await waitForText('#json-display', 'stale');
    await safeClick('#clearBtn');
    expect(await $('#json-display').getText()).toBe('');
  });

  it('顶层 null 应显示在树中并可复制原值', async () => {
    await formatInSplit('null');
    await waitForVisibility('#tree-view .tree-null');
    await browser.execute(() => {
      document.querySelector('#tree-view .tree-null')
        .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    await waitForText('.custom-toast, .layui-layer-msg', '已复制');
    await safeClick('#splitPasteBtn');
    expect(await getControlValue('#splitSourceText')).toBe('null');
  });
});
