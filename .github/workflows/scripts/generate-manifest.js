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

  // 创建符合 Tauri 升级要求的基础 manifest
  const manifest = {
    version,
    notes: `版本 ${version} 的发布说明`,
    pub_date: new Date().toISOString(),
    platforms: {}
  };
  
  console.log('=== 创建 Tauri 更新清单 ===')
  console.log('版本:', version);
  console.log('产品名称:', productName);
  console.log('发布日期:', manifest.pub_date);

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

  // 定义平台配置
  const platformConfigs = [
    {
      key: 'darwin-x86_64',
      signatureDir: 'signatures/macos-latest-x64-signature',
      fileName: `${productName}_${version}-macos-x64.dmg`
    },
    {      key: 'darwin-aarch64',
      signatureDir: 'signatures/macos-latest-aarch64-signature',
      fileName: `${productName}_${version}-macos-aarch64.dmg`
    },
    {
      key: 'windows-x86_64',
      signatureDir: 'signatures/windows-latest-x64-withwebview2-signature',
      fileName: `${productName}_${version}-windows-x64-withwebview2.exe`
    },
    {
      key: 'windows-x86_64',
      signatureDir: 'signatures/windows-latest-x64-withoutwebview2-signature',
      fileName: `${productName}_${version}-windows-x64-withoutwebview2.exe`
    }
  ];

  console.log('\n=== 检查签名文件 ===');
  const platforms = [];

  for (const config of platformConfigs) {
    console.log(`处理平台配置: ${config.key}`);
    console.log(`  签名目录: ${config.signatureDir}`);
    console.log(`  文件名: ${config.fileName}`);
    
    // 查找签名文件（支持直接文件路径或目录搜索）
    let foundSigPath = null;
    
    // 首先尝试直接查找签名文件
    const directSigPath = `${config.signatureDir}/signature.sig`;
    if (fs.existsSync(directSigPath)) {
      foundSigPath = directSigPath;
      console.log(`  -> 找到直接签名文件: ${foundSigPath}`);
    } 
    // 如果没有直接找到，尝试递归查找
    else {
      foundSigPath = findSignatureFile(config.signatureDir);
      if (foundSigPath) {
        console.log(`  -> 递归找到签名文件: ${foundSigPath}`);
      } else {
        // 尝试在签名目录的 update 子目录中查找
        const updateSigPath = `${config.signatureDir}/update/signature.sig`;
        if (fs.existsSync(updateSigPath)) {
          foundSigPath = updateSigPath;
          console.log(`  -> 在 update 目录找到签名文件: ${foundSigPath}`);
        } else {
          console.log(`  -> 未找到签名文件，跳过该平台配置`);
          continue;
        }
      }
    }
    
    // 添加到平台列表
    platforms.push({
      key: config.key,
      sigPath: foundSigPath,
      fileName: config.fileName
    });
    console.log(`  -> 已添加到平台列表`);
  }

  // 为每个平台生成 manifest 条目
  console.log('\n=== 生成平台 manifest 条目 ===');
  
  // 用于跟踪已添加的平台，避免重复
  const addedPlatforms = new Set();
  
  for (const platform of platforms) {
    const platformKey = platform.key;
    
    // 跳过已经处理过的平台
    if (addedPlatforms.has(platformKey)) {
      console.log(`平台 ${platformKey} 已处理，跳过重复配置`);
      continue;
    }
    
    console.log(`处理平台: ${platformKey}`);
    console.log(`  签名路径: ${platform.sigPath}`);
    console.log(`  文件名: ${platform.fileName}`);
    
    try {
      // 读取签名文件内容
      if (!fs.existsSync(platform.sigPath)) {
        console.warn(`  -> 签名文件不存在: ${platform.sigPath}`);
        continue;
      }
      
      const signature = fs.readFileSync(platform.sigPath, 'utf8').trim();
      
      // 验证签名内容
      if (!signature || signature.length === 0) {
        console.warn(`  -> 签名内容为空，跳过`);
        continue;
      }
      
      // 生成下载 URL
      const fileNameEncoded = encodeURIComponent(platform.fileName);
      const url = `https://github.com/${repoOwner}/${repoName}/releases/download/${version}/${fileNameEncoded}`;
      
      // 添加到 manifest
      manifest.platforms[platformKey] = {
        signature,
        url
      };
      
      addedPlatforms.add(platformKey);
      
      console.log(`  -> 成功添加到 manifest`);
      console.log(`     签名长度: ${signature.length}`);
      console.log(`     URL: ${url}`);
      console.log(`     平台: ${platformKey}`);
      
    } catch (error) {
      console.error(`  -> 处理平台 ${platformKey} 失败:`, error.message);
      console.error(`     错误详情:`, error);
    }
  }

  // 验证 manifest 完整性
  console.log('\n=== 验证 Manifest 完整性 ===');
  if (Object.keys(manifest.platforms).length === 0) {
    console.warn('警告: 没有找到任何平台！生成的 manifest 将不包含任何平台信息。');
    console.warn('这可能会导致 Tauri 应用无法检测到更新。');
    console.warn('请检查签名文件是否正确生成和上传。');
  } else {
    console.log(`成功: 找到 ${Object.keys(manifest.platforms).length} 个平台`);
    console.log('平台列表:', Object.keys(manifest.platforms).join(', '));
  }

  // 写入文件
  const outputPath = 'latest-update.json';
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\n=== Manifest 生成完成 ===`);
  console.log(`Manifest 已写入: ${outputPath}`);
  console.log(`文件大小: ${fs.statSync(outputPath).size} 字节`);

  // 输出 version 到 GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
    console.log(`版本号已输出到 GitHub Actions: version=${version}`);
  } else {
    // 本地测试时输出
    console.log(`版本号: ${version}`);
  }

  // 打印生成的 manifest（简化版）
  console.log('\n生成的 Manifest 摘要:');
  console.log(`- 版本: ${manifest.version}`);
  console.log(`- 发布日期: ${manifest.pub_date}`);
  console.log(`- 发布说明: ${manifest.notes}`);
  console.log(`- 支持平台: ${Object.keys(manifest.platforms).join(', ')}`);
  console.log('\n完整 Manifest 内容:');
  console.log(JSON.stringify(manifest, null, 2));
  
  // 验证生成的 manifest 符合 Tauri 要求
  console.log('\n=== Tauri Manifest 验证 ===');
  const requiredFields = ['version', 'pub_date', 'platforms'];
  const missingFields = requiredFields.filter(field => !manifest.hasOwnProperty(field));
  
  if (missingFields.length > 0) {
    console.error('错误: 生成的 manifest 缺少必要字段:', missingFields.join(', '));
    console.error('这将导致 Tauri 应用无法正确处理更新！');
    process.exit(1);
  } else {
    console.log('成功: 生成的 manifest 包含所有必要字段');
    console.log('✅ version 字段存在');
    console.log('✅ pub_date 字段存在');
    console.log('✅ platforms 字段存在');
    
    // 验证平台字段格式
    let platformValid = true;
    for (const [platform, data] of Object.entries(manifest.platforms)) {
      if (!data.hasOwnProperty('signature') || !data.hasOwnProperty('url')) {
        console.error(`错误: 平台 ${platform} 缺少必要字段 signature 或 url`);
        platformValid = false;
      }
    }
    
    if (platformValid) {
      console.log('✅ 所有平台包含必要的 signature 和 url 字段');
      console.log('✅ 生成的 manifest 符合 Tauri 升级要求！');
    } else {
      console.error('错误: 部分平台缺少必要字段');
      process.exit(1);
    }
  }
}

// 处理可能的错误
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateManifest().catch(error => {
    console.error('生成 manifest 时出错:', error);
    process.exit(1);
  });
}

export { generateManifest };