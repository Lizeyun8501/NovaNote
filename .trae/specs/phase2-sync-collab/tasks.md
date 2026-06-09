# Tasks

- [x] Task 1: Yrs CRDT 引擎集成
  - [x] 1.1 在 crates/novanote-core 中添加 yrs 依赖并创建 `src/crdt.rs` 模块
  - [x] 1.2 实现 YDocHolder 结构体：封装 YrsDoc，管理笔记粒度的 CRDT 文档
  - [x] 1.3 实现 read_note_as_ydoc() 从 Markdown 创建 YrsDoc
  - [x] 1.4 实现 ydoc_to_markdown() 从 YrsDoc 导出 Markdown
  - [x] 1.5 实现 ydoc_get_updates() 和 ydoc_apply_update() 增量同步原语
  - [x] 1.6 更新 index_file() 支持双向同步：写 Markdown 文件 + 更新 YrsDoc

- [x] Task 2: E2EE 加密层
  - [x] 2.1 在 crates/novanote-core 中创建 `src/crypto.rs` 模块，添加 chacha20poly1305、argon2 依赖
  - [x] 2.2 实现 derive_key(password, salt) → 主密钥 (Argon2id)
  - [x] 2.3 实现 encrypt(plaintext, key) → (ciphertext, nonce) (XChaCha20-Poly1305)
  - [x] 2.4 实现 decrypt(ciphertext, nonce, key) → plaintext
  - [x] 2.5 添加单元测试验证加密正确性

- [x] Task 3: 同步服务器
  - [x] 3.1 创建 crates/novanote-sync-server/ Rust 项目（独立 binary）
  - [x] 3.2 实现 WebSocket 服务端：接受连接 → JWT 认证 → 维持长连接
  - [x] 3.3 实现 update 中继：按 doc_id 分组存储加密 blob，按 vector_clock 判断缺失
  - [x] 3.4 实现 PostgreSQL 存储层：用户表、doc 元数据表、blob 表
  - [x] 3.5 实现 Redis 缓存：vector_clock 热数据

- [x] Task 4: 客户端同步引擎
  - [x] 4.1 在 crates/novanote-core 中创建 `src/sync.rs` 模块
  - [x] 4.2 实现 SyncClient：WebSocket 连接、认证、定时重连
  - [x] 4.3 实现 push_updates()：本地变更推送
  - [x] 4.4 实现 pull_updates()：拉取远端变更并应用到 YrsDoc
  - [x] 4.5 实现 offline_queue()：离线时缓存操作，恢复上线后重放

- [x] Task 5: Tauri 命令 & 前端 UI
  - [x] 5.1 添加同步相关 Tauri 命令：enable_sync, disable_sync, get_sync_status, set_master_password
  - [x] 5.2 前端：实现 SyncStatus 组件（同步状态指示器）
  - [x] 5.3 前端：实现 SetupPassword 组件（首次设置主密码）
  - [x] 5.4 前端：实现 SyncSettings 面板（服务器地址、加密状态、连接状态）
  - [x] 5.5 前端：更新 App.tsx 集成同步状态和设置面板

- [x] Task 6: Docker 部署配置
  - [x] 6.1 创建 Dockerfile.sync-server 同步服务器镜像
  - [x] 6.2 创建 docker-compose.yml（sync-server + postgres + redis）
  - [x] 6.3 创建部署文档和示例配置 .env.example
  - [x] 6.4 验证：`cargo build -p novanote-sync-server` 编译成功

- [x] Task 7: 移动端与 Web 端基础适配
  - [x] 7.1 前端：在 vite.config.ts 中添加移动端响应式配置
  - [x] 7.2 前端：实现 MobileLayout 组件（响应式侧边栏 + 底部导航）
  - [x] 7.3 前端：TipTap 编辑器移动端适配（触摸事件、键盘弹出）
  - [x] 7.4 Rust：为 Web 端编译添加 WASM target 支持（条件编译）

# Task Dependencies
- Task 2（加密）是 Task 3（同步服务器）和 Task 4（客户端同步）的前置
- Task 1（CRDT）是 Task 4（客户端同步）的前置
- Task 3（同步服务器）可与 Task 1、Task 2 并行
- Task 4（客户端同步）依赖 Task 1、Task 2
- Task 5（Tauri 命令 & UI）依赖 Task 1、Task 2、Task 4
- Task 6（Docker 配置）依赖 Task 3
- Task 7（移动/Web 适配）独立，可随时并行