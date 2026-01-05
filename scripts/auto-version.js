#!/usr/bin/env node
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 获取当前文件路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 获取Git最新标签
function getLatestTag() {
  try {
    // 获取最近的标签
    const tag = execSync('git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0"', { encoding: 'utf8' }).trim();
    return tag;
  } catch (error) {
    return 'v0.0.0';
  }
}

// 获取Git提交次数
function getCommitCount() {
  try {
    const count = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim();
    return parseInt(count) || 0;
  } catch (error) {
    return 0;
  }
}

// 获取短提交哈希
function getShortCommitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch (error) {
    return 'unknown';
  }
}

// 生成版本号
function generateVersion() {
  const tag = getLatestTag();
  const commitCount = getCommitCount();
  const commitHash = getShortCommitHash();
  
  // 如果是开发版本
  if (tag === 'v0.0.0' || process.argv.includes('--dev')) {
    return `0.0.0-dev.${commitCount}+${commitHash}`;
  }
  
  return tag.replace(/^v/, '');
}

// 更新所有配置文件的函数
function updateAllConfigs(version) {
  console.log(`🔄 更新到版本: ${version}`);
  
  // 更新package.json
  const pkgPath = join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  
  // 更新Cargo.toml
  const cargoPath = join(__dirname, '..', 'src-tauri', 'Cargo.toml');
  let cargoContent = fs.readFileSync(cargoPath, 'utf8');
  cargoContent = cargoContent.replace(
    /^version\s*=\s*"[^"]*"$/m,
    `version = "${version}"`
  );
  fs.writeFileSync(cargoPath, cargoContent);
  
  // 更新tauri.conf.json
  const tauriPath = join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
  const tauriConf = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
  tauriConf.version = version;
  fs.writeFileSync(tauriPath, JSON.stringify(tauriConf, null, 2));
  
  console.log('✅ 所有配置文件已更新');
  return version;
}

// 主函数
function main() {
  const mode = process.argv[2];
  
  if (mode === '--build') {
    // 构建模式：从Git生成版本
    const version = generateVersion();
    updateAllConfigs(version);
    console.log(`🏗️ 构建版本: ${version}`);
  } else if (mode && /^\d+\.\d+\.\d+/.test(mode)) {
    // 手动设置版本
    const version = mode.replace(/^v/, '');
    updateAllConfigs(version);
    
    // 创建Git标签
    // try {
    //   execSync(`git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json`, { stdio: 'inherit' });
    //   execSync(`git commit -m "release: v${version}"`, { stdio: 'inherit' });
    //   execSync(`git tag v${version}`, { stdio: 'inherit' });
    //   console.log(`🏷️ 已创建Git标签: v${version}`);
    // } catch (error) {
    //   console.warn('⚠️ Git操作跳过');
    // }
  } else {
    // 显示当前版本
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const tag = getLatestTag();
    console.log(`📊 版本信息:`);
    console.log(`   package.json: ${pkg.version}`);
    console.log(`   Git最新标签: ${tag}`);
    console.log(`\n使用方法:`);
    console.log(`   node scripts/auto-version.js 1.2.3  # 设置版本并打标签`);
    console.log(`   node scripts/auto-version.js --build  # 从Git生成构建版本`);
  }
}

main();