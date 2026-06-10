# Phase 0: MVP 基础设施 Spec

## Why
建立 NovaNote 项目的工程骨架，提供可用的 MVP（编辑器 + 文件管理 + 搜索），验证核心技术选型可行性。

## What Changes
- 搭建 Rust workspace + Tauri 2.0 + React 19 + TypeScript 工程
- 实现 TipTap (ProseMirror) 富文本编辑器，支持 Markdown 双向兼容
- 实现 Vault 系统（Markdown 文件解析、SQLite 索引、文件系统布局）
- 实现基础搜索功能（SQLite FTS5）
- 实现暗色/亮色主题切换
- 三平台打包（macOS/Windows/Linux）
- **BREAKING**: 无（新项目）

## Impact
- Affected specs: 无（首个 spec）
- Affected code: 全新工程，目录 /workspace/novanote/

## ADDED Requirements

### Requirement: 工程骨架搭建
系统 SHALL 提供 Rust workspace + Tauri 2.0 + React 19 + TypeScript 工程结构。

#### Scenario: 工程初始化成功
- **WHEN** 开发者执行 `pnpm install && cargo build`
- **THEN** 前后端均能编译通过，Tauri 桌面窗口可启动

#### Scenario: 项目结构规范
- **WHEN** 查看项目目录结构
- **THEN** 存在清晰的 frontend/（React）、backend/（Rust core lib）、tauri/（桌面壳）、shared/（共享类型）分层

---

### Requirement: TipTap 富文本编辑器
系统 SHALL 集成 TipTap (ProseMirror) 作为富文本编辑器，支持 Markdown 输入与输出。

#### Scenario: 基础编辑
- **WHEN** 用户在编辑器中输入文字
- **THEN** 编辑器实时渲染富文本内容

#### Scenario: Markdown 快捷键
- **WHEN** 用户输入 `# ` 开头文字
- **THEN** 自动渲染为一级标题

#### Scenario: Markdown 导出
- **WHEN** 用户保存笔记
- **THEN** 编辑器内容可导出为标准 Markdown 格式（.md 文件）

#### Scenario: Markdown 导入
- **WHEN** 用户打开一个 .md 文件
- **THEN** 编辑器正确解析 Markdown 并渲染为富文本

---

### Requirement: Vault 系统
系统 SHALL 实现 Vault（知识库）系统，以本地文件夹为组织单元，纯 Markdown 文件存储。

#### Scenario: 创建 Vault
- **WHEN** 用户选择一个本地目录作为 Vault
- **THEN** 系统在该目录下创建 `.vault/config.json` 和 `.vault/index.db`

#### Scenario: 索引重建
- **WHEN** Vault 索引损坏
- **THEN** 系统可从 .md 源文件完全重建 SQLite 索引

#### Scenario: 文件监听
- **WHEN** 用户在 Vault 目录下新增/修改/删除 .md 文件
- **THEN** 系统自动更新文件树和索引

---

### Requirement: 文件管理器
系统 SHALL 提供文件管理器（目录树），支持创建、重命名、删除笔记和文件夹。

#### Scenario: 创建笔记
- **WHEN** 用户点击"新建笔记"
- **THEN** 在 Vault 中创建新的 .md 文件并在目录树中显示

#### Scenario: 文件树展示
- **WHEN** 用户打开应用
- **THEN** 左侧显示 Vault 的完整目录树结构

---

### Requirement: 基础搜索
系统 SHALL 通过 SQLite FTS5 提供全文搜索功能。

#### Scenario: 搜索笔记
- **WHEN** 用户输入搜索关键词
- **THEN** 返回标题和内容匹配的笔记列表，点击可跳转到对应笔记

#### Scenario: 搜索结果为空
- **WHEN** 搜索关键词无匹配
- **THEN** 显示"未找到结果"提示

---

### Requirement: 主题系统
系统 SHALL 支持暗色/亮色主题切换。

#### Scenario: 切换主题
- **WHEN** 用户切换暗色/亮色主题
- **THEN** 编辑器、侧栏、目录树等全局 UI 切换为对应配色

#### Scenario: 主题持久化
- **WHEN** 用户重启应用
- **THEN** 恢复上次选择的主题

---

### Requirement: 跨平台打包
系统 SHALL 支持 macOS、Windows、Linux 三平台桌面应用打包。

#### Scenario: 打包成功
- **WHEN** 执行对应平台的打包命令
- **THEN** 生成可安装的桌面应用包