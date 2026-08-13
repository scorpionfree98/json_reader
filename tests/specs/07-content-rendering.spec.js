import { formatInEditor, formatInSplit, getControlValue, resetWorkspace, safeClick, selectControlValue, toggleLayuiCheckbox, waitForText, waitForVisibility } from '../helpers/utils.js';
import {
  createDeeplyNestedCase,
  createLargeCase,
  createLargeFlatCase,
  createOversizedHtmlCase,
  hostileContentCases,
  imageCases,
  serializeCase,
  validCases
} from '../fixtures/json-cases.js';

const RICH_PREVIEW_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

const startHostilePreviewObserver = async (expectedFrames) => {
  await browser.execute((frameCount, messageType) => {
    window.__hostilePreviewCleanup?.();

    const state = { expectedFrames: frameCount, loadedFrames: 0, messages: [] };
    const registeredFrames = new WeakSet();
    const onMessage = event => {
      if (event.data?.type === messageType) state.messages.push(event.data);
    };
    const registerFrame = frame => {
      if (!(frame instanceof HTMLIFrameElement) || registeredFrames.has(frame)) return;
      registeredFrames.add(frame);
      frame.addEventListener('load', () => {
        state.loadedFrames += 1;
      }, { once: true });
    };
    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        if (node.matches('.html-inline-preview')) registerFrame(node);
        node.querySelectorAll('.html-inline-preview').forEach(registerFrame);
      }));
    });

    window.addEventListener('message', onMessage);
    observer.observe(document.body, { childList: true, subtree: true });
    window.__hostilePreviewState = state;
    window.__hostilePreviewCleanup = () => {
      observer.disconnect();
      window.removeEventListener('message', onMessage);
    };
  }, expectedFrames, hostileContentCases.messageType);
};

const waitForHostilePreviewsToLoad = async () => {
  await browser.waitUntil(
    () => browser.execute(() => {
      const state = window.__hostilePreviewState;
      return state && state.loadedFrames >= state.expectedFrames;
    }),
    { timeout: 5000, timeoutMsg: '恶意 HTML 预览 iframe 未完成加载' }
  );
};

const enableRichContent = async (mode) => {
  if (mode === 'editor') {
    await browser.execute(() => window.layui?.form?.render('checkbox'));
    await toggleLayuiCheckbox('renderHtml');
    return;
  }

  await browser.execute(() => {
    const checkbox = document.querySelector('#splitRenderHtml');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const waitForNestedObjectCount = async (count, timeout = 15000) => {
  await browser.waitUntil(
    () => browser.execute(expected =>
      document.querySelectorAll('#tree-view .tree-node .tree-node').length >= expected,
    count),
    { timeout, timeoutMsg: `树视图未渲染 ${count} 个嵌套对象外壳` }
  );
};

const expandNestedObject = async (index) => {
  await browser.execute(targetIndex => {
    const node = document.querySelectorAll('#tree-view .tree-node .tree-node')[targetIndex];
    const toggle = node?.querySelector(':scope > .tree-collection-header > .tree-toggle');
    if (!toggle) throw new Error(`未找到第 ${targetIndex} 个嵌套对象`);
    if (toggle.getAttribute('data-collapsed') === 'true') toggle.click();
  }, index);
};

describe('内容渲染与安全边界', () => {
  beforeEach(async () => {
    await browser.execute(() => {
      window.__hostilePreviewCleanup?.();
      delete window.__hostilePreviewCleanup;
      delete window.__hostilePreviewState;
      const main = document.querySelector('#renderHtml');
      const split = document.querySelector('#splitRenderHtml');
      if (main) main.checked = false;
      if (split) split.checked = false;
    });
    await resetWorkspace('editor');
  });

  afterEach(async () => {
    await browser.execute(() => {
      ['#splitParseJsonString', '#splitRenderHtml'].forEach(selector => {
        const checkbox = document.querySelector(selector);
        if (!checkbox?.checked) return;
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
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

  it('分屏可先解析字符串类型json再渲染内部富内容', async () => {
    const inner = JSON.stringify({ content: '<table><tr><td>联合渲染</td></tr></table>' });
    await formatInSplit(JSON.stringify(inner));
    await browser.execute(() => {
      const parse = document.querySelector('#splitParseJsonString');
      const rich = document.querySelector('#splitRenderHtml');
      parse.checked = true;
      parse.dispatchEvent(new Event('change', { bubbles: true }));
      rich.checked = true;
      rich.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await waitForVisibility('#tree-view .html-inline-preview');
    const preview = await browser.execute(() =>
      document.querySelector('#tree-view .html-inline-preview')?.getAttribute('srcdoc') || '');
    expect(preview).toContain('联合渲染');

  });

  [
    { mode: 'editor', container: '#json-display', pasteButton: '#pasteBtn', input: '#sourceText', format: formatInEditor },
    { mode: 'split', container: '#tree-view', pasteButton: '#splitPasteBtn', input: '#splitSourceText', format: formatInSplit }
  ].forEach(({ mode, container, pasteButton, input, format }) => {
    it(`${mode === 'editor' ? '编辑器' : '分屏'} HTML 卡片应保留换行、切换源码并复制完整原文`, async () => {
      const html = '<section>第一行\\n第二行<table>\\r\\n<tr><td>单元格\\t内容</td></tr>\\n</table></section>';
      await format(JSON.stringify({ content: html }));
      await enableRichContent(mode);
      await waitForVisibility(`${container} .html-preview-card`);

      const initial = await browser.execute(selector => {
        const card = document.querySelector(`${selector} .html-preview-card`);
        return {
          source: card.querySelector('.html-preview-source').textContent,
          srcdoc: card.querySelector('.html-inline-preview').getAttribute('srcdoc')
        };
      }, container);
      expect(initial.source).toBe(html);
      expect(initial.srcdoc).toContain('white-space:pre-wrap');
      expect(initial.srcdoc).toContain('第一行\n第二行');
      expect(initial.srcdoc).toContain('单元格\t内容');
      expect(initial.srcdoc).not.toContain('第一行\\n第二行');

      await safeClick(`${container} .html-preview-tab:nth-child(2)`);
      expect(await browser.execute(selector =>
        !document.querySelector(`${selector} .html-preview-source`).classList.contains('hidden'), container)).toBe(true);

      await safeClick(`${container} .html-preview-copy`);
      await waitForText('.custom-toast, .layui-layer-msg', '已复制');
      await safeClick(pasteButton);
      expect(await getControlValue(input)).toBe(html);
    });
  });

  [
    { mode: 'editor', container: '#json-display', format: formatInEditor },
    { mode: 'split', container: '#tree-view', format: formatInSplit }
  ].forEach(({ mode, container, format }) => {
    it(`${mode === 'editor' ? '编辑器' : '分屏'}富内容应使用严格沙箱且不执行恶意脚本`, async () => {
      const hostileValues = Object.values(hostileContentCases.executableHtml);
      await format(JSON.stringify(hostileContentCases.executableHtml));
      await startHostilePreviewObserver(hostileValues.length);
      await enableRichContent(mode);
      await waitForHostilePreviewsToLoad();

      const securityState = await browser.execute((selector, expectedCsp) => {
        const frames = Array.from(document.querySelectorAll(`${selector} .html-inline-preview`));
        return {
          frameCount: frames.length,
          sandboxValues: frames.map(frame => frame.getAttribute('sandbox')),
          hasRestrictiveCsp: frames.every(frame => (frame.getAttribute('srcdoc') || '')
            .includes(`Content-Security-Policy\" content=\"${expectedCsp}`)),
          messages: window.__hostilePreviewState?.messages || []
        };
      }, container, RICH_PREVIEW_CSP);

      expect(securityState.frameCount).toBe(hostileValues.length);
      expect(securityState.sandboxValues).toEqual(hostileValues.map(() => ''));
      expect(securityState.hasRestrictiveCsp).toBe(true);
      expect(securityState.messages).toEqual([]);
    });

    it(`${mode === 'editor' ? '编辑器' : '分屏'}不应为异常或不支持的 Data URL 创建图片预览`, async () => {
      await format(JSON.stringify(hostileContentCases.unsafeImageValues));
      await enableRichContent(mode);
      await browser.waitUntil(
        () => browser.execute(selector => Boolean(document.querySelector(`${selector} .json-string, ${selector} .tree-string`)), container),
        { timeout: 5000, timeoutMsg: '异常图片数据未完成文本渲染' }
      );

      const previewCount = await browser.execute(selector =>
        document.querySelectorAll(`${selector} .image-preview-source, ${selector} .inline-image-preview`).length,
      container);
      expect(previewCount).toBe(0);
    });
  });

  it('超大 HTML 字符串应降级为文本而不是创建 iframe', async () => {
    await formatInEditor(JSON.stringify({ oversized: createOversizedHtmlCase() }));
    await toggleLayuiCheckbox('renderHtml');
    await browser.waitUntil(
      () => browser.execute(() => Boolean(document.querySelector('#json-display .json-string'))),
      { timeout: 10000, timeoutMsg: '超大 HTML 未在限制时间内完成降级渲染' }
    );
    expect((await $$('#json-display .html-inline-preview')).length).toBe(0);
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
    await waitForNestedObjectCount(250);
    await expandNestedObject(249);
    await waitForText('#tree-view', 'item-249', 15000);
    expect(Date.now() - startedAt).toBeLessThan(15000);
  });

  it('展开全部不应强制生成尚未加载的大型分支', async () => {
    await formatInSplit(JSON.stringify(createLargeCase(500)));
    await waitForNestedObjectCount(500);
    await safeClick('#splitExpandAll');

    const state = await browser.execute(() => ({
      nestedNodes: document.querySelectorAll('#tree-view .tree-node .tree-node').length,
      nestedValues: document.querySelectorAll('#tree-view .tree-node .tree-item').length,
      lazyBranches: document.querySelectorAll('#tree-view .tree-node .tree-toggle[data-collapsed="true"]').length
    }));
    expect(state).toEqual({ nestedNodes: 500, nestedValues: 0, lazyBranches: 500 });
  });

  it('超大集合应分批渲染，后加载节点仍可双击复制', async () => {
    await formatInSplit(JSON.stringify(createLargeCase(1200)));
    await waitForNestedObjectCount(500);
    expect(await browser.execute(() =>
      document.querySelectorAll('#tree-view .tree-node .tree-node').length)).toBe(500);

    await safeClick('#tree-view .tree-load-more');
    await safeClick('#tree-view .tree-load-more');
    await waitForNestedObjectCount(1200);
    await expandNestedObject(1199);
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

  it('大型扁平对象也应遵守 500 个节点的分批渲染约定', async () => {
    await formatInSplit(JSON.stringify(createLargeFlatCase()));
    await waitForText('#tree-view', 'key-499', 15000);
    expect(await $('#tree-view').getText()).not.toContain('key-1199');

    await safeClick('#tree-view .tree-load-more');
    await safeClick('#tree-view .tree-load-more');
    await waitForText('#tree-view', 'key-1199', 15000);
    expect((await $$('#tree-view .tree-load-more')).length).toBe(0);
  });

  it('超深对象应显示深度限制而不是导致渲染栈溢出', async () => {
    await formatInSplit(JSON.stringify(createDeeplyNestedCase()));
    await waitForText('#tree-view', 'max depth reached', 10000);
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
