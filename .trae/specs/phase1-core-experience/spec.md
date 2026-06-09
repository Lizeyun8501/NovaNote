# Phase 1: 核心体验 Spec — Obsidian 级别单机体验

## Why
Phase 0 已交付 MVP（编辑器+文件管理+搜索），Phase 1 需要补齐知识关联、组织增强、导入导出等核心功能，达到 Obsidian 级别的单机体验，为内部测试版发布做准备。

## What Changes
- 实现双向链接（`[[wikilink]]`）与反向链接面板
- 实现知识图谱可视化（力导向图）
- 实现标签系统（多级标签、标签面板）
- 实现命令面板（Cmd/Ctrl+P）
- 实现搜索增强（正则搜索）
- 实现模板系统与日记（Daily Note）
- 实现画布/白板功能
- 实现多格式导出（PDF/HTML/Word/MD）
- 实现多来源导入（Obsidian/Notion/Joplin/思源）

## Impact
- Affected specs: phase0-mvp-foundation（扩展 Vault 索引结构、编辑器扩展）
- Affected code: novanote-core（链接索引、标签索引）、前端（编辑器扩展、新组件）、src-tauri（新命令）

## ADDED Requirements

### Requirement: 双向链接
系统 SHALL 支持 `[[wikilink]]` 语法创建笔记间链接，支持 `[[note#heading]]` 块级引用。

#### Scenario: 创建链接
- **WHEN** 用户在编辑器中输入 `[[` 
- **THEN** 弹出笔记列表自动补全，选择后插入 `[[笔记名]]`

#### Scenario: 点击跳转
- **WHEN** 用户点击 `[[wikilink]]` 链接
- **THEN** 打开目标笔记（若不存在则提示创建）

#### Scenario: 反向链接面板
- **WHEN** 用户打开某篇笔记
- **THEN** 右侧面板显示所有引用当前笔记的其他笔记列表

---

### Requirement: 知识图谱可视化
系统 SHALL 提供力导向图谱视图，展示笔记间的链接关系。

#### Scenario: 打开图谱
- **WHEN** 用户点击"图谱视图"按钮
- **THEN** 全屏展示力导向图，节点为笔记，边为链接关系

#### Scenario: 交互操作
- **WHEN** 用户点击图谱中的节点
- **THEN** 高亮该节点及其直接关联节点，显示笔记标题

---

### Requirement: 标签系统
系统 SHALL 支持多级标签，通过 YAML frontmatter 和行内 `#tag` 语法添加标签。

#### Scenario: 添加标签
- **WHEN** 用户在笔记中输入 `#tag` 或在 frontmatter 中添加 tags 字段
- **THEN** 标签被索引，出现在标签面板中

#### Scenario: 标签面板
- **WHEN** 用户打开标签面板
- **THEN** 显示所有标签及对应笔记数量，点击标签过滤笔记列表

---

### Requirement: 命令面板
系统 SHALL 提供 Cmd/Ctrl+P 唤起的命令面板，支持快速执行操作。

#### Scenario: 搜索命令
- **WHEN** 用户按 Cmd/Ctrl+P 并输入关键词
- **THEN** 模糊匹配命令列表，回车执行选中命令

#### Scenario: 内置命令
- **WHEN** 命令面板打开
- **THEN** 包含：新建笔记、切换主题、打开设置、导出笔记、切换图谱视图等命令

---

### Requirement: 搜索增强
系统 SHALL 支持正则表达式搜索。

#### Scenario: 正则搜索
- **WHEN** 用户在搜索栏输入正则表达式并启用正则模式
- **THEN** 返回匹配的笔记列表

---

### Requirement: 模板系统
系统 SHALL 支持笔记模板，用户可创建和使用模板快速创建笔记。

#### Scenario: 使用模板
- **WHEN** 用户选择"从模板新建笔记"
- **THEN** 显示模板列表，选择后基于模板内容创建新笔记

#### Scenario: 保存为模板
- **WHEN** 用户将当前笔记保存为模板
- **THEN** 模板保存到 `.vault/templates/` 目录

---

### Requirement: 日记系统
系统 SHALL 支持 Daily Note 功能，每天自动创建/打开日记笔记。

#### Scenario: 打开今日日记
- **WHEN** 用户点击"今日日记"或按快捷键
- **THEN** 打开/创建当天日期命名的笔记（如 `2026-06-09.md`）

---

### Requirement: 画布/白板
系统 SHALL 提供无限画布功能，支持在画布上放置笔记卡片和自由文本。

#### Scenario: 创建画布
- **WHEN** 用户选择"新建画布"
- **THEN** 创建一个 .canvas JSON 文件并打开画布编辑器

#### Scenario: 添加卡片
- **WHEN** 用户在画布上双击
- **THEN** 创建一个文本卡片，可输入内容或链接到已有笔记

---

### Requirement: 多格式导出
系统 SHALL 支持将笔记导出为 PDF、HTML、Word、Markdown 格式。

#### Scenario: 导出 PDF
- **WHEN** 用户选择"导出为 PDF"
- **THEN** 将当前笔记渲染为 PDF 文件并保存

#### Scenario: 导出 HTML
- **WHEN** 用户选择"导出为 HTML"
- **THEN** 生成独立 HTML 文件（含内联样式）

---

### Requirement: 多来源导入
系统 SHALL 支持从 Obsidian、Notion、Joplin、思源笔记导入数据。

#### Scenario: Obsidian 导入
- **WHEN** 用户选择"从 Obsidian 导入"并指定 Vault 目录
- **THEN** 自动索引所有 .md 文件和 frontmatter，保留链接和标签

#### Scenario: Notion 导入
- **WHEN** 用户选择"从 Notion 导入"并指定导出的 ZIP/文件夹
- **THEN** 解析 Notion Markdown+CSV 导出格式，转换为本地笔记

#### Scenario: Joplin 导入
- **WHEN** 用户选择"从 Joplin 导入"并指定 JEX 文件
- **THEN** 解析 JEX 格式并导入笔记

#### Scenario: 思源笔记导入
- **WHEN** 用户选择"从思源导入"并指定 .sy 导出文件
- **THEN** 转换思源格式为 Markdown 并导入