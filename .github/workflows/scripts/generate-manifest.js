// .github/workflows/scripts/generate-manifest.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateManifest() {
  const manualVersion = process.env.INPUT_VERSION || '';
  const githubRef = process.env.GITHUB_REF || '';
  const runNumber = process.env.GITHUB_RUN_NUMBER || '';
  const repoOwner = process.env.GITHUB_REPOSITORY_OWNER || 'scorpionfree98';
  const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'json_reader';

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

  let productName = 'JSON格式化工具';
  try {
    const tauriConfigPath = path.join(__dirname, '../../../src-tauri/tauri.conf.json');
    const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));
    productName = tauriConfig.productName || productName;
    console.log('产品名称:', productName);
  } catch (error) {
    console.warn('无法读取 tauri.conf.json，使用默认产品名称');
  }

  const manifest = {
    version,
    notes: `版本 ${version} 的发布说明`,
    pub_date: new Date().toISOString(),
    platforms: {}
  };

  console.log('\n=== 创建 Tauri 更新清单 ===');
  console.log('版本:', version);

  // 递归查找签名文件
  function findSignatureFile(basePath) {
    if (!fs.existsSync(basePath)) {
      return null;
    }

    const queue = [basePath];
    while (queue.length > 0) {
      const currentPath = queue.shift();
      try {
        const stats = fs.statSync(currentPath);
        if (stats.isFile() && currentPath.endsWith('.sig')) {
          return currentPath;
        } else if (stats.isDirectory()) {
          const files = fs.readdirSync(currentPath);
          for (const file of files) {
            queue.push(path.join(currentPath, file));
          }
        }
      } catch (error) {
        // 忽略访问错误
      }
    }
    return null;
  }

  // 平台配置 - artifact 下载后会创建对应的子目录
  const platformConfigs = [
    {
      key: 'darwin-x86_64',
      signatureDir: 'signatures/macos-latest-x64-signature',
      fileName: `${productName}_${version}-macos-x64.app.tar.gz`
    },
    {
      key: 'darwin-aarch64',
      signatureDir: 'signatures/macos-latest-aarch64-signature',
      fileName: `${productName}_${version}-macos-aarch64.app.tar.gz`
    },
    {
      key: 'windows-x86_64-webview2',
      signatureDir: 'signatures/windows-latest-x64-withwebview2-signature',
      fileName: `${productName}_${version}-windows-x64-webview2.exe`
    },
    {
      key: 'windows-x86_64',
      signatureDir: 'signatures/windows-latest-x64-withoutwebview2-signature',
      fileName: `${productName}_${version}-windows-x64.exe`
    }
  ];

  console.log('\n=== 处理平台配置 ===');

  for (const config of platformConfigs) {
    console.log(`\n处理平台: ${config.key}`);
    console.log(`  签名目录: ${config.signatureDir}`);

    const sigPath = findSignatureFile(config.signatureDir);

    if (!sigPath) {
      console.log(`  -> 未找到签名文件，跳过`);
      continue;
    }

    console.log(`  -> 找到签名文件: ${path.basename(sigPath)}`);

    try {
      const signature = fs.readFileSync(sigPath, 'utf8').trim();

      if (!signature) {
        console.warn(`  -> 签名内容为空，跳过`);
        continue;
      }

      const fileNameEncoded = encodeURIComponent(config.fileName);
      // GitHub Release 标签通常带 v 前缀（如 v0.1.14）
      const tagName = version.startsWith('v') ? version : `v${version}`;
      const url = `https://github.com/${repoOwner}/${repoName}/releases/download/${tagName}/${fileNameEncoded}`;

      manifest.platforms[config.key] = {
        signature,
        url
      };

      console.log(`  -> 成功添加到 manifest`);

    } catch (error) {
      console.error(`  -> 处理失败:`, error.message);
    }
  }

  // 验证 manifest
  console.log('\n=== 验证 Manifest ===');
  const platformCount = Object.keys(manifest.platforms).length;

  if (platformCount === 0) {
    console.error('❌ 错误: 没有找到任何平台！');
    console.error('请检查:');
    console.error('1. TAURI_SIGNING_PRIVATE_KEY 是否正确设置');
    console.error('2. Artifact 是否正确上传和下载');
    console.error('3. 签名文件是否在预期的目录中');
    process.exit(1);
  }

  console.log(`✅ 成功: 找到 ${platformCount} 个平台`);
  console.log('平台列表:', Object.keys(manifest.platforms).join(', '));

  // 写入文件
  const outputPath = 'latest-update.json';
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\n✅ Manifest 已写入: ${outputPath}`);

  // 输出到 GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  }

  console.log('\n生成的 Manifest:');
  console.log(JSON.stringify(manifest, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateManifest().catch(error => {
    console.error('生成 manifest 时出错:', error);
    process.exit(1);
  });
}

export { generateManifest };
