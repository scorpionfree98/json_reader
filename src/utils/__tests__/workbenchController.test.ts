import { WorkbenchController } from '../workbenchController';

describe('WorkbenchController', () => {
  test('相同输入只解析一次', () => {
    const workbench = new WorkbenchController({ source: '{"value":1}' });
    expect(workbench.parse().ok).toBe(true);
    expect(workbench.parse().ok).toBe(true);
    expect(workbench.getParseCount()).toBe(1);
  });

  test('模式和纯渲染选项变化不会使解析缓存失效', () => {
    const workbench = new WorkbenchController({ source: '{"value":1}' });
    workbench.parse();
    workbench.setMode('split');
    workbench.setExplain(true);
    workbench.setRichContent(true);
    workbench.parse();
    expect(workbench.getParseCount()).toBe(1);
    expect(workbench.snapshot).toMatchObject({ mode: 'split', explain: true, richContent: true });
  });

  test('输入变化会使解析缓存失效', () => {
    const workbench = new WorkbenchController({ source: '{"value":1}' });
    workbench.parse();
    workbench.setSource('{"value":2}');
    expect(workbench.parse()).toMatchObject({ ok: true, value: { value: 2 } });
    expect(workbench.getParseCount()).toBe(2);
  });

  test('字符串类型 JSON 选项变化会使解析缓存失效', () => {
    const inner = JSON.stringify({ value: 1 });
    const workbench = new WorkbenchController({ source: JSON.stringify(inner) });
    expect(workbench.parse()).toMatchObject({ ok: true, value: inner });
    workbench.setParseJsonString(true);
    expect(workbench.parse()).toMatchObject({ ok: true, value: { value: 1 } });
    expect(workbench.getParseCount()).toBe(2);
  });

  test('提交格式化结果后复用已知解析值', () => {
    const workbench = new WorkbenchController({ source: '{"value":1}' });
    const result = workbench.parse();
    expect(result.ok).toBe(true);
    workbench.commitFormattedResult({ value: 1 }, '{\n  "value": 1\n}');
    expect(workbench.parse()).toMatchObject({ ok: true, value: { value: 1 } });
    expect(workbench.getParseCount()).toBe(1);
  });

  test('设置相同输入和相同解析选项不会使缓存失效', () => {
    const workbench = new WorkbenchController({ source: 'null' });
    workbench.parse();
    workbench.setSource('null');
    workbench.setParseJsonString(false);
    workbench.parse();
    expect(workbench.getParseCount()).toBe(1);
  });

  test('公开状态与渲染选项来自同一状态源', () => {
    const workbench = new WorkbenchController({
      source: '{"value":1}',
      mode: 'split',
      explain: true,
      richContent: true
    });

    expect(workbench.source).toBe('{"value":1}');
    expect(workbench.mode).toBe('split');
    expect(workbench.renderOptions).toEqual({ explain: true, richContent: true });
  });
});
