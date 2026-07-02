/**
 * 测试辅助工具函数
 */

/**
 * 等待元素可见并可交互
 */
export async function waitForElement(selector, timeout = 5000) {
  const element = await $(selector);
  await element.waitForDisplayed({ timeout });
  return element;
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
  const element = await $(selector);
  await element.clearValue();
  await element.setValue(value);
  await browser.pause(200);
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
  const element = await $(selector);
  return await element.getHTML();
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
