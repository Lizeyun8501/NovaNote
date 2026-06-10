# Phase 3: AI 与插件 Spec — AI 增强 + 生态

## Why
Phase 2 已完成同步协作基础设施，Phase 3 需要实现本地 AI 集成（Ollama）、语义搜索（RAG）、插件运行时（WASM 沙箱）和插件市场，为正式发布做准备。

## What Changes
- 本地 AI 集成（Ollama）：智能标签、自动摘要、写作辅助
- AI 语义搜索（RAG 向量检索）
- WASM 插件运行时（wasmtime 沙箱）
- Plugin API 设计（事件钩子、编辑器扩展、UI 扩展）
- 插件市场（社区插件注册、审核机制）
- 日历 / 日程管理
- 邮件转笔记

## Impact
- Affected specs: phase0-mvp-foundation（扩展编辑器）、phase1-core-experience（扩展搜索、标签）
- Affected code: novanote-core（新增 AI 模块、插件运行时）、src-tauri（新增 AI 命令）、前端（新增 AI 面板、插件管理 UI）

## ADDED Requirements

### Requirement: 本地 AI 集成（Ollama）
系统 SHALL 集成 Ollama 本地大模型，提供智能标签、自动摘要、写作辅助功能。

#### Scenario: 智能标签
- **WHEN** 用户点击"智能标签"按钮
- **THEN** 调用 Ollama 分析当前笔记内容，生成 3-5 个推荐标签，用户可确认添加

#### Scenario: 自动摘要
- **WHEN** 用户点击"自动摘要"
- **THEN** Ollama 生成笔记摘要，插入到笔记头部 frontmatter

#### Scenario: 写作辅助
- **WHEN** 用户在编辑器中选中文本并调用 AI 写作辅助
- **THEN** 弹出 AI 面板，可选择续写、润色、翻译等操作

---

### Requirement: AI 语义搜索（RAG）
系统 SHALL 实现基于向量检索的语义搜索，支持自然语言查询。

#### Scenario: 语义搜索
- **WHEN** 用户输入自然语言查询（如"上周关于项目管理的讨论"）
- **THEN** 返回语义相关的笔记，而非仅关键词匹配

#### Scenario: 向量索引
- **WHEN** 笔记被创建或修改
- **THEN** 自动生成嵌入向量并存储到向量索引中

---

### Requirement: WASM 插件运行时
系统 SHALL 提供 WASM 沙箱运行时，支持第三方插件开发。

#### Scenario: 插件加载
- **WHEN** 用户安装一个 .wasm 插件
- **THEN** 系统验证签名后加载到 wasmtime 沙箱中运行

#### Scenario: 插件隔离
- **WHEN** 插件尝试访问沙箱外的系统资源
- **THEN** 沙箱阻止访问，记录错误日志

---

### Requirement: Plugin API
系统 SHALL 提供标准化 Plugin API（事件钩子、编辑器扩展、UI 扩展）。

#### Scenario: 编辑器扩展
- **WHEN** 插件注册编辑器扩展
- **THEN** 可在编辑器工具栏中添加自定义按钮，操作编辑器内容

#### Scenario: 事件钩子
- **WHEN** 笔记保存/删除/创建事件触发
- **THEN** 注册了对应钩子的插件收到通知

---

### Requirement: 插件市场
系统 SHALL 提供插件市场，支持社区发布和安装插件。

#### Scenario: 浏览插件
- **WHEN** 用户打开插件市场
- **THEN** 显示可用插件列表（名称、描述、评分、下载量）

#### Scenario: 安装插件
- **WHEN** 用户点击"安装"插件
- **THEN** 下载 .wasm 文件并加载到沙箱中

---

### Requirement: 日历 / 日程
系统 SHALL 提供日历视图和日程管理功能。

#### Scenario: 日历视图
- **WHEN** 用户切换到日历视图
- **THEN** 显示月视图日历，标注有日记的日期

#### Scenario: 创建日程
- **WHEN** 用户在日历中点击日期
- **THEN** 创建或打开该日期的 Daily Note

---

### Requirement: 邮件转笔记
系统 SHALL 支持将邮件导入为笔记。

#### Scenario: 邮件导入
- **WHEN** 用户提供 .eml 文件或邮件内容
- **THEN** 解析邮件头部（发件人、主题、日期）和正文，生成格式化的笔记