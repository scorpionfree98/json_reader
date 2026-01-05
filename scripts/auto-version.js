#!/usr/bin/env node
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 获取当前文件路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 清理字符串：移除首尾的引号和空白字符
function cleanString(str) {
  return (str || '').toString().replace(/^["'\s]+|["'\s]+$/g, '').trim();
}

// 获取Git最新标签（纯Node.js实现，避免平台差异）
function getLatestTag() {
  try {
    // 获取所有标签
    const tagsOutput = execSync('git tag 2>/dev/null || echo ""', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    
    // 过滤出格式为vX.Y.Z的标签
    const tags = tagsOutput
      .split('\n')
      .filter(tag => {
        const trimmed = cleanString(tag);
        return trimmed && /^v\d+\.\d+\.\d+$/.test(trimmed);
      })
      .map(tag => cleanString(tag));
    
    if (tags.length === 0) {
      console.log('📌 未找到版本标签，使用默认 v0.0.0');
      return 'v0.0.0';
    }
    
    // 在JavaScript中排序版本号（降序，最新版本在前）
    tags.sort((a, b) => {
      const aParts = a.slice(1).split('.').map(Number);
      const bParts = b.slice(1).split('.').map(Number);
      
      // 比较主版本号
      if (aParts[0] !== bParts[0]) return bParts[0] - aParts[0];
      // 比较次版本号
      if (aParts[1] !== bParts[1]) return bParts[1] - aParts[1];
      // 比较修订号
      return bParts[2] - aParts[2];
    });
    
    const latestTag = tags[0];
    console.log(`🔍 发现标签: ${tags.join(', ')}`);
    console.log(`📌 最新标签: ${latestTag}`);
    
    return latestTag;
  } catch (error) {
    console.warn('⚠️ 无法获取Git标签，使用默认版本 v0.0.0');
    return 'v0.0.0';
  }
}

// 获取Git提交次数
function getCommitCount() {
  try {
    const count = execSync('git rev-list --count HEAD 2>/dev/null || echo "0"', { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    return parseInt(cleanString(count)) || 0;
  } catch (error) {
    return 0;
  }
}

// 获取短提交哈希
function getShortCommitHash() {
  try {
    const hash = execSync('git rev-parse --short HEAD 2>/dev/null || echo "unknown"', { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    return cleanString(hash);
  } catch (error) {
    return 'unknown';
  }
}

// 生成版本号
function generateVersion() {
  const tag = getLatestTag();
  const commitCount = getCommitCount();
  const commitHash = getShortCommitHash();
  
  console.log(`📊 Git信息: 标签=${tag}, 提交数=${commitCount}, 哈希=${commitHash}`);
  
  // 开发版本
  if (tag === 'v0.0.0' || process.argv.includes('--dev')) {
    const devVersion = `0.0.0-dev.${commitCount}+${commitHash}`;
    console.log(`🚀 生成开发版本: ${devVersion}`);
    return devVersion;
  }
  
  // 正式版本
  const version = tag.replace(/^v/, '');
  
  // 验证版本号格式
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.warn(`⚠️ 标签格式错误: ${tag}，使用开发版本`);
    const devVersion = `0.0.0-dev.${commitCount}+${commitHash}`;
    console.log(`🔄 回退到开发版本: ${devVersion}`);
    return devVersion;
  }
  
  console.log(`✅ 使用正式版本: ${version}`);
  return version;
}

// 更新所有配置文件的函数
function updateAllConfigs(version) {
  console.log(`\n🔄 更新到版本: ${version}`);
  
  try {
    // 更新package.json
    const pkgPath = join(__dirname, '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      pkg.version = version;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      console.log('✅ 更新 package.json');
    } else {
      console.warn('⚠️ package.json 不存在，跳过');
    }
    
    // 更新Cargo.toml
    const cargoPath = join(__dirname, '..', 'src-tauri', 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      let cargoContent = fs.readFileSync(cargoPath, 'utf8');
      cargoContent = cargoContent.replace(
        /^version\s*=\s*"[^"]*"$/m,
        `version = "${version}"`
      );
      fs.writeFileSync(cargoPath, cargoContent);
      console.log('✅ 更新 Cargo.toml');
    } else {
      console.warn('⚠️ Cargo.toml 不存在，跳过');
    }
    
    // 更新tauri.conf.json
    const tauriPath = join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
    if (fs.existsSync(tauriPath)) {
      const tauriConf = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
      tauriConf.version = version;
      fs.writeFileSync(tauriPath, JSON.stringify(tauriConf, null, 2));
      console.log('✅ 更新 tauri.conf.json');
    } else {
      console.warn('⚠️ tauri.conf.json 不存在，跳过');
    }
    
    console.log('\n✅ 所有配置文件已更新');
  } catch (error) {
    console.error('❌ 更新配置文件失败:', error.message);
    process.exit(1);
  }
  
  return version;
}

// 显示当前版本信息
function showCurrentVersion() {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    if (!fs.existsSync(pkgPath)) {
      console.error('❌ package.json 不存在');
      process.exit(1);
    }
    
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const tag = getLatestTag();
    console.log(`📊 当前版本信息:`);
    console.log(`   package.json: ${pkg.version}`);
    console.log(`   Git最新标签: ${tag}`);
    console.log(`   Git提交次数: ${getCommitCount()}`);
    console.log(`   Git短哈希: ${getShortCommitHash()}`);
  } catch (error) {
    console.error('❌ 读取版本信息失败:', error.message);
  }
}

// 显示帮助信息
function showHelp() {
  console.log(`
📦 版本管理工具 v1.0.0
用法: node scripts/auto-version.js [命令]

命令:
  [无参数]          显示当前版本信息
  --build           从Git生成构建版本
  [版本号]          手动设置版本号 (如: 1.2.3 或 v1.2.3)
  --help, -h        显示此帮助信息

示例:
  node scripts/auto-version.js           # 查看当前版本
  node scripts/auto-version.js --build   # 生成构建版本
  node scripts/auto-version.js 1.2.3    # 设置版本为1.2.3
  node scripts/auto-version.js v1.2.3   # 设置版本为1.2.3
  `);
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // 无参数：显示当前版本
    showCurrentVersion();
  } else if (args.includes('--help') || args.includes('-h')) {
    // 显示帮助
    showHelp();
  } else if (args.includes('--build')) {
    // 构建模式：从Git生成版本
    console.log('🔨 构建模式');
    const version = generateVersion();
    updateAllConfigs(version);
    console.log(`\n🏗️  已更新为构建版本: ${version}`);
  } else if (/^v?\d+\.\d+\.\d+$/.test(args[0])) {
    // 手动设置版本
    const version = args[0].replace(/^v/, '');
    console.log(`🔖 手动设置版本: ${version}`);
    updateAllConfigs(version);
    console.log(`\n✅ 已设置版本: ${version}`);
    
   

  } else {
    console.error(`❌ 无效参数: ${args[0]}`);
    showHelp();
    process.exit(1);
  }
}

// 执行主函数
main();