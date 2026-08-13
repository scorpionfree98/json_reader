#!/usr/bin/env node
/**
 * 完整自测 - 覆盖所有修复项和已知功能
 * 适配 LayUI 自定义表单元素
 */
import { chromium } from 'playwright';

const BASE_URL = 'http://127.0.0.1:5173';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('='.repeat(80));
  console.log('JSON Formatter 全面自测');
  console.log('='.repeat(80));

  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const page = await browser.newContext({ viewport: { width: 1200, height: 900 } }).then(c => c.newPage());

  let pass = 0, fail = 0;
  const failures = [];

  async function t(name, fn) {
    try { await fn(); console.log(`✅ ${name}`); pass++; }
    catch (e) { console.log(`❌ ${name}\n   ${e.message.split('\n')[0]}`); fail++; failures.push(name); }
  }

  // 辅助：切换到高亮结果
  async function toEditor() {
    if (!(await page.locator('#highlight-result').isVisible())) {
      await page.locator('#highlightViewBtn').click();
      await sleep(500);
    }
  }
  // 辅助：切换到树形结果
  async function toSplit() {
    if (!(await page.locator('#tree-result').isVisible())) {
      await page.locator('#treeViewBtn').click();
      await sleep(500);
    }
  }
  // 辅助：点击 LayUI checkbox（通过文本匹配）
  async function clickLayuiCheckbox(text) {
    await page.locator(`.layui-form-checkbox:has-text("${text}")`).click();
    await sleep(300);
  }

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 10000 });
    await sleep(1500);
    console.log('页面加载成功\n');

    // ========== 第 1 组：基础 JSON 功能 ==========
    console.log('【1】基础 JSON 功能');
    console.log('-'.repeat(80));

    await t('1.1 输入并格式化正确 JSON', async () => {
      await page.fill('#sourceText', '{"name":"Alice","age":30}');
      await page.click('#formatBtn');
      await sleep(800);
      const r = await page.locator('#valid-result').textContent();
      if (!r.includes('格式正确')) throw new Error('未显示格式正确');
    });

    await t('1.2 清空按钮', async () => {
      await page.click('#clearBtn');
      await sleep(300);
      if ((await page.inputValue('#sourceText')) !== '') throw new Error('未清空');
    });

    await t('1.3 格式化非 JSON 应报错', async () => {
      await page.fill('#sourceText', 'not json');
      await page.click('#formatBtn');
      await sleep(800);
      const r = await page.locator('#valid-result').textContent();
      if (r.includes('格式正确')) throw new Error('不应显示格式正确');
    });

    // ========== 第 2 组：JSON 错误定位 (TODO #3) ==========
    console.log('\n【2】JSON 错误定位');
    console.log('-'.repeat(80));

    await t('2.1 错误 JSON 应显示位置/行号/上下文/标记', async () => {
      await page.fill('#sourceText', '{\n  "a": 1,\n  "b": 2\n  "c": 3\n}');
      await page.click('#formatBtn');
      await sleep(800);
      const html = await page.locator('#valid-result').innerHTML();
      if (!html.includes('位置')) throw new Error('缺少位置');
      if (!html.includes('行')) throw new Error('缺少行号');
      if (!html.includes('上下文')) throw new Error('缺少上下文');
      if (!html.includes('→')) throw new Error('缺少错误标记');
    });

    // ========== 第 3 组：结果视图切换 ==========
    console.log('\n【3】结果视图切换');
    console.log('-'.repeat(80));

    await t('3.1 切换到树形结果', async () => {
      await page.fill('#sourceText', '{"test":"view"}');
      await page.click('#formatBtn');
      await sleep(500);
      await toSplit();
      if (!(await page.locator('#tree-result').isVisible())) throw new Error('树形结果未显示');
    });

    await t('3.2 唯一输入框应保留内容', async () => {
      const v = await page.inputValue('#sourceText');
      if (!v.includes('test')) throw new Error('内容未同步');
    });

    await t('3.3 切换到高亮结果', async () => {
      await toEditor();
      if (!(await page.locator('#highlight-result').isVisible())) throw new Error('高亮结果未显示');
    });

    await t('3.4 再切回树形结果', async () => {
      await toSplit();
      if (!(await page.locator('#tree-result').isVisible())) throw new Error('树形结果未显示');
    });

    // ========== 第 4 组：TreeView 显示 ==========
    console.log('\n【4】TreeView 显示');
    console.log('-'.repeat(80));

    await t('4.1 分屏模式输入 JSON 后 TreeView 应渲染', async () => {
      await page.fill('#sourceText', '{"user":{"name":"Bob","age":25}}');
      await page.click('#formatBtn');
      await sleep(1000);
      const text = await page.locator('#tree-view').textContent();
      if (!text.includes('Bob')) throw new Error('TreeView 未渲染');
    });

    await t('4.2 TreeView 不应显示"格式错误"', async () => {
      const text = await page.locator('#tree-view').textContent();
      if (text.includes('格式错误')) throw new Error('误报格式错误');
    });

    await t('4.3 切回编辑器再切回分屏，TreeView 应保留', async () => {
      await toEditor();
      await sleep(300);
      await toSplit();
      await sleep(500);
      const text = await page.locator('#tree-view').textContent();
      if (!text.includes('Bob')) throw new Error('TreeView 内容丢失');
    });

    await t('4.4 折叠全部', async () => {
      await page.click('#splitCollapseAll');
      await sleep(500);
      const collapsed = await page.locator('#tree-view .tree-children.collapsed').count();
      if (collapsed === 0) throw new Error('未折叠');
    });

    await t('4.5 展开全部', async () => {
      await page.click('#splitExpandAll');
      await sleep(500);
      const collapsed = await page.locator('#tree-view .tree-children.collapsed').count();
      if (collapsed > 0) throw new Error('未完全展开');
    });

    // ========== 第 5 组：TreeView 换行符 (TODO #1) ==========
    console.log('\n【5】TreeView 换行符');
    console.log('-'.repeat(80));

    await t('5.1 勾选统一转义复选框', async () => {
      const checkbox = page.locator('#explain');
      if (!(await checkbox.isChecked())) await clickLayuiCheckbox('转义');
      if (!(await checkbox.isChecked())) throw new Error('转义未激活');
    });

    await t('5.2 输入含换行符 JSON 并格式化', async () => {
      const json = JSON.stringify({ message: "第一行\\n第二行\\n第三行" }, null, 2);
      await page.fill('#sourceText', json);
      await page.click('#formatBtn');
      await sleep(1000);
    });

    await t('5.3 TreeView 应设置 white-space 样式', async () => {
      const treeStrings = await page.locator('#tree-view .tree-string').all();
      if (treeStrings.length === 0) throw new Error('无 tree-string 元素');
      let found = false;
      for (const el of treeStrings) {
        const style = await el.getAttribute('style');
        if (style && style.includes('white-space')) { found = true; break; }
      }
      if (!found) throw new Error('未设置 white-space');
    });

    await t('5.4 TreeView 应显示换行后的文本', async () => {
      const text = await page.locator('#tree-view').textContent();
      if (!text.includes('第一行')) throw new Error('未显示第一行');
      if (!text.includes('第二行')) throw new Error('未显示第二行');
    });

    // ========== 第 6 组：主题切换 ==========
    console.log('\n【6】主题切换');
    console.log('-'.repeat(80));

    await t('6.1 分屏模式主题切换', async () => {
      const before = await page.evaluate(() => document.body.classList.contains('dark-mode'));
      await page.click('#themeToggle');
      await sleep(500);
      const after = await page.evaluate(() => document.body.classList.contains('dark-mode'));
      if (before === after) throw new Error('主题未切换');
    });

    await t('6.2 切回编辑器模式主题切换', async () => {
      await toEditor();
      await sleep(300);
      const before = await page.evaluate(() => document.body.classList.contains('dark-mode'));
      await page.click('#themeToggle');
      await sleep(500);
      const after = await page.evaluate(() => document.body.classList.contains('dark-mode'));
      if (before === after) throw new Error('主题未切换');
    });

    // ========== 第 7 组：LayUI Checkbox ==========
    console.log('\n【7】LayUI Checkbox 功能');
    console.log('-'.repeat(80));

    await t('7.1 转义 checkbox 切换', async () => {
      const before = await page.evaluate(() => document.querySelector('#explain').checked);
      await clickLayuiCheckbox('转义');
      const after = await page.evaluate(() => document.querySelector('#explain').checked);
      if (before === after) throw new Error('转义未切换');
    });

    await t('7.2 置顶 checkbox 切换', async () => {
      const before = await page.evaluate(() => document.querySelector('#topCheck').checked);
      await clickLayuiCheckbox('置顶');
      await sleep(500);
      const after = await page.evaluate(() => document.querySelector('#topCheck').checked);
      if (before === after) throw new Error('置顶未切换');
      // 切回
      await clickLayuiCheckbox('置顶');
      await sleep(500);
    });

    await t('7.3 开机自启 checkbox 存在', async () => {
      const exists = await page.locator('.layui-form-checkbox:has-text("开机自启")').count();
      if (exists === 0) throw new Error('开机自启 checkbox 不存在');
    });

    await t('7.4 禁用更新 checkbox 存在', async () => {
      const exists = await page.locator('.layui-form-checkbox:has-text("禁用更新")').count();
      if (exists === 0) throw new Error('禁用更新 checkbox 不存在');
    });

    // ========== 第 8 组：窗口控制按钮 ==========
    console.log('\n【8】窗口控制按钮');
    console.log('-'.repeat(80));

    await t('8.1 最小化按钮存在', async () => {
      if (!(await page.locator('#minimize').isVisible())) throw new Error('不可见');
    });

    await t('8.2 最大化按钮存在', async () => {
      if (!(await page.locator('#maximizeBtn').isVisible())) throw new Error('不可见');
    });

    await t('8.3 关闭按钮存在', async () => {
      if (!(await page.locator('#close').isVisible())) throw new Error('不可见');
    });

    await t('8.4 窗口按钮只保留一套', async () => {
      if (await page.locator('#minimize').count() !== 1) throw new Error('最小化按钮重复');
      if (await page.locator('#maximizeBtn').count() !== 1) throw new Error('最大化按钮重复');
      if (await page.locator('#close').count() !== 1) throw new Error('关闭按钮重复');
    });

    // ========== 第 9 组：复制格式 ==========
    console.log('\n【9】复制格式');
    console.log('-'.repeat(80));

    await t('9.1 统一复制格式选择器可用', async () => {
      const copyFormat = page.locator('#copyFormat');
      if (!(await copyFormat.count())) throw new Error('不存在');
      await page.evaluate(() => {
        const select = document.querySelector('#copyFormat');
        select.value = 'python';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      if (await copyFormat.inputValue() !== 'python') throw new Error('无法切换格式');
    });

    await t('9.2 切回编辑器检查 LayUI select', async () => {
      await toEditor();
      await sleep(300);
      const exists = await page.locator('.layui-form-select').count();
      if (exists === 0) throw new Error('LayUI select 不存在');
    });

    // ========== 第 10 组：边界情况 ==========
    console.log('\n【10】边界情况');
    console.log('-'.repeat(80));

    await t('10.1 大 JSON', async () => {
      const big = {};
      for (let i = 0; i < 50; i++) big[`k${i}`] = `v${i}`;
      await page.fill('#sourceText', JSON.stringify(big));
      await page.click('#formatBtn');
      await sleep(800);
      const r = await page.locator('#valid-result').textContent();
      if (!r.includes('格式正确')) throw new Error('大 JSON 失败');
    });

    await t('10.2 Unicode 和 emoji', async () => {
      await page.fill('#sourceText', '{"emoji":"🎉","中文":"你好"}');
      await page.click('#formatBtn');
      await sleep(800);
      const r = await page.locator('#valid-result').textContent();
      if (!r.includes('格式正确')) throw new Error('Unicode 失败');
    });

    await t('10.3 空对象和空数组', async () => {
      await page.fill('#sourceText', '{"a":{},"b":[]}');
      await page.click('#formatBtn');
      await sleep(800);
      const r = await page.locator('#valid-result').textContent();
      if (!r.includes('格式正确')) throw new Error('空对象/数组失败');
    });

    await t('10.4 null/boolean/number', async () => {
      await page.fill('#sourceText', '{"n":null,"b":true,"f":3.14}');
      await page.click('#formatBtn');
      await sleep(800);
      const r = await page.locator('#valid-result').textContent();
      if (!r.includes('格式正确')) throw new Error('特殊值失败');
    });

    await t('10.5 分屏模式直接输入并格式化', async () => {
      await toSplit();
      await sleep(300);
      await page.fill('#sourceText', '{"direct":"input","in":"split"}');
      await page.click('#formatBtn');
      await sleep(1000);
      const text = await page.locator('#tree-view').textContent();
      if (!text.includes('direct')) throw new Error('分屏直接输入格式化失败');
      if (text.includes('格式错误')) throw new Error('误报格式错误');
    });

    await t('10.6 分屏清空按钮', async () => {
      await page.click('#clearBtn');
      await sleep(300);
      if ((await page.inputValue('#sourceText')) !== '') throw new Error('未清空');
    });

    console.log('\n等待 2 秒后关闭...');
    await sleep(2000);

  } finally {
    await Promise.race([browser.close(), sleep(5000)]);
  }

  console.log('\n' + '='.repeat(80));
  console.log(`通过: ${pass}  失败: ${fail}  总计: ${pass + fail}  成功率: ${((pass / (pass + fail)) * 100).toFixed(1)}%`);
  if (failures.length) {
    console.log('\n失败项:');
    failures.forEach(f => console.log(`  - ${f}`));
  }
  console.log('='.repeat(80));
  return fail === 0 ? 0 : 1;
}

run().then(c => process.exit(c)).catch(e => { console.error('测试崩溃:', e); process.exit(1); });
