/**
 * 测试辅助工具函数
 */

/**
 * 等待元素可见并可交互
 */
export async function waitForElement(selector, timeout = 5000) {
  await browser.waitUntil(
    () => browser.execute((value) => Boolean(document.querySelector(value)), selector),
    { timeout, timeoutMsg: `${selector} 未出现` }
  );
  return $(selector);
}

export async function isElementVisible(selector) {
  return browser.execute((value) => {
    const element = document.querySelector(value);
    if (!element) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }, selector);
}

export async function waitForVisibility(selector, visible = true, timeout = 5000) {
  await browser.waitUntil(
    async () => (await isElementVisible(selector)) === visible,
    { timeout, timeoutMsg: `${selector} 可见状态未变为 ${visible}` }
  );
  return $(selector);
}

/**
 * 安全点击元素（等待可见后点击）
 */
export async function safeClick(selector, timeout = 5000) {
  const element = await waitForElement(selector, timeout);
  await element.click();
  await browser.pause(300);
}

/**
 * 设置输入框值
 */
export async function setInputValue(selector, value) {
  await waitForElement(selector);
  await browser.execute((target, nextValue) => {
    const element = document.querySelector(target);
    element.value = nextValue;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector, value);
  await browser.waitUntil(
    () => browser.execute((target) => document.querySelector(target)?.value, selector).then(current => current === value),
    { timeout: 5000, timeoutMsg: `${selector} 输入值未写入` }
  );
}

export async function getControlValue(selector) {
  return browser.execute((target) => document.querySelector(target)?.value ?? null, selector);
}

export async function selectControlValue(selector, value) {
  await waitForElement(selector);
  await browser.execute((target, nextValue) => {
    const element = document.querySelector(target);
    element.value = nextValue;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector, value);
  await browser.waitUntil(
    async () => (await getControlValue(selector)) === value,
    { timeout: 3000, timeoutMsg: `${selector} 选项未切换为 ${value}` }
  );
}

export async function waitForText(selector, expected, timeout = 5000) {
  await browser.waitUntil(async () => {
    const text = await browser.execute((target) => Array.from(document.querySelectorAll(target))
      .map(element => element.textContent || '')
      .join('\n'), selector);
    return typeof expected === 'string' ? text.includes(expected) : expected.test(text);
  }, { timeout, timeoutMsg: `${selector} 未出现预期文本: ${expected}` });
  return $(selector);
}

export async function switchToEditor() {
  if (await isElementVisible('#editor-mode')) return;
  await safeClick('#split-mode [data-mode="editor"]');
  await waitForVisibility('#sourceText');
}

export async function switchToSplit() {
  if (await isElementVisible('#split-mode')) return;
  await safeClick('#main-toolbar [data-mode="split"]');
  await waitForVisibility('#splitSourceText');
}

export async function resetWorkspace(mode = 'editor') {
  if (mode === 'split') {
    await switchToSplit();
    await safeClick('#splitClearBtn');
  } else {
    await switchToEditor();
    await safeClick('#clearBtn');
  }
}

export async function toggleLayuiCheckbox(id) {
  const control = await waitForElement(`#${id} + .layui-form-checkbox`);
  await control.click();
  await browser.waitUntil(async () => (await $(`#${id}`).isSelected()) === (await control.getAttribute('class')).includes('layui-form-checked'), {
    timeout: 3000,
    timeoutMsg: `${id} 状态未同步`
  });
}

export async function formatInEditor(value) {
  await switchToEditor();
  await setInputValue('#sourceText', value);
  await safeClick('#formatBtn');
}

export async function formatInSplit(value) {
  await switchToSplit();
  await setInputValue('#splitSourceText', value);
  await safeClick('#splitFormatBtn');
}

/**
 * 获取元素文本内容
 */
export async function getElementText(selector) {
  const element = await $(selector);
  return await element.getText();
}

/**
 * 获取元素 HTML 内容
 */
export async function getElementHTML(selector) {
  return browser.execute((target) => document.querySelector(target)?.innerHTML ?? '', selector);
}

/**
 * 检查元素是否存在
 */
export async function elementExists(selector) {
  const elements = await $$(selector);
  return elements.length > 0;
}

/**
 * 检查复选框状态
 */
export async function isChecked(selector) {
  const element = await $(selector);
  return await element.isSelected();
}
