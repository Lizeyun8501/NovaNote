# Tasks

- [ ] Task 1: Ollama AI 集成
  - [ ] 1.1 Rust 后端：创建 `crates/novanote-core/src/ai.rs` 模块，实现 Ollama HTTP 客户端（generate/chat API）
  - [ ] 1.2 Rust 后端：实现智能标签生成（prompt 模板 + Ollama 调用 + 解析结果）
  - [ ] 1.3 Rust 后端：实现自动摘要生成（提取笔记内容 → Ollama 摘要 → 返回结果）
  - [ ] 1.4 Rust 后端：实现写作辅助（续写/润色/翻译三种模式）
  - [ ] 1.5 添加 Tauri 命令：ai_generate_tags, ai_summarize, ai_writing_assist, ai_check_ollama
  - [ ] 1.6 前端：实现 AI 面板组件（AIPanel），含标签生成/摘要/写作辅助三个 tab

- [ ] Task 2: 语义搜索（RAG 向量检索）
  - [ ] 2.1 Rust 后端：添加向量索引存储（使用 usearch 或 lance 作为轻量向量数据库）
  - [ ] 2.2 Rust 后端：实现嵌入生成（调用 Ollama embedding API 或本地 ONNX 模型）
  - [ ] 2.3 Rust 后端：实现语义搜索（query → embedding → 向量相似度 → 返回结果）
  - [ ] 2.4 Rust 后端：更新 index_file() 自动生成笔记嵌入向量
  - [ ] 2.5 添加 Tauri 命令：ai_semantic_search
  - [ ] 2.6 前端：SearchBar 增加语义搜索模式切换

- [ ] Task 3: WASM 插件运行时
  - [ ] 3.1 创建 `crates/novanote-plugin-runtime/` Rust 库（插件 SDK + 宿主运行时）
  - [ ] 3.2 定义 PluginManifest 格式（name, version, permissions, wasm_module）
  - [ ] 3.3 实现 wasmtime 沙箱：加载 wasm 模块、内存限制、函数注入
  - [ ] 3.4 实现 PluginHost：管理已安装插件、加载/卸载、生命周期
  - [ ] 3.5 实现 Plugin API：编辑器操作（get_text/set_text/insert_text）、事件订阅（on_note_save/on_note_open）

- [ ] Task 4: Plugin API 设计
  - [ ] 4.1 创建 `crates/novanote-plugin-sdk/` 提供给插件开发者的 Rust SDK
  - [ ] 4.2 定义 Plugin trait（init/on_event/execute/supported_events）
  - [ ] 4.3 实现事件系统：NoteSaved, NoteOpened, NoteDeleted, AppStarted, ThemeChanged
  - [ ] 4.4 实现 UI 扩展 API：register_toolbar_button, register_sidebar_panel, register_command
  - [ ] 4.5 编写插件开发示例（一个简单的 word-count 插件）

- [ ] Task 5: 插件市场
  - [ ] 5.1 前端：实现 PluginMarket 组件（插件列表、搜索、安装/卸载）
  - [ ] 5.2 前端：实现 PluginDetail 组件（插件详情、权限说明、版本历史）
  - [ ] 5.3 前端：实现 PluginSettings 组件（已安装插件管理、启用/禁用）
  - [ ] 5.4 添加 Tauri 命令：plugin_install, plugin_uninstall, plugin_list, plugin_enable, plugin_disable
  - [ ] 5.5 前端：集成到 App.tsx（插件市场入口、插件管理面板）

- [ ] Task 6: 日历 / 日程
  - [ ] 6.1 前端：实现 CalendarView 组件（月视图日历，标注有日记的日期）
  - [ ] 6.2 前端：点击日期打开/创建对应日期的 Daily Note
  - [ ] 6.3 前端：在 Sidebar 中添加"日历视图"入口按钮

- [ ] Task 7: 邮件转笔记
  - [ ] 7.1 Rust 后端：实现 .eml 文件解析（mailparse crate）
  - [ ] 7.2 Rust 后端：提取邮件头部（From/To/Subject/Date）和 HTML/纯文本正文
  - [ ] 7.3 Rust 后端：生成格式化 Markdown 笔记（frontmatter + 引用块格式）
  - [ ] 7.4 添加 Tauri 命令：import_email
  - [ ] 7.5 前端：在 ImportWizard 中添加"邮件导入"选项

# Task Dependencies
- Task 1（Ollama AI）独立，可最先启动
- Task 2（语义搜索）依赖 Task 1 的 Ollama 客户端（共享 embedding API）
- Task 3（WASM 运行时）独立
- Task 4（Plugin API）依赖 Task 3 的运行时
- Task 5（插件市场）依赖 Task 3、Task 4
- Task 6（日历）独立
- Task 7（邮件导入）独立
- Task 1、3、6、7 可并行启动