# Phase 2: 同步与协作 Spec — 无缝多端

## Why
Phase 1 已完成核心体验（双向链接、图谱、画布、导入导出等），Phase 2 需要实现 CRDT 同步引擎、E2EE 加密、多端同步协作，为公测发布做准备。

## What Changes
- Yrs CRDT 引擎集成
- Markdown ↔ Yrs 双向转换
- Rust Sync Server 实现
- WebSocket 实时同步
- E2EE 加密层（XChaCha20+Argon2id）
- 密钥管理（OS Keychain 集成）
- Docker 一键部署同步服务器
- 移动端适配
- Web 端完整功能

## Impact
- Affected specs: phase0-mvp-foundation (扩展编辑器存储)、phase1-core-experience (扩展数据模型)
- Affected code: novanote-core (新增 Yrs CRDT 模块、加密模块、同步模块)、src-tauri (新增同步命令)、前端 (新增同步状态 UI)

## ADDED Requirements

### Requirement: CRDT 引擎集成
系统 SHALL 集成 Yrs (Rust Yjs) 作为 CRDT 引擎，支持多端并发编辑自动合并。

#### Scenario: 本地编辑
- **WHEN** 用户在本地编辑笔记
- **THEN** 修改先写入 Yrs Doc，再异步导出 Markdown 到文件系统
- **THEN** 增量更新同步到远端服务器

#### Scenario: 远端修改合并
- **WHEN** 另一设备修改同一笔记
- **THEN** Yrs 自动合并修改，无冲突需要手动解决

---

### Requirement: Markdown ↔ Yrs 双向转换
系统 SHALL 支持 Markdown 与 Yrs Doc 无损双向转换。

#### Scenario: 从 Markdown 创建 Yrs Doc
- **WHEN** 用户导入已有 Markdown 笔记
- **THEN** Markdown 正确解析为 Yrs 块结构

#### Scenario: 导出 Markdown
- **WHEN** Yrs Doc 有修改
- **THEN** 自动导出为标准 Markdown 文件

---

### Requirement: 同步服务器
系统 SHALL 提供 Rust 编写的同步服务器，支持多用户、多 vault 同步。

#### Scenario: 同步服务启动
- **WHEN** 用户启动同步服务器（Docker 或本地 binary）
- **THEN** 服务监听指定端口，接受客户端连接

#### Scenario: 客户端连接
- **WHEN** 客户端连接到同步服务器
- **THEN** 完成认证后建立 WebSocket 连接，开始交换增量更新

---

### Requirement: E2EE 端到端加密
系统 SHALL 使用 XChaCha20-Poly1305 + Argon2id 实现端到端加密。

#### Scenario: 密钥派生
- **WHEN** 用户设置主密码
- **THEN** 使用 Argon2id 派生主密钥，盐值随机生成

#### Scenario: 加密传输
- **WHEN** CRDT Update 发送到同步服务器
- **THEN** Update 整个用 XChaCha20-Poly1305 加密，服务端无法解密内容

#### Scenario: 元数据加密
- **WHEN** 笔记元数据存储在服务器
- **THEN** 元数据也被加密，服务端仅知道 doc_id 和版本，不知道内容含义

---

### Requirement: 密钥管理
系统 SHALL 集成 OS Keychain 存储主密钥。

#### Scenario: 密钥存储
- **WHEN** 用户解锁 vault 后
- **THEN** 密钥存储在系统 Keychain（macOS Keychain / Windows Credential Manager / Linux libsecret）

#### Scenario: 自动解锁
- **WHEN** 应用重启
- **THEN** 从 OS Keychain 读取密钥，无需用户输入密码

---

### Requirement: Docker 一键部署
系统 SHALL 提供 Docker Compose 配置，一键部署同步服务器。

#### Scenario: 部署
- **WHEN** 用户运行 `docker-compose up -d`
- **THEN** 同步服务启动，包含 PostgreSQL 存储加密 blob，Redis 用于缓存 vector clock

---

### Requirement: 移动端适配
系统 SHALL 支持 iOS/Android 移动端（Tauri Mobile）。

#### Scenario: 移动端编辑
- **WHEN** 用户在移动端打开笔记
- **THEN** TipTap 编辑器适配触控，所有功能正常使用

#### Scenario: 移动端同步
- **WHEN** 移动端有网络连接
- **THEN** 自动同步变更到服务器

---

### Requirement: Web 端完整功能
系统 SHALL 提供完整 Web 版本，通过 Tauri 兼容 Web 后端。

#### Scenario: Web 端登录
- **WHEN** 用户访问 Web 端
- **THEN** 输入主密码解锁 vault，加载所有笔记

#### Scenario: Web 端编辑
- **WHEN** 用户在 Web 端编辑笔记
- **THEN** 所有编辑功能与桌面端一致，变更自动同步
