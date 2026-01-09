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
    console.log('尝试读取 tauri.conf.json:', tauriConfigPath);
    const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));
    productName = tauriConfig.productName || productName;
    console.log('读取到的产品名称:', productName);
  } catch (error) {
    console.warn('无法读取 tauri.conf.json，使用默认产品名称:', error.message);
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
      basePath: 'signatures/macos-latest-x64-signature',
      fileName: `${productName}_${version}-macos-x64.dmg`
    },
    {
      key: 'darwin-aarch64',
      basePath: 'signatures/macos-latest-arm64-signature',
      fileName: `${productName}_${version}-macos-arm64.dmg`
    }
  ];

  // 处理 macOS 签名文件，使用递归查找
  for (let i = 0; i < platforms.length; i++) {
    const platform = platforms[i];
    if (platform.basePath) {
      console.log(`检查 macOS 签名目录: ${platform.basePath}`);
      const foundSigPath = findSignatureFile(platform.basePath);
      if (foundSigPath) {
        console.log(`  -> 找到签名文件: ${foundSigPath}`);
        platforms[i].sigPath = foundSigPath;
      } else {
        console.log(`  -> 未找到签名文件，将移除该平台`);
        platforms.splice(i, 1);
        i--; // 调整索引，因为我们删除了一个元素
      }
    }
  }

  // 递归查找签名文件的函数
  function findSignatureFile(basePath) {
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
        console.log(`  -> 无法访问 ${currentPath}: ${error.message}`);
      }
    }
    
    return null;
  }

  // Windows 平台（检查不同签名文件）
  const windowsSigFiles = [
    {
      basePath: 'signatures/windows-latest-x64-withwebview2-signature',
      fileName: `${productName}_${version}-windows-x64-withwebview2.exe`
    },
    {
      basePath: 'signatures/windows-latest-x64-withoutwebview2-signature',
      fileName: `${productName}_${version}-windows-x64-withoutwebview2.exe`
    }
  ];

  console.log('\n=== 检查签名文件 ===');
  for (const { basePath, fileName } of windowsSigFiles) {
    console.log(`检查签名目录: ${basePath}`);
    
    // 递归查找签名文件
    const foundSigPath = findSignatureFile(basePath);
    
    if (foundSigPath) {
      console.log(`  -> 找到签名文件: ${foundSigPath}`);
      platforms.push({
        key: 'windows-x86_64',
        sigPath: foundSigPath,
        fileName
      });
      console.log(`  -> 已添加到平台列表`);
      break;
    } else {
      console.log(`  -> 未找到签名文件`);
    }
  }

  // 为每个存在的平台文件添加信息
  console.log('\n=== 处理平台文件 ===');
  for (const platform of platforms) {
    console.log(`处理平台: ${platform.key}`);
    console.log(`  签名路径: ${platform.sigPath}`);
    console.log(`  文件名: ${platform.fileName}`);
    console.log(`  文件名编码测试: ${encodeURIComponent(platform.fileName)}`);
    
    if (fs.existsSync(platform.sigPath)) {
      try {
        const signature = fs.readFileSync(platform.sigPath, 'utf8').trim();
        const fileNameEncoded = encodeURIComponent(platform.fileName);
        const url = `https://github.com/${repoOwner}/${repoName}/releases/download/${version}/${fileNameEncoded}`;
        
        manifest.platforms[platform.key] = {
          signature,
          url
        };
        
        console.log(`  -> 成功添加到 manifest`);
        console.log(`     签名长度: ${signature.length}`);
        console.log(`     URL: ${url}`);
      } catch (error) {
        console.warn(`  -> 读取签名失败:`, error.message);
      }
    } else {
      console.log(`  -> 签名文件不存在，跳过`);
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