// .github/workflows/scripts/generate-manifest.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES模块中没有 __dirname 和 __filename，需要自己创建
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateManifest() {
  // 从环境变量获取版本号
  const manualVersion = process.env.INPUT_VERSION || '';
  const githubRef = process.env.GITHUB_REF || '';
  const runNumber = process.env.GITHUB_RUN_NUMBER || '';
  const githubEventName = process.env.GITHUB_EVENT_NAME || '';
  const repoOwner = process.env.GITHUB_REPOSITORY_OWNER || 'scorpionfree98';
  const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'json_reader';

  // 确定版本号
  let version;
  if (manualVersion) {
    version = manualVersion.replace(/^v/, '');
    console.log(`使用手动指定版本: ${version}`);
  } else if (githubRef.startsWith('refs/tags/')) {
    version = githubRef.replace('refs/tags/', '').replace(/^v/, '');
    console.log(`使用标签版本: ${version}`);
  } else {
    version = `0.0.0-test-${runNumber}`;
    console.log(`使用测试版本: ${version}`);
  }

  // 从 tauri.conf.json 读取产品名称
  let productName = 'JSON格式化工具';
  try {
    const tauriConfigPath = path.join(__dirname, '../../../src-tauri/tauri.conf.json');
    const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));
    productName = tauriConfig.productName || productName;
  } catch (error) {
    console.warn('无法读取 tauri.conf.json，使用默认产品名称');
  }

  // 创建基础 manifest
  const manifest = {
    version,
    notes: `版本 ${version} 的发布说明`,
    pub_date: new Date().toISOString(),
    platforms: {}
  };

  // 添加平台
  const platforms = [
    {
      key: 'darwin-x86_64',
      sigPath: 'signatures/macos-latest-x64-signature/signature.sig',
      fileName: `${productName}_${version}-macos-x64.dmg`
    },
    {
      key: 'darwin-aarch64',
      sigPath: 'signatures/macos-latest-arm64-signature/signature.sig',
      fileName: `${productName}_${version}-macos-arm64.dmg`
    }
  ];

  // Windows 平台（检查不同签名文件）
  const windowsSigFiles = [
    {
      sigPath: 'signatures/windows-latest-x64-webview2-signature/signature.sig',
      fileName: `${productName}_${version}-windows-x64-webview2.exe`
    },
    {
      sigPath: 'signatures/windows-latest-x64-signature/signature.sig',
      fileName: `${productName}_${version}-windows-x64.exe`
    }
  ];

  for (const { sigPath, fileName } of windowsSigFiles) {
    if (fs.existsSync(sigPath)) {
      platforms.push({
        key: 'windows-x86_64',
        sigPath,
        fileName
      });
      break;
    }
  }

  // 为每个存在的平台文件添加信息
  for (const platform of platforms) {
    if (fs.existsSync(platform.sigPath)) {
      try {
        const signature = fs.readFileSync(platform.sigPath, 'utf8').trim();
        const fileNameEncoded = encodeURIComponent(platform.fileName);
        const url = `https://github.com/${repoOwner}/${repoName}/releases/download/${version}/${fileNameEncoded}`;
        
        manifest.platforms[platform.key] = {
          signature,
          url
        };
        
        console.log(`已添加平台: ${platform.key}`);
      } catch (error) {
        console.warn(`读取 ${platform.key} 签名失败:`, error.message);
      }
    }
  }

  // 如果没有平台，输出警告
  if (Object.keys(manifest.platforms).length === 0) {
    console.warn('没有找到任何平台！');
  }

  // 写入文件
  const outputPath = 'latest-update.json';
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Manifest 已写入 ${outputPath}`);

  // 输出 version 到 GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  } else {
    // 本地测试时输出
    console.log(`版本: ${version}`);
  }

  // 打印生成的 manifest
  console.log('\n生成的 manifest:');
  console.log(JSON.stringify(manifest, null, 2));
}

// 处理可能的错误
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateManifest().catch(error => {
    console.error('生成 manifest 时出错:', error);
    process.exit(1);
  });
}

export { generateManifest };