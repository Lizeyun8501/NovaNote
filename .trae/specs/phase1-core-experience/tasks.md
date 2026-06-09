# Tasks

- [x] Task 1: 双向链接与反向链接
  - [x] 1.1 Rust 后端：在 novanote-core 中新增 `links` 表，解析 `[[wikilink]]` 和 `[[note#heading]]` 并写入链接索引
  - [x] 1.2 Rust 后端：新增 Tauri 命令 `vault_get_backlinks(note_id)` 返回引用指定笔记的所有笔记列表
  - [x] 1.3 前端：实现 TipTap wikilink 扩展，输入 `[[` 时弹出笔记列表自动补全，选择后插入 `[[笔记名]]` 节点
  - [x] 1.4 前端：实现反向链接面板（BacklinksPanel），显示当前笔记的所有反向链接，点击可跳转

- [x] Task 2: 知识图谱可视化
  - [x] 2.1 安装 d3-force 库用于力导向图布局
  - [x] 2.2 Rust 后端：新增 Tauri 命令 `vault_get_graph_data()` 返回节点和边数据
  - [x] 2.3 前端：实现 GraphView 组件，使用力导向布局渲染图谱，节点可拖拽，点击高亮关联节点
  - [x] 2.4 前端：在 Sidebar 中添加"图谱视图"入口按钮，点击切换到全屏图谱

- [x] Task 3: 标签系统
  - [x] 3.1 Rust 后端：扩展 notes 表索引，解析行内 `#tag` 和 frontmatter tags 字段，写入 tags 表
  - [x] 3.2 Rust 后端：新增 Tauri 命令 `vault_list_tags()` 和 `vault_get_notes_by_tag(tag)`
  - [x] 3.3 前端：实现 TagsPanel 组件，显示标签云/列表，点击标签过滤文件树
  - [x] 3.4 前端：编辑器中 `#tag` 输入时高亮显示标签

- [x] Task 4: 命令面板
  - [x] 4.1 前端：实现 CommandPalette 组件，Cmd/Ctrl+P 唤起，支持模糊搜索命令
  - [x] 4.2 前端：注册内置命令（新建笔记、切换主题、打开图谱、导出笔记、打开日记等）
  - [x] 4.3 前端：集成到 App.tsx，命令执行后关闭面板

- [x] Task 5: 搜索增强（正则搜索）
  - [x] 5.1 Rust 后端：新增 Tauri 命令 `vault_search_regex(pattern)` 使用 Rust regex crate 执行正则搜索
  - [x] 5.2 前端：SearchBar 增加正则模式切换按钮，正则模式下调用 `vault_search_regex`

- [x] Task 6: 模板系统与日记
  - [x] 6.1 Rust 后端：实现模板目录 `.vault/templates/` 管理，新增 Tauri 命令
  - [x] 6.2 前端：实现模板选择 UI，新建笔记时可选择模板
  - [x] 6.3 前端：实现 Daily Note 功能，点击"今日日记"打开/创建 `YYYY-MM-DD.md`
  - [x] 6.4 前端：在 Sidebar ActionBar 中添加"今日日记"按钮

- [x] Task 7: 画布/白板
  - [x] 7.1 定义 .canvas JSON 格式
  - [x] 7.2 Rust 后端：新增 Tauri 命令读写 .canvas 文件
  - [x] 7.3 前端：实现 CanvasEditor 组件，支持无限画布拖拽、缩放、双击创建文本卡片
  - [x] 7.4 前端：支持在卡片中链接已有笔记

- [x] Task 8: 多格式导出
  - [x] 8.1 Rust 后端：实现 Markdown→HTML 导出（含内联样式），新增 `vault_export_html` 命令
  - [x] 8.2 Rust 后端：PDF 导出使用前端 window.print() 方案
  - [x] 8.3 前端：实现导出菜单（MD/PDF/HTML），调用 Tauri 命令或前端方案

- [x] Task 9: 多来源导入
  - [x] 9.1 Rust 后端：实现 Obsidian 导入（扫描目录 .md + frontmatter，直接索引）
  - [x] 9.2 Rust 后端：实现 Notion 导入（解析 Notion Export Markdown+CSV）
  - [x] 9.3 Rust 后端：实现 Joplin 导入（解析 JEX 文件）
  - [x] 9.4 前端：实现导入向导 UI，选择来源类型和文件/目录，显示导入进度

# Task Dependencies
- Task 1（双向链接）是 Task 2（图谱）的前置依赖，图谱需要链接数据
- Task 3（标签）独立，可与 Task 1 并行
- Task 4（命令面板）独立，可与 Task 1-3 并行
- Task 5（正则搜索）独立
- Task 6（模板+日记）独立
- Task 7（画布）独立
- Task 8（导出）独立
- Task 9（导入）独立