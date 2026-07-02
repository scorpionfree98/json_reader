// .github/workflows/scripts/generate-manifest.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 文件大小限制：100MB
const GITEE_SIZE_LIMIT = 104857600;

async function generateManifest() {
  const manualVersion = process.env.INPUT_VERSION || '';
  const githubRef = process.env.GITHUB_REF || '';
  const runNumber = process.env.GITHUB_RUN_NUMBER || '';
  const repoOwner = process.env.GITHUB_REPOSITORY_OWNER || 'scorpionfree98';
  const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'json_reader';
  const giteeOwner = process.env.GITEE_OWNER || 'scorpionfree98';
  const giteeRepo = process.env.GITEE_REPO || 'json_reader';
  
  // 从环境变量获取文件大小信息（格式："filename:size,filename:size"）
  const fileSizesEnv = process.env.FILE_SIZES || '';
  const fileSizes = {};
  if (fileSizesEnv) {
    fileSizesEnv.split(',').forEach(item => {
      const [name, size] = item.split(':');
      if (name && size) {
        fileSizes[name] = parseInt(size, 10);
      }
    });
  }

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

  // GitHub Release 标签通常带 v 前缀
  const tagName = version.startsWith('v') ? version : `v${version}`;

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

  // 平台配置
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

  // 读取 release_note_lastest.txt 文件内容
  let releaseNotes = `版本 ${version} 的发布说明`;
  const releaseNotePath = path.join(__dirname, '../../../release_note_lastest.txt');
  try {
    if (fs.existsSync(releaseNotePath)) {
      releaseNotes = fs.readFileSync(releaseNotePath, 'utf8').trim();
      console.log('✅ 已读取 release_note_lastest.txt 文件');
    } else {
      console.warn('⚠️ 未找到 release_note_lastest.txt 文件，使用默认发布说明');
    }
  } catch (error) {
    console.warn('⚠️ 读取 release_note_lastest.txt 失败:', error.message);
  }

  // 生成 GitHub 版本的 manifest（所有文件都用 GitHub 链接）
  console.log('\n=== 创建 GitHub 版本更新清单 ===');
  const githubManifest = {
    version,
    notes: releaseNotes,
    pub_date: new Date().toISOString(),
    platforms: {}
  };

  // 生成 Gitee 版本的 manifest（小文件用 Gitee 链接，大文件用 GitHub 链接）
  console.log('\n=== 创建 Gitee 版本更新清单 ===');
  const giteeManifest = {
    version,
    notes: releaseNotes,
    pub_date: new Date().toISOString(),
    platforms: {}
  };

  // 处理每个平台
  console.log('\n=== 处理平台配置 ===');
  console.log('文件大小信息:', fileSizes);

  for (const config of platformConfigs) {
    console.log(`\n处理平台: ${config.key}`);
    console.log(`  签名目录: ${config.signatureDir}`);
    console.log(`  文件名: ${config.fileName}`);

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
      
      // 获取文件大小
      const fileSize = fileSizes[config.fileName] || 0;
      const willUploadToGitee = fileSize > 0 && fileSize <= GITEE_SIZE_LIMIT;
      
      console.log(`  -> 文件大小: ${fileSize} bytes`);
      console.log(`  -> 是否上传到 Gitee: ${willUploadToGitee ? '是' : '否'}`);

      // GitHub URL（所有文件都用 GitHub）
      const githubUrl = `https://github.com/${repoOwner}/${repoName}/releases/download/${tagName}/${fileNameEncoded}`;
      githubManifest.platforms[config.key] = {
        signature,
        url: githubUrl
      };

      // Gitee URL（小文件用 Gitee，大文件用 GitHub）
      const giteeUrl = willUploadToGitee 
        ? `https://gitee.com/${giteeOwner}/${giteeRepo}/releases/download/${tagName}/${fileNameEncoded}`
        : githubUrl; // 大文件回退到 GitHub 链接
        
      giteeManifest.platforms[config.key] = {
        signature,
        url: giteeUrl
      };

      console.log(`  -> GitHub URL: ${githubUrl}`);
      console.log(`  -> Gitee URL: ${giteeUrl} ${willUploadToGitee ? '' : '(回退到 GitHub)'}`);
      console.log(`  -> 成功添加到 manifest`);

    } catch (error) {
      console.error(`  -> 处理失败:`, error.message);
    }
  }

  // 验证 manifest
  console.log('\n=== 验证 Manifest ===');
  const platformCount = Object.keys(githubManifest.platforms).length;

  if (platformCount === 0) {
    console.error('❌ 错误: 没有找到任何平台！');
    console.error('请检查:');
    console.error('1. TAURI_SIGNING_PRIVATE_KEY 是否正确设置');
    console.error('2. Artifact 是否正确上传和下载');
    console.error('3. 签名文件是否在预期的目录中');
    process.exit(1);
  }

  console.log(`✅ 成功: 找到 ${platformCount} 个平台`);
  console.log('平台列表:', Object.keys(githubManifest.platforms).join(', '));

  // 写入 GitHub 版本
  const githubOutputPath = 'latest-update.json';
  fs.writeFileSync(githubOutputPath, JSON.stringify(githubManifest, null, 2), 'utf8');
  console.log(`\n✅ GitHub Manifest 已写入: ${githubOutputPath}`);

  // 写入 Gitee 版本
  const giteeOutputPath = 'latest-update-gitee.json';
  fs.writeFileSync(giteeOutputPath, JSON.stringify(giteeManifest, null, 2), 'utf8');
  console.log(`✅ Gitee Manifest 已写入: ${giteeOutputPath}`);

  // 输出到 GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  }

  console.log('\n=== GitHub 版本 Manifest ===');
  console.log(JSON.stringify(githubManifest, null, 2));

  console.log('\n=== Gitee 版本 Manifest ===');
  console.log(JSON.stringify(giteeManifest, null, 2));
  
  // 输出混合链接统计
  console.log('\n=== Gitee 版本链接分布 ===');
  for (const [key, value] of Object.entries(giteeManifest.platforms)) {
    const isGitee = value.url.includes('gitee.com');
    console.log(`  ${key}: ${isGitee ? 'Gitee' : 'GitHub (回退)'} - ${value.url}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateManifest().catch(error => {
    console.error('生成 manifest 时出错:', error);
    process.exit(1);
  });
}

export { generateManifest };
