import { waitForElement, safeClick, setInputValue, getElementHTML } from '../helpers/utils.js';

describe('复制格式功能', () => {
  before(async () => {
    await browser.pause(2000);
  });

  describe('编辑器模式复制格式', () => {
    before(async () => {
      const editorMode = await $('#editor-mode');
      const isVisible = await editorMode.isDisplayed();
      if (!isVisible) {
        await safeClick('[data-mode="editor"]');
        await browser.pause(500);
      }
    });

    it('切换 5 种内置格式', async () => {
      const formats = ['default', 'dot', 'jsonpath', 'bracket', 'python'];

      for (const format of formats) {
        await browser.execute((value) => {
          document.querySelector('#copyFormat').value = value;
          const event = new Event('change', { bubbles: true });
          document.querySelector('#copyFormat').dispatchEvent(event);
        }, format);

        await browser.pause(300);

        const currentValue = await browser.execute(() => {
          return document.querySelector('#copyFormat').value;
        });

        expect(currentValue).toBe(format);
      }
    });

    it('自定义格式设置', async () => {
      await browser.execute((value) => {
        document.querySelector('#copyFormat').value = value;
        const event = new Event('change', { bubbles: true });
        document.querySelector('#copyFormat').dispatchEvent(event);
      }, 'custom');

      await browser.pause(300);

      const customContainer = await $('#customFormatContainer');
      const isVisible = await customContainer.isDisplayed();
      expect(isVisible).toBe(true);

      await setInputValue('#customKeyFormat', 'key_{0}');
      await setInputValue('#customIndexFormat', '[{0}]');

      const keyFormatValue = await browser.execute(() => {
        return document.querySelector('#customKeyFormat').value;
      });

      const indexFormatValue = await browser.execute(() => {
        return document.querySelector('#customIndexFormat').value;
      });

      expect(keyFormatValue).toBe('key_{0}');
      expect(indexFormatValue).toBe('[{0}]');
    });
  });

  describe('分屏模式复制格式', () => {
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

    it('分屏模式复制格式弹窗打开', async () => {
      await safeClick('#splitCopyFormatBtn');
      await browser.pause(500);

      const layerCount = await browser.execute(() => {
        return document.querySelectorAll('.layui-layer').length;
      });

      expect(layerCount).toBeGreaterThan(0);
    });

    it('分屏模式复制格式弹窗关闭', async () => {
      await safeClick('#splitCopyFormatBtn');
      await browser.pause(500);

      const closeButton = await $('.layui-layer-close');
      await closeButton.click();
      await browser.pause(500);

      const layerCount = await browser.execute(() => {
        return document.querySelectorAll('.layui-layer').length;
      });

      expect(layerCount).toBe(0);
    });
  });
});
