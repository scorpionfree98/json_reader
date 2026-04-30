import { safeClick, setInputValue } from '../helpers/utils.js';

describe('剪贴板功能', () => {
  before(async () => {
    await browser.pause(2000);
  });

  describe('编辑器模式剪贴板', () => {
    before(async () => {
      const editorMode = await $('#editor-mode');
      const isVisible = await editorMode.isDisplayed();
      if (!isVisible) {
        await safeClick('[data-mode="editor"]');
        await browser.pause(500);
      }
    });

    beforeEach(async () => {
      await safeClick('#clearBtn');
      await browser.pause(500);
    });

    it('TreeView 双击 key 复制路径', async () => {
      const json = JSON.stringify({ user: { name: 'Alice' } }, null, 2);
      await setInputValue('#sourceText', json);
      await safeClick('#formatBtn');
      await browser.pause(1000);

      const treeKeys = await $$('.tree-key');
      expect(treeKeys.length).toBeGreaterThan(0);

      await treeKeys[0].doubleClick();
      await browser.pause(500);
    });

    it('TreeView 双击 value 复制值', async () => {
      const json = JSON.stringify({ name: 'Alice' }, null, 2);
      await setInputValue('#sourceText', json);
      await safeClick('#formatBtn');
      await browser.pause(1000);

      const treeValues = await $$('.tree-value');
      expect(treeValues.length).toBeGreaterThan(0);

      await treeValues[0].doubleClick();
      await browser.pause(500);
    });
  });

  describe('分屏模式剪贴板', () => {
    before(async () => {
      const splitMode = await $('#split-mode');
      const isVisible = await splitMode.isDisplayed();
      if (!isVisible) {
        await safeClick('[data-mode="split"]');
        await browser.pause(500);
      }
    });

    after(async () => {
      const editorMode = await $('#editor-mode');
      const isVisible = await editorMode.isDisplayed();
      if (!isVisible) {
        await safeClick('[data-mode="editor"]');
        await browser.pause(500);
      }
    });

    beforeEach(async () => {
      await safeClick('#splitClearBtn');
      await browser.pause(500);
    });

    it('分屏模式 TreeView 双击 key 复制路径', async () => {
      const json = JSON.stringify({ user: { name: 'Bob' } }, null, 2);
      await setInputValue('#splitSourceText', json);
      await safeClick('#splitFormatBtn');
      await browser.pause(1000);

      const treeKeys = await $$('.tree-key');
      expect(treeKeys.length).toBeGreaterThan(0);

      await treeKeys[0].doubleClick();
      await browser.pause(500);
    });

    it('分屏模式 TreeView 双击 value 复制值', async () => {
      const json = JSON.stringify({ name: 'Bob' }, null, 2);
      await setInputValue('#splitSourceText', json);
      await safeClick('#splitFormatBtn');
      await browser.pause(1000);

      const treeValues = await $$('.tree-value');
      expect(treeValues.length).toBeGreaterThan(0);

      await treeValues[0].doubleClick();
      await browser.pause(500);
    });
  });
});
