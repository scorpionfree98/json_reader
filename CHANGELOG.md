# 更新日志

本文档记录了 JSON 格式化工具的所有重要更改。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 计划中
- 支持 Linux 平台
- 添加 JSON 压缩功能
- 添加 JSON 转 XML 功能
- 添加更多主题选项
（上面都是豆包的计划，本人毫无计划）

## [0.0.0-dev] - 2025-01-05

### 新增
- ✨ JSON 格式化和美化显示
- ✨ JSON 语法验证
- ✨ 从剪贴板快速读取 JSON
- ✨ 语法高亮显示（支持字符串、数字、布尔值、null）
- ✨ 支持折叠/展开 JSON 节点
- ✨ JSON 字符串转义功能
- ✨ 窗口置顶功能
- ✨ 开机自启动
- ✨ 系统托盘支持
- ✨ 自动更新检测
- ✨ 跨平台支持（macOS Intel、macOS Apple Silicon、Windows x64）
- ✨ macOS 通用二进制支持
- ✨ GitHub Actions 自动构建和发布
- ✨ 基于 GitHub Release 的自动更新机制

### 技术细节
- 使用 Tauri v2 框架构建
- 前端使用 TypeScript + jQuery + Layui
- 后端使用 Rust
- 使用 Vite 作为构建工具
- 使用 pnpm 作为包管理器

### 已知问题
- 暂不支持 Linux 平台
- macOS 首次运行可能需要在系统偏好设置中授权



## 链接

- [GitHub Releases](https://github.com/scorpionfree98/json_reader/releases)
- [GitHub Issues](https://github.com/scorpionfree98/json_reader/issues)
