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
  // targetFileName: 目标文件名，用于匹配正确的签名文件（如 .dmg.sig 而不是 .tar.gz.sig）
  function findSignatureFile(basePath, targetFileName = null) {
    // 首先检查 basePath 是否存在
    if (!fs.existsSync(basePath)) {
      console.log(`  -> 路径不存在: ${basePath}`);
      return null;
    }
    
    const queue = [basePath];
    let foundSig = null;
    let allSigs = [];
    
    while (queue.length > 0) {
      const currentPath = queue.shift();
      
      try {
        const stats = fs.statSync(currentPath);
        if (stats.isFile() && currentPath.endsWith('.sig')) {
          allSigs.push(currentPath);
          
          // 如果有目标文件名，优先匹配包含目标文件名的签名文件
          if (targetFileName) {
            const sigFileName = path.basename(currentPath);
            const targetExt = path.extname(targetFileName); // 如 .dmg
            const targetBase = path.basename(targetFileName, targetExt); // 如 JSONFormatter_0.1.14-macos-x64
            
            // 检查签名文件名是否匹配目标文件
            // 签名文件名格式通常是: <targetFile>.sig 或 <targetFile>.<ext>.sig
            if (sigFileName.includes(targetBase) && sigFileName.includes(targetExt.replace('.', ''))) {
              console.log(`  -> 精确匹配: ${sigFileName} 匹配 ${targetFileName}`);
              return currentPath;
            }
            // 如果没有找到匹配的，记录第一个找到的作为备选
            if (!foundSig) {
              foundSig = currentPath;
            }
          } else {
            return currentPath;
          }
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
    
    // 如果没有找到精确匹配的，但有找到签名文件，返回第一个找到的
    if (foundSig) {
      console.log(`  -> 使用备选签名文件: ${path.basename(foundSig)}`);
    } else if (allSigs.length > 0) {
      // 如果没有任何匹配，返回第一个找到的签名文件
      console.log(`  -> 未找到精确匹配，使用第一个签名文件: ${path.basename(allSigs[0])}`);
      return allSigs[0];
    }
    
    return foundSig;
  }

  // 定义平台配置 - 支持多种可能的artifact命名模式
  // 注意：GitHub Actions download-artifact 会将 artifact 名称作为子目录
  const platformConfigs = [
    {
      key: 'darwin-x86_64',
      signatureDirs: [
        'signatures/macos-latest-x64-signature',
        'signatures/macos-13-x64-signature',
        'signatures/macos-latest-x86_64-signature',
        'signatures/x64-signature',  // 备选：如果artifact名称简化
        'signatures/darwin-x86_64-signature'
      ],
      fileName: `${productName}_${version}-macos-x64.dmg`
    },
    {
      key: 'darwin-aarch64',
      signatureDirs: [
        'signatures/macos-latest-aarch64-signature',
        'signatures/macos-14-aarch64-signature',
        'signatures/macos-latest-arm64-signature',
        'signatures/aarch64-signature',  // 备选：如果artifact名称简化
        'signatures/arm64-signature',
        'signatures/darwin-aarch64-signature'
      ],
      fileName: `${productName}_${version}-macos-aarch64.dmg`
    },
    {
      key: 'windows-x86_64-webview2',
      signatureDirs: [
        'signatures/windows-latest-x64-with-webview2-signature',
        'signatures/windows-2022-x64-with-webview2-signature',
        'signatures/x64-with-webview2-signature',
        'signatures/windows-x86_64-webview2-signature'
      ],
      fileName: `${productName}_${version}-windows-x64-webview2.exe`
    },
    {
      key: 'windows-x86_64',
      signatureDirs: [
        'signatures/windows-latest-x64-without-webview2-signature',
        'signatures/windows-latest-x64-signature',
        'signatures/windows-2022-x64-signature',
        'signatures/x64-signature',
        'signatures/x64-without-webview2-signature',
        'signatures/windows-x86_64-signature'
      ],
      fileName: `${productName}_${version}-windows-x64.exe`
    }
  ];

  console.log('\n=== 检查签名文件 ===');
  
  // 首先扫描整个 signatures 目录，了解实际结构
  console.log('扫描 signatures 目录结构...');
  function scanSignaturesDir(baseDir = 'signatures') {
    const allSigs = [];
    if (!fs.existsSync(baseDir)) {
      console.warn(`  -> signatures 目录不存在: ${baseDir}`);
      return allSigs;
    }
    
    function scanDir(dir, relativePath = '') {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relPath = path.join(relativePath, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath, relPath);
        } else if (item.endsWith('.sig')) {
          allSigs.push({ path: fullPath, relativePath: relPath, name: item });
        }
      }
    }
    scanDir(baseDir);
    return allSigs;
  }
  
  const allSignatureFiles = scanSignaturesDir();
  console.log(`找到 ${allSignatureFiles.length} 个签名文件:`);
  allSignatureFiles.forEach(sig => console.log(`  - ${sig.relativePath}`));
  console.log('');
  
  // 自动发现 signatures 目录下的所有子目录
  console.log('自动发现 signatures 子目录...');
  const discoveredDirs = [];
  if (fs.existsSync('signatures')) {
    const entries = fs.readdirSync('signatures', { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        discoveredDirs.push(`signatures/${entry.name}`);
      }
    }
  }
  console.log(`发现的子目录: ${discoveredDirs.join(', ') || '无'}`);
  console.log('');
  
  const platforms = [];

  for (const config of platformConfigs) {
    console.log(`处理平台配置: ${config.key}`);
    console.log(`  文件名: ${config.fileName}`);
    
    // 合并预定义目录和自动发现的目录
    const allDirs = [...config.signatureDirs];
    // 根据平台关键词从发现的目录中筛选
    const platformKeywords = {
      'darwin-x86_64': ['macos', 'x64', 'x86_64'],
      'darwin-aarch64': ['macos', 'aarch64', 'arm64'],
      'windows-x86_64-webview2': ['windows', 'webview2'],
      'windows-x86_64': ['windows', 'x64']
    };
    const keywords = platformKeywords[config.key] || [];
    for (const dir of discoveredDirs) {
      const dirLower = dir.toLowerCase();
      // 检查目录名是否包含平台关键词
      if (keywords.some(kw => dirLower.includes(kw.toLowerCase()))) {
        // 避免重复添加
        if (!allDirs.includes(dir)) {
          allDirs.push(dir);
        }
      }
    }
    
    console.log(`  尝试的签名目录: ${allDirs.join(', ')}`);
    
    // 查找签名文件（支持直接文件路径或目录搜索）
    let foundSigPath = null;
    let foundSigDir = null;
    
    // 遍历所有可能的签名目录
    for (const sigDir of allDirs) {
      console.log(`  检查目录: ${sigDir}`);
      
      // 首先尝试直接查找签名文件
      const directSigPath = `${sigDir}/signature.sig`;
      if (fs.existsSync(directSigPath)) {
        foundSigPath = directSigPath;
        foundSigDir = sigDir;
        console.log(`  -> 找到直接签名文件: ${foundSigPath}`);
        break;
      }
      
      // 尝试在签名目录的 update 子目录中查找
      const updateSigPath = `${sigDir}/update/signature.sig`;
      if (fs.existsSync(updateSigPath)) {
        foundSigPath = updateSigPath;
        foundSigDir = sigDir;
        console.log(`  -> 在 update 目录找到签名文件: ${foundSigPath}`);
        break;
      }
      
      // 尝试递归查找
      foundSigPath = findSignatureFile(sigDir, config.fileName);
      if (foundSigPath) {
        foundSigDir = sigDir;
        console.log(`  -> 递归找到签名文件: ${foundSigPath}`);
        // 验证签名文件是否匹配目标文件
        const sigFileName = path.basename(foundSigPath);
        const targetBaseName = config.fileName.replace(/\.[^.]+$/, '');
        if (sigFileName.includes(targetBaseName)) {
          console.log(`  -> 签名文件与目标文件匹配: ${sigFileName} ≈ ${config.fileName}`);
        } else {
          console.warn(`  -> 警告: 签名文件可能与目标文件不匹配: ${sigFileName} vs ${config.fileName}`);
        }
        break;
      }
    }
    
    // 兜底：如果标准路径找不到，尝试从所有签名文件中匹配
    if (!foundSigPath && allSignatureFiles.length > 0) {
      console.log(`  -> 尝试从所有签名文件中匹配...`);
      const targetBaseName = config.fileName.replace(/\.[^.]+$/, '');
      const platformKeywords = {
        'darwin-x86_64': ['macos', 'x64', 'x86_64', 'darwin'],
        'darwin-aarch64': ['macos', 'aarch64', 'arm64', 'darwin'],
        'windows-x86_64-webview2': ['windows', 'x64', 'webview2'],
        'windows-x86_64': ['windows', 'x64']
      };
      const keywords = platformKeywords[config.key] || [];
      
      for (const sig of allSignatureFiles) {
        const sigName = sig.name.toLowerCase();
        // 检查签名文件名是否包含平台关键词
        const matchesPlatform = keywords.some(kw => sigName.includes(kw.toLowerCase()));
        // 避免将 webview2 版本匹配到非 webview2 版本
        const isWebview2 = sigName.includes('webview2');
        const shouldBeWebview2 = config.key.includes('webview2');
        
        if (matchesPlatform && isWebview2 === shouldBeWebview2) {
          // 进一步检查是否匹配版本号
          if (sigName.includes(version) || sigName.includes(productName.toLowerCase())) {
            foundSigPath = sig.path;
            foundSigDir = path.dirname(sig.path);
            console.log(`  -> 从全局扫描找到匹配签名: ${sig.relativePath}`);
            break;
          }
        }
      }
    }
    
    if (!foundSigPath) {
      console.log(`  -> 未找到签名文件，跳过该平台配置`);
      continue;
    }
    
    // 添加到平台列表
    platforms.push({
      key: config.key,
      sigPath: foundSigPath,
      fileName: config.fileName
    });
    console.log(`  -> 已添加到平台列表 (目录: ${foundSigDir})`);
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
    console.error('❌ 错误: 没有找到任何平台！生成的 manifest 将不包含任何平台信息。');
    console.error('这会导致 Tauri 应用无法检测到更新。');
    console.error('');
    console.error('可能的原因:');
    console.error('1. 签名文件没有正确生成（检查 TAURI_SIGNING_PRIVATE_KEY 是否设置）');
    console.error('2. Artifact 名称不匹配（检查上传和下载的 artifact 名称）');
    console.error('3. 签名文件路径不正确（检查 signatures 目录结构）');
    console.error('');
    console.error('请检查 GitHub Actions 日志中的 "Display structure of downloaded files" 步骤');
    process.exit(1);
  } else {
    console.log(`✅ 成功: 找到 ${Object.keys(manifest.platforms).length} 个平台`);
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