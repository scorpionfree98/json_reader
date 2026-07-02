import { safeClick, setInputValue } from '../helpers/utils.js';

describe('TreeView 功能 (TODO #1)', () => {
  before(async () => {
    await browser.pause(1000);
    const splitBtn = await $('[data-mode="split"]');
    if (await splitBtn.isDisplayed()) {
      await safeClick('[data-mode="split"]');
      await browser.pause(1000);
    }
  });

  it('切换到分屏模式后 TreeView 应可见', async () => {
    const treeView = await $('#tree-view');
    const isDisplayed = await treeView.isDisplayed();
    expect(isDisplayed).toBe(true);
  });

  it('输入嵌套 JSON 后应渲染 TreeView', async () => {
    const nestedJson = JSON.stringify({
      level1: {
        level2: {
          level3: {
            value: 'deep'
          }
        }
      }
    }, null, 2);

    await setInputValue('#splitSourceText', nestedJson);
    await safeClick('#splitFormatBtn');
    await browser.pause(1000);

    const treeView = await $('#tree-view');
    const text = await treeView.getText();
    expect(text).toContain('level1');
    expect(text).toContain('deep');
  });

  it('勾选转义后换行符应正确渲染', async () => {
    const jsonWithNewlines = JSON.stringify({
      message: '第一行\\n第二行\\n第三行',
      description: '多行\\n文本'
    }, null, 2);

    await safeClick('[data-mode="editor"]');
    await browser.pause(500);
    const explainCheckbox = await $('#explain');
    if (!(await explainCheckbox.isSelected())) {
      await safeClick('#explain');
      await browser.pause(500);
    }

    await safeClick('[data-mode="split"]');
    await browser.pause(1000);
    await setInputValue('#splitSourceText', jsonWithNewlines);
    await safeClick('#splitFormatBtn');
    await browser.pause(1000);

    const treeStrings = await $$('#tree-view .tree-string');
    expect(treeStrings.length).toBeGreaterThan(0);

    let foundPreWrap = false;
    for (const elem of treeStrings) {
      const style = await elem.getAttribute('style');
      if (style && style.includes('white-space')) {
        foundPreWrap = true;
        break;
      }
    }

    expect(foundPreWrap).toBe(true);
  });

  it('TreeView 应显示换行后的文本内容', async () => {
    const treeView = await $('#tree-view');
    const text = await treeView.getText();
    expect(text).toContain('第一行');
    expect(text).toContain('第二行');
    expect(text).toContain('第三行');
  });
});
