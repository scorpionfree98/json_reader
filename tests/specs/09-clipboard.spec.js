import {
  getControlValue,
  safeClick,
  selectControlValue,
  setInputValue,
  switchToEditor,
  switchToSplit,
  toggleLayuiCheckbox,
  waitForText,
  waitForVisibility
} from '../helpers/utils.js';
import { imageCases } from '../fixtures/json-cases.js';

const waitForCopyAndPaste = async (pasteButton, input, expected) => {
  await waitForText('.custom-toast, .layui-layer-msg', '已复制');
  await safeClick(pasteButton);
  expect(await getControlValue(input)).toBe(expected);
};

const dispatchDoubleClick = async (selector, index = 0) => {
  await browser.execute((target, targetIndex) => {
    const element = document.querySelectorAll(target)[targetIndex];
    if (!element) throw new Error(`未找到双击目标: ${target}[${targetIndex}]`);
    element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
  }, selector, index);
};

describe('剪贴板功能', () => {
  before(async () => {
    await browser.pause(2000);
  });

  describe('编辑器模式剪贴板', () => {
    before(async () => {
      await switchToEditor();
    });

    beforeEach(async () => {
      await safeClick('#clearBtn');
      await browser.pause(500);
    });

    it('TreeView 双击 key 复制路径', async () => {
      const json = JSON.stringify({ user: { name: 'Alice' } }, null, 2);
      await selectControlValue('#copyFormat', 'jsonpath');
      await setInputValue('#sourceText', json);
      await safeClick('#formatBtn');

      const treeKeys = await $$('#json-display .json-key');
      expect(treeKeys.length).toBeGreaterThan(0);

      await dispatchDoubleClick('#json-display .json-key');
      await waitForCopyAndPaste('#pasteBtn', '#sourceText', '$.user');
    });

    it('TreeView 双击 value 复制含空白字符的完整值', async () => {
      const value = 'Alice\n第二行\t末尾';
      const json = JSON.stringify({ name: value }, null, 2);
      await setInputValue('#sourceText', json);
      await safeClick('#formatBtn');

      const treeValues = await $$('#json-display .json-string');
      expect(treeValues.length).toBeGreaterThan(0);

      await dispatchDoubleClick('#json-display .json-string');
      await waitForCopyAndPaste('#pasteBtn', '#sourceText', value);
    });

    it('富内容图片双击复制完整 Data URL', async () => {
      await setInputValue('#sourceText', JSON.stringify({ image: imageCases.dataUrl }));
      await safeClick('#formatBtn');
      await browser.execute(() => window.layui?.form?.render('checkbox'));
      await toggleLayuiCheckbox('renderHtml');
      await waitForVisibility('#json-display .inline-image-preview');
      await dispatchDoubleClick('#json-display .inline-image-preview');
      await waitForCopyAndPaste('#pasteBtn', '#sourceText', imageCases.dataUrl);
      await toggleLayuiCheckbox('renderHtml');
    });

    it('顶层 null、false 和 0 应复制其 JSON 文本而不是空字符串', async () => {
      const cases = [
        { source: 'null', selector: '#json-display .json-null' },
        { source: 'false', selector: '#json-display .json-boolean' },
        { source: '0', selector: '#json-display .json-number' }
      ];

      for (const item of cases) {
        await setInputValue('#sourceText', item.source);
        await safeClick('#formatBtn');
        await dispatchDoubleClick(item.selector);
        await waitForCopyAndPaste('#pasteBtn', '#sourceText', item.source);
      }
    });
  });

  describe('分屏模式剪贴板', () => {
    before(async () => {
      await switchToSplit();
    });

    after(async () => {
      await switchToEditor();
    });

    beforeEach(async () => {
      await safeClick('#splitClearBtn');
      await browser.pause(500);
    });

    it('分屏模式 TreeView 双击 key 复制路径', async () => {
      const json = JSON.stringify({ user: { name: 'Bob' } }, null, 2);
      await selectControlValue('#splitCopyFormat', 'jsonpath');
      await setInputValue('#splitSourceText', json);
      await safeClick('#splitFormatBtn');

      const treeKeys = await $$('.tree-key');
      expect(treeKeys.length).toBeGreaterThan(0);

      await dispatchDoubleClick('#tree-view .tree-key');
      await waitForCopyAndPaste('#splitPasteBtn', '#splitSourceText', '$.user');
    });

    it('分屏模式 TreeView 双击 value 复制含空白字符的完整值', async () => {
      const value = 'Bob\n第二行\t末尾';
      const json = JSON.stringify({ name: value }, null, 2);
      await setInputValue('#splitSourceText', json);
      await safeClick('#splitFormatBtn');

      const treeValues = await $$('.tree-value');
      expect(treeValues.length).toBeGreaterThan(0);

      await dispatchDoubleClick('#tree-view .tree-value');
      await waitForCopyAndPaste('#splitPasteBtn', '#splitSourceText', value);
    });

    it('分屏富内容图片双击复制完整 Data URL', async () => {
      await setInputValue('#splitSourceText', JSON.stringify({ image: imageCases.dataUrl }));
      await safeClick('#splitFormatBtn');
      await browser.execute(() => {
        const checkbox = document.querySelector('#splitRenderHtml');
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await waitForVisibility('#tree-view .inline-image-preview');
      await dispatchDoubleClick('#tree-view .inline-image-preview');
      await waitForCopyAndPaste('#splitPasteBtn', '#splitSourceText', imageCases.dataUrl);
    });
  });
});
