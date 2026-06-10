# Tasks

- [x] Task 1: 搭建 Rust workspace + Tauri 2.0 + React 19 + TypeScript 工程骨架
  - [x] 1.1 使用 `pnpm create tauri-app` 初始化项目，选择 React + TypeScript 模板
  - [x] 1.2 创建 Rust workspace 结构：`crates/novanote-core`（核心库）、`crates/novanote-tauri`（Tauri 入口）
  - [x] 1.3 创建前端工程 `src/`（React 19 + TypeScript），集成 Tailwind CSS
  - [x] 1.4 配置共享类型包 `shared/`，定义 Note、Vault 等核心接口
  - [x] 1.5 验证：`pnpm install && cargo build` 全部通过，`pnpm tauri dev` 可启动桌面窗口

- [x] Task 2: 实现 TipTap 富文本编辑器组件
  - [x] 2.1 安装 TipTap 核心包及扩展（@tiptap/react, @tiptap/starter-kit, @tiptap/extension-placeholder 等）
  - [x] 2.2 实现 Editor 组件，支持标题、段落、加粗、斜体、列表、代码块、引用等基础格式
  - [x] 2.3 实现 Markdown 输入快捷键（# 标题, **加粗**, *斜体*, - 列表, > 引用, ``` 代码块）
  - [x] 2.4 实现编辑器工具栏 Toolbar（加粗/斜体/标题/列表/代码块/撤销/重做）
  - [x] 2.5 实现 getMarkdown() 和 setMarkdown() 方法，支持 Markdown 双向转换

- [x] Task 3: 实现 Vault 系统（Rust 后端）
  - [x] 3.1 在 `novanote-core` 中实现 Vault 创建逻辑：选择目录 → 生成 UUID → 创建 `.vault/config.json` + `.vault/index.db`
  - [x] 3.2 实现 Markdown 文件扫描：递归遍历目录，收集所有 .md 文件路径和 YAML frontmatter 元数据
  - [x] 3.3 实现 SQLite 索引存储（使用 rusqlite）：notes 表、tags 表、file_watch 状态表
  - [x] 3.4 实现 FTS5 全文搜索索引：建立并维护与 .md 文件同步的全文索引
  - [x] 3.5 实现文件监听器（notify crate）：监听 Vault 目录变化，自动更新索引
  - [x] 3.6 实现索引重建功能：从 .md 源文件全量重建 SQLite 索引

- [x] Task 4: 实现文件管理器 UI
  - [x] 4.1 实现侧边栏布局：左侧文件树 + 右侧编辑区，支持拖拽调整宽度
  - [x] 4.2 实现目录树组件（FileTree）：递归渲染文件夹和 .md 文件，支持展开/折叠
  - [x] 4.3 实现文件操作：新建笔记（右键菜单/按钮）、重命名、删除

- [x] Task 5: 实现搜索功能
  - [x] 5.1 实现搜索栏 UI 组件（SearchBar）：Cmd/Ctrl+K 快捷键唤起，搜索输入框
  - [x] 5.2 实现 Tauri Command（Rust 端）：接收搜索关键词，查询 FTS5 索引，返回结果列表
  - [x] 5.3 实现搜索结果展示：标题高亮 + 内容片段预览，点击跳转到对应笔记

- [x] Task 6: 实现主题系统
  - [x] 6.1 定义 CSS 变量（亮色/暗色两套配色方案）
  - [x] 6.2 实现 ThemeProvider（React Context）：管理主题状态，切换时更新 CSS 变量
  - [x] 6.3 实现主题切换按钮（亮色/暗色/跟随系统）
  - [x] 6.4 主题持久化：存储到 localStorage/.vault/config.json

- [x] Task 7: 跨平台打包验证
  - [x] 7.1 配置 Tauri 打包参数（应用名称、图标、窗口配置等）
  - [x] 7.2 验证 Linux 平台打包：`pnpm tauri build`
  - [x] 7.3 验证应用可正常启动，所有核心功能可用

# Task Dependencies
- Task 2 依赖 Task 1（需要工程骨架）
- Task 3 依赖 Task 1（需要 Rust workspace）
- Task 4 依赖 Task 1, Task 2（需要编辑器组件和基础工程）
- Task 5 依赖 Task 3（需要 FTS5 索引）
- Task 6 依赖 Task 1（需要基础工程）
- Task 7 依赖 Task 1-6（需要完整功能）
- Task 4、Task 6 可与 Task 2、Task 3 并行开发