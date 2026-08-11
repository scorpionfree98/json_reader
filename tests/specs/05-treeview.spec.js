import { formatInSplit, isElementVisible, resetWorkspace, safeClick, waitForText } from '../helpers/utils.js';
import { serializeCase, validCases } from '../fixtures/json-cases.js';

describe('TreeView 功能 (TODO #1)', () => {
  beforeEach(async () => {
    await resetWorkspace('split');
  });

  it('切换到分屏模式后 TreeView 应可见', async () => {
    expect(await isElementVisible('#tree-view')).toBe(true);
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

    await formatInSplit(nestedJson);
    await waitForText('#tree-view', 'deep');

    const treeView = await $('#tree-view');
    const text = await treeView.getText();
    expect(text).toContain('level1');
    expect(text).toContain('deep');
  });

  it('单独折叠内层节点不应影响根节点', async () => {
    await formatInSplit(JSON.stringify({
      level1: { level2: { level3: { value: 'deep' } } }
    }));
    await waitForText('#tree-view', 'deep');

    const collapsedState = await browser.execute(() => {
      const key = Array.from(document.querySelectorAll('#tree-view .tree-key'))
        .find(element => element.textContent === '"level2"');
      const node = key.closest('.tree-node');
      const toggle = node.querySelector(':scope > .tree-collection-header .tree-toggle');
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return {
        nestedCollapsed: toggle.dataset.collapsed,
        nestedChildrenCollapsed: node.querySelector(':scope > .tree-children').classList.contains('collapsed'),
        nestedFooterHidden: node.querySelector(':scope > .tree-collection-footer').classList.contains('hidden'),
        rootCollapsed: document.querySelector('#tree-view .tree-node-root > .tree-collection-header .tree-toggle').dataset.collapsed
      };
    });
    expect(collapsedState).toEqual({
      nestedCollapsed: 'true',
      nestedChildrenCollapsed: true,
      nestedFooterHidden: true,
      rootCollapsed: 'false'
    });

    const expandedState = await browser.execute(() => {
      const key = Array.from(document.querySelectorAll('#tree-view .tree-key'))
        .find(element => element.textContent === '"level2"');
      const node = key.closest('.tree-node');
      const toggle = node.querySelector(':scope > .tree-collection-header .tree-toggle');
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return {
        nestedCollapsed: toggle.dataset.collapsed,
        nestedChildrenCollapsed: node.querySelector(':scope > .tree-children').classList.contains('collapsed'),
        nestedFooterHidden: node.querySelector(':scope > .tree-collection-footer').classList.contains('hidden')
      };
    });
    expect(expandedState).toEqual({
      nestedCollapsed: 'false',
      nestedChildrenCollapsed: false,
      nestedFooterHidden: false
    });
  });

  it('勾选转义后换行符应正确渲染', async () => {
    const jsonWithNewlines = JSON.stringify({
      message: '第一行\\n第二行\\n第三行',
      description: '多行\\n文本'
    }, null, 2);

    const explainBtn = await $('#splitExplainBtn');
    if (!(await explainBtn.getAttribute('class')).includes('active')) await safeClick('#splitExplainBtn');
    await formatInSplit(jsonWithNewlines);
    await waitForText('#tree-view', '第三行');

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
    await formatInSplit(serializeCase(validCases.escapedContent));
    const explainBtn = await $('#splitExplainBtn');
    if (!(await explainBtn.getAttribute('class')).includes('active')) await safeClick('#splitExplainBtn');
    await formatInSplit(serializeCase(validCases.escapedContent));
    const treeView = await $('#tree-view');
    const text = await treeView.getText();
    expect(text).toContain('第一行');
    expect(text).toContain('第二行');
    expect(text).toContain('第三行');
  });
});
