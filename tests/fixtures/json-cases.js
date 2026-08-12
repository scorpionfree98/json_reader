const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const HOSTILE_MESSAGE_TYPE = 'json-reader-hostile-executed';

export const validCases = {
  primitives: {
    value: {
      string: 'hello',
      integer: 42,
      decimal: 3.14,
      negative: -7,
      boolean: true,
      nothing: null
    },
    expectedText: ['string', 'hello', '3.14', 'true', 'null']
  },
  nested: {
    value: {
      user: {
        name: '张三',
        roles: ['admin', 'reviewer'],
        profile: { city: '上海', active: true }
      }
    },
    expectedText: ['user', 'roles', 'admin', '上海']
  },
  emptyCollections: {
    value: { emptyObject: {}, emptyArray: [] },
    expectedText: ['emptyObject', 'emptyArray']
  },
  unicodeAndMarkup: {
    value: {
      emoji: '🎉🚀',
      chinese: '你好，世界',
      markup: '<image>',
      htmlLike: '<div>content</div>',
      htmlButton: '<button type="button">预览按钮</button>',
      htmlTable: '<table><tr><th>名称</th><th>数量</th></tr><tr><td>图片</td><td>1</td></tr></table>',
      htmlImage: `<img alt="像素图" src="data:image/png;base64,${ONE_PIXEL_PNG}">`,
      base64Image: ONE_PIXEL_PNG,
      separators: '\u2028 and \u2029'
    },
    expectedText: ['🎉', '你好，世界', '<image>', '<div>content</div>', '<button type="button">预览按钮</button>']
  },
  escapedContent: {
    value: {
      escapedLines: '第一行\\n第二行\\n第三行',
      escapedTab: '左侧\\t右侧',
      quote: '他说："你好"',
      slash: 'C:\\temp\\file.json'
    },
    expectedText: ['第一行', '第二行', '第三行']
  },
  specialKeys: {
    value: {
      'a.b': { 'space key': [{ 'quote"key': 'value' }] },
      '中文键': true
    },
    expectedText: ['a.b', 'space key', 'quote"key', '中文键']
  }
};

export const invalidCases = {
  missingComma: {
    input: '{\n  "a": 1,\n  "b": 2\n  "c": 3\n}',
    expectedLine: 4
  },
  trailingComma: {
    input: '{"a": 1,}',
    expectedMessage: '位置'
  },
  unclosedObject: {
    input: '{"user": {"name": "Alice"}',
    expectedMessage: '位置'
  },
  invalidEscape: {
    input: '{"path": "C:\\invalid\q"}',
    expectedMessage: '位置'
  },
  plainText: {
    input: 'this is not json',
    expectedMessage: '位置'
  }
};

export const imageCases = {
  dataUrl: `data:image/png;base64,${ONE_PIXEL_PNG}`,
  rawBase64: ONE_PIXEL_PNG,
  expectedFormat: 'PNG',
  expectedDimensions: '1 × 1',
  nonImageBase64: 'VGhpcyBpcyBqdXN0IHRleHQsIG5vdCBhbiBpbWFnZS4='
};

export const hostileContentCases = {
  messageType: HOSTILE_MESSAGE_TYPE,
  executableHtml: {
    scriptTag: `<script>parent.postMessage({ type: '${HOSTILE_MESSAGE_TYPE}', source: 'script' }, '*')</script><p>script fixture</p>`,
    eventAttribute: `<img src="invalid://hostile-image" onerror="parent.postMessage({ type: '${HOSTILE_MESSAGE_TYPE}', source: 'event-attribute' }, '*')">`,
    javascriptUrl: `<a href="javascript:parent.postMessage({ type: '${HOSTILE_MESSAGE_TYPE}', source: 'javascript-url' }, '*')">dangerous link</a>`,
    svgMarkup: `<svg xmlns="http://www.w3.org/2000/svg" onload="parent.postMessage({ type: '${HOSTILE_MESSAGE_TYPE}', source: 'svg-onload' }, '*')"><script>parent.postMessage({ type: '${HOSTILE_MESSAGE_TYPE}', source: 'svg-script' }, '*')</script><text>svg fixture</text></svg>`
  },
  unsafeImageValues: {
    malformedPayload: 'data:image/png;base64,AAAA',
    malformedPadding: 'data:image/png;base64,iVBORw0KGgo===',
    unsupportedAvif: 'data:image/avif;base64,AAAA',
    svgDataUrl: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')}`,
    htmlDataUrl: `data:text/html;base64,${Buffer.from(`<script>parent.postMessage({ type: '${HOSTILE_MESSAGE_TYPE}', source: 'html-data-url' }, '*')</script>`).toString('base64')}`
  }
};

export const createOversizedHtmlCase = (contentLength = 1024 * 1024) =>
  `<table><tbody><tr><td>${'x'.repeat(contentLength)}</td></tr></tbody></table>`;

export const createDeeplyNestedCase = (depth = 80) => {
  const root = {};
  let current = root;
  for (let level = 0; level < depth; level += 1) {
    current[`level-${level}`] = {};
    current = current[`level-${level}`];
  }
  current.value = 'deep-leaf';
  return root;
};

export const createLargeFlatCase = (count = 1200) => Object.fromEntries(
  Array.from({ length: count }, (_, index) => [`key-${index}`, `value-${index}`])
);

export const createLargeCase = (count = 1000) => ({
  generatedAt: '2026-08-11T00:00:00.000Z',
  items: Array.from({ length: count }, (_, index) => ({
    id: index,
    name: `item-${index}`,
    enabled: index % 2 === 0,
    tags: [`group-${index % 10}`, 'fixture']
  }))
});

export const serializeCase = (testCase) => JSON.stringify(testCase.value, null, 2);
