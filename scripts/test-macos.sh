#!/bin/bash
set -e

echo "========================================="
echo "JSONFormatter macOS 测试脚本"
echo "========================================="
echo ""

# 检查依赖
echo "[1/6] 检查依赖..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    echo "请访问 https://nodejs.org/ 安装 Node.js"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm 未安装"
    echo "运行: npm install -g pnpm"
    exit 1
fi

if ! command -v rustc &> /dev/null; then
    echo "❌ Rust 未安装"
    echo "请访问 https://rustup.rs/ 安装 Rust"
    exit 1
fi

if ! command -v cargo &> /dev/null; then
    echo "❌ Cargo 未安装"
    echo "请访问 https://rustup.rs/ 安装 Rust"
    exit 1
fi

echo "✅ 所有依赖已安装"
echo ""

# 安装 npm 依赖
echo "[2/6] 安装 npm 依赖..."
pnpm install
echo "✅ npm 依赖安装完成"
echo ""

# 构建 macOS debug 版本
echo "[3/6] 构建 macOS debug 版本..."
pnpm tauri build --debug
echo "✅ 构建完成"
echo ""

# 运行单元测试
echo "[4/6] 运行单元测试..."
pnpm test:unit
echo "✅ 单元测试通过"
echo ""

# 运行 E2E 测试
echo "[5/6] 运行 E2E 测试..."
pnpm test:e2e
echo "✅ E2E 测试通过"
echo ""

# 生成测试报告
echo "[6/6] 测试报告"
echo "========================================="
echo "✅ 所有测试通过"
echo ""
echo "单元测试覆盖率报告: coverage/index.html"
echo "E2E 测试报告: wdio-logs/"
echo "========================================="
