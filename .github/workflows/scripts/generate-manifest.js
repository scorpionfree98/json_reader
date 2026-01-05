const fs = require('fs');
const path = require('path');

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
    console.log(`Using manual version: ${version}`);
  } else if (githubRef.startsWith('refs/tags/')) {
    version = githubRef.replace('refs/tags/', '').replace(/^v/, '');
    console.log(`Using tag version: ${version}`);
  } else {
    version = `0.0.0-test-${runNumber}`;
    console.log(`Using test version: ${version}`);
  }

  // 创建基础 manifest
  const manifest = {
    version,
    notes: `Release notes for version ${version}`,
    pub_date: new Date().toISOString(),
    platforms: {}
  };

  // 添加平台
  const platforms = [
    {
      key: 'darwin-x86_64',
      sigPath: 'signatures/macos-latest-x64-signature/signature.sig',
      fileName: `JSON 格式化工具_${version}_x64.dmg`
    },
    {
      key: 'darwin-aarch64',
      sigPath: 'signatures/macos-latest-arm64-signature/signature.sig',
      fileName: `JSON 格式化工具_${version}_aarch64.dmg`
    }
  ];

  // Windows 平台（检查不同签名文件）
  const windowsSigFiles = [
    'signatures/windows-latest-x64-withwebview2-signature/signature.sig',
    'signatures/windows-latest-x64-withoutwebview2-signature/signature.sig'
  ];

  for (const sigFile of windowsSigFiles) {
    if (fs.existsSync(sigFile)) {
      platforms.push({
        key: 'windows-x86_64',
        sigPath: sigFile,
        fileName: `JSON 格式化工具_${version}_x64-setup.exe`
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
        
        console.log(`Added platform: ${platform.key}`);
      } catch (error) {
        console.warn(`Failed to read signature for ${platform.key}:`, error.message);
      }
    }
  }

  // 如果没有平台，输出警告
  if (Object.keys(manifest.platforms).length === 0) {
    console.warn('No platforms found in manifest!');
  }

  // 写入文件
  const outputPath = 'latest-update.json';
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Manifest written to ${outputPath}`);

  // 输出 version 到 GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  } else {
    // 本地测试时输出
    console.log(`::set-output name=version::${version}`);
  }

  // 打印生成的 manifest
  console.log('\nGenerated manifest:');
  console.log(JSON.stringify(manifest, null, 2));
}

// 处理可能的错误
if (require.main === module) {
  generateManifest().catch(error => {
    console.error('Error generating manifest:', error);
    process.exit(1);
  });
}

module.exports = { generateManifest };