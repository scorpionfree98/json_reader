import { isElementVisible, setInputValue, switchToEditor } from '../helpers/utils.js';

describe('复制格式功能', () => {
  before(async () => {
    await browser.pause(2000);
  });

  describe('统一复制格式', () => {
    before(async () => {
      await switchToEditor();
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

      expect(await isElementVisible('#customFormatContainer')).toBe(true);

      await setInputValue('#customKeyFormat', '.field_{key}');
      await setInputValue('#customIndexFormat', '.item_{index}');

      const keyFormatValue = await browser.execute(() => {
        return document.querySelector('#customKeyFormat').value;
      });

      const indexFormatValue = await browser.execute(() => {
        return document.querySelector('#customIndexFormat').value;
      });

      expect(keyFormatValue).toBe('.field_{key}');
      expect(indexFormatValue).toBe('.item_{index}');
    });
  });

});
