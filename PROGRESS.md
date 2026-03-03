# ARM Hub 开发进度

> 最后更新: 2026-03-03

---

## 一、已完成功能

### 1. 基础架构

| 模块 | 技术栈 | 说明 |
|------|--------|------|
| Backend | FastAPI + SQLAlchemy + MySQL (RDS) | 14 张表, auto-create |
| Frontend | React 19 + Vite 7 + TailwindCSS v4 | SPA, react-router-dom |
| Auth | Bohrium brmToken (iframe 登录) | 服务端 JWT 校验 |
| Storage | Aliyun OSS (private bucket `arm-hub`) | STS 临时凭证直传 |
| Deploy | 47.92.172.133:50005 | `start.sh` 一键部署 |
| Repo | github.com/dingzhaohan/arm-hub | main 分支 |

### 2. 论文搜索

- 接入 Bohrium RAG API (`uat.bohrium.com/rag/pass/keyword`)
- SHA-512 digest 认证 (accessKey + secret[:10] + 当前分钟)
- 搜索结果自动 upsert 到本地 DB, 无需手动"添加"
- 统一 PaperCard 组件, 展示年份/期刊/引用数/影响因子/DOI/摘要

### 3. 文件上传 (STS + 分片)

- 后端调用阿里云 STS AssumeRole, 生成临时 AK/SK/Token
- inline policy 按路径前缀限制写权限
- 前端用 `ali-oss` JS SDK `multipartUpload` 直传 OSS
- 支持大文件分片上传 (1MB/chunk), 带进度条, 最大 2GB
- 公用上传工具: `frontend/src/utils/ossUpload.js` (ossUpload / validateFile / formatSize)
- ARM (arm.zip) + Dataset (.zip) + Skill (.zip) 全部走 STS 分片上传

上传路径:
```
ARM:     papers/{paper_id}/bohrium/{bohrium_paper_id}/users/{uid}/arm_versions/{vid}/{module}/{file}
Dataset: datasets/{dataset_id}/users/{uid}/dataset.zip
Skill:   skills/{skill_id}/users/{uid}/skill.zip
```

### 4. ARM 版本管理

- ARM Series (一篇论文可有多个复现系列)
- ARM Version (每个系列可有多版本, 状态: draft → uploading → processing → ready/failed)
- **单 zip 上传流程**: 用户上传 arm.zip, 后端自动解压校验
  - arm.zip 必须包含 4 个顶级文件夹: `Code/`, `Report/`, `Dataset/`, `Trace/`
  - `Code/` 必须包含 `README.md`
  - `Report/` 必须包含且仅包含一个 `.md` 文件
  - 解压后自动生成 `code.zip`, `trace.zip`, `manifest.json`, `report.md`
- 上传向导简化为 4 步: 选论文 → 创建系列 → 上传 arm.zip → 提交

### 5. 代码浏览

- GitHub 风格: 目录树 + 文件内容预览
- 语法高亮 (rehype-highlight)
- README.md 自动渲染

### 6. BohrClaw (Agent Playground)

- 导航栏 "BohrClaw" tab, 路由 `/bohrclaw`
- 3 个状态: 未登录 → Launch 按钮 → 新标签页打开 BohrClaw
- 后端 provisioning 流程:
  1. 通过 `bohrium-core` 查用户个人 AK (`/api/v1/ak/list`, X-User-Id)
  2. 通过 `openapi` 查用户项目列表 (`/project/list`), 自动选管理员项目
  3. 创建 Bohrium 计算节点 (`/node/add`)
  4. 轮询等待节点就绪 (status==2)
  5. SSH 进节点, 用 supervisor 启动 OpenClaw (`paramiko`)
  6. **健康检查**: 轮询 OpenClaw HTTP 端口直到返回 200 (最长 120s)
  7. 返回 Web UI URL
- 前端进度展示: 6 步 (fetching_ak → resolving_project → creating_node → waiting_node → starting_service → verifying_service)
- 支持 Destroy 销毁实例 (删除 Bohrium 节点)
- LLM 模型配置通过 ChatBohr API 自动 provision
- 数据库: `bohrclaw_instances` 表 (bohrium_user_id, status, instance_url, node_id, node_ip)
- 关键文件: `backend/bohrclaw_provisioner.py`, `backend/routes/bohrclaw.py`, `frontend/src/pages/BohrClaw.jsx`

### 7. 其他功能

- Dataset / Skill CRUD + 上传下载
- 用户关注 (Paper / Dataset / Skill)
- 个人中心 (我的 ARM / 我的数据集 / 我的技能 / 关注列表)
- ARM 评分接口 (预留, 支持回调)
- 首页统计 + 最新 ARM 列表

---

## 二、Bug 修复记录

### 2.1 前端

| # | 问题 | 原因 | 修复方案 | 涉及文件 |
|---|------|------|----------|----------|
| 1 | 页面白屏 "Something went wrong" | `.env.test` 设 `VITE_BOHRIUM_ENV=test`, 但 `bohrium.js` 只有 prod/dev 配置, `CONFIG=undefined` | 改为 `VITE_BOHRIUM_ENV=dev` (dev 对应 test.bohrium.com) | `frontend/.env.test` |
| 2 | `TypeError: Cannot read properties of undefined (reading 'COOKIE_NAME')` | 同 #1, CONFIG 为 undefined | 同 #1 | `frontend/.env.test` |
| 3 | ErrorBoundary 点"返回首页"崩溃 | 错误态下 Router context 丢失, `<Link>` 不可用 | 改用 `<a href="/">` (原生跳转, 不依赖 Router) | `ErrorBoundary.jsx` |
| 4 | 登录后仍显示 Sign In | AuthContext 读 `user.nickname` 但后端返回 `display_name` | 重写 AuthContext, 调 `/api/auth/me` 统一字段 | `AuthContext.jsx`, `auth.py` |
| 5 | 论文搜索结果点击链接 404 | 部分中文论文 Bohrium 返回空 `paperId` | 添加 `id → doi → title` 兜底链, 确保 PaperCard 链接始终有效 | `Papers.jsx`, `papers.py` |
| 6 | 大文件上传无进度 / 假进度 | `ali-oss` 的 `client.put()` 不支持 progress 回调, 会被静默忽略 | 改用 `client.multipartUpload()` (1MB/chunk), 真实进度回调 | `ossUpload.js`, `Datasets.jsx`, `ArmUploadWizard.jsx` |
| 7 | 上传无文件大小/类型校验 | 前端直接发文件, 无限制 | 添加 `validateFile()`: 最大 2GB, 文件类型白名单, 空文件检查 | `ossUpload.js` |
| 8 | `formatSize()` 重复定义 3 处 | `ArmUploadWizard.jsx`, `Datasets.jsx`, `Skills.jsx` 各自实现 | 抽取到公用 `utils/ossUpload.js`, 全局复用 | `ossUpload.js` |
| 9 | `api.js` 空响应体 crash | `return res.json()` 对 204/空 body 报错 | 已识别, 待修复 (低优先) | `api.js` |

### 2.2 后端

| # | 问题 | 原因 | 修复方案 | 涉及文件 |
|---|------|------|----------|----------|
| 10 | OSS 上传 CORS 403 | bucket 未配置 CORS 规则 | 用 `oss2` SDK 配置 CORS (AllowedOrigin=*, AllowedMethod=GET/PUT/POST/DELETE/HEAD) | OSS 控制台 / 脚本 |
| 11 | ali-oss multipart 上传报权限错误 | STS inline policy 只允许 `oss:PutObject` | 扩大为 `oss:*` (multipart 需要 InitiateMultipartUpload, UploadPart 等) | `oss_service.py` |
| 12 | MySQL 连接超时 (间歇性 500) | 默认连接池不回收长空闲连接, RDS 8 小时断开 | 加 `pool_pre_ping=True`, `pool_recycle=1800` | `database.py` |
| 13 | 中文文件名上传失败 | ali-oss SDK 对中文文件名 URL 编码异常 | 服务端 STS 返回 ASCII 重命名后的 `object_key`, 前端按此上传 | `arms.py`, `datasets.py`, `skills.py` |
| 14 | BohrClaw launch 返回 401 | `get_user_access_key` 从测试环境 bohrium-core 拿 AK, 但调了生产环境 openapi.dp.tech | openapi base URL 改为从 `BOHRIUM_OPENPLATFORM_API` 配置读取; 确保 `.env` 中 BOHRIUM_CORE_API 和 BOHRIUM_OPENPLATFORM_API 指向同一套环境 | `bohrclaw_provisioner.py`, `routes/bohrclaw.py` |
| 15 | BohrClaw 写死 project_id | 硬编码 `project_id=3702960` | 改为通过 openapi `/project/list` 用用户 AK 动态查询, 优先选 projectRole=1 (管理员) 的项目 | `bohrclaw_provisioner.py`, `routes/bohrclaw.py` |
| 16 | BohrClaw 写死平台 AK | 用 `.env` 中的 `BOHRIUM_OPENPLATFORM_AK` 而非用户个人 AK | 改为通过 `get_user_access_key(bohrium_user_id, org_id)` 动态获取用户个人 AK | `routes/bohrclaw.py` |

### 2.3 部署 / 运维

| # | 问题 | 原因 | 修复方案 |
|---|------|------|----------|
| 17 | `npx vite build` EACCES | `frontend/dist/` 目录 owner 是 root, 当前用户无写权限 | `sudo chown -R $USER frontend/dist/` |
| 18 | `start.sh --stop` permission denied | `/tmp/arm-hub.pid` owner 是 root | `sudo rm -f /tmp/arm-hub.pid` |
| 19 | 登录 401 (公网部署) | `account.test.dp.tech` 在公网返回 HTTP 432 (需飞连 VPN) | 需部署到内网, 或切换到公网可达的 Bohrium 账户 API |

---

## 三、代码审查发现 (待修复)

以下问题在全量代码审查中发现, 尚未修复:

### 严重

| 问题 | 文件 | 描述 |
|------|------|------|
| Scoring 回调无认证 | `routes/scoring.py` | `POST /callback` 无 auth 检查, 任何人可伪造评分 |
| CORS 配置风险 | `main.py` | `allow_origins=["*"]` + `allow_credentials=True` 同时设置 |
| arm_content 路径穿越 | `routes/arm_content.py` | `path` 参数未充分校验, 可能读取 OSS 上任意路径 |
| zip 解压 OOM | `oss_service.py` | `extract_arm_zip` 将整个 zip 读入内存, 大文件会导致进程崩溃 |
| 用户创建竞态 | `auth.py` | 并发请求可能重复创建用户 (unique 约束报错) |

### 中等

| 问题 | 文件 |
|------|------|
| 下载计数竞态 (非原子 +1) | `datasets.py`, `skills.py` |
| 无界缓存 (内存泄漏) | `bohrium_auth.py` |
| 阻塞式 HTTP 调用 (占用 worker 线程) | `bohrium_auth.py`, `bohrclaw_provisioner.py` |
| Profile 页缺少计算字段 | `routes/profile.py` |
| 搜索结果无分页 | `routes/papers.py` — **已修复 (v0.7)**: 前端 Papers 页面已接入分页 |

---

## 四、迭代记录

### v0.1 — 基础框架搭建
- FastAPI + React SPA 脚手架
- Bohrium iframe 登录
- 数据库 13 张表 (Users, Papers, ARMSeries, ARMVersion, Datasets, Skills, Follows, Scores)

### v0.2 — 论文搜索
- 接入 Bohrium RAG API
- SHA-512 digest 认证
- 搜索结果自动 upsert (无需手动 "添加论文")
- PaperCard 统一组件

### v0.3 — STS 上传重构
- **旧**: 后端生成 signed PUT URL, 前端 `fetch(PUT)` 上传
- **新**: 后端调 STS AssumeRole 生成临时凭证, 前端用 ali-oss SDK 直传
- 解决: CORS 问题, 权限问题, 中文文件名问题

### v0.4 — 单 zip 上传简化
- **旧**: 分别上传 code.zip / report.md / trace.zip / dataset, 7 步向导
- **新**: 上传单个 arm.zip (含 Code/Report/Dataset/Trace 4 个文件夹), 4 步向导
- 后端 `extract_arm_zip()` 自动校验结构 + 解压各模块

### v0.5 — 大文件分片上传
- **旧**: `client.put()` 不支持 progress, 无文件校验
- **新**: `client.multipartUpload()`, 1MB/chunk, 进度回调, 2GB 上限, 文件类型校验
- 公用工具: `utils/ossUpload.js`

### v0.6 — BohrClaw 集成
- 新增 BohrClaw (Agent Playground) 页面
- 导航栏 "BohrClaw" tab
- Provisioning: bohrium-core 查 AK → openapi 查项目 → 创建节点 → SSH 启动 OpenClaw
- 实例就绪后新标签页打开 (非 iframe)
- Bug 修复: AK 环境不匹配 401, 硬编码 project_id / platform AK

### v0.7 — 健康检查 + 分页 + 品牌统一
- **OpenClaw 健康检查**: 启动 OpenClaw 后, 轮询 HTTP 200 确认服务可用才标记 ready, 避免用户打开白屏
  - `wait_for_openclaw_ready(url, timeout=120, interval=5)` — 只检查 base URL (去掉 query params)
  - 前端新增 `verifying_service` 进度步骤
- **Papers 列表分页**: 前端 `loadPapers()` 传 `limit=20, offset=page*20`, 底部 Prev/Next 翻页
  - 后端 `GET /api/papers` 已支持 `limit`/`offset`, 返回 `total`, 前端原来没用
- **品牌统一**: 所有 "OpenClaw" 展示文本改为 "BohrClaw", 路由 `/playground` → `/bohrclaw`

---

## 五、环境配置

### 后端 `.env` 必填项

```bash
# MySQL
MYSQL_HOST=rm-8vbyu20od5esyu86ldo.mysql.zhangbei.rds.aliyuncs.com
MYSQL_PASSWORD=<password>

# Bohrium Auth
# ⚠️ BOHRIUM_CORE_API 和 BOHRIUM_OPENPLATFORM_API 必须指向同一套环境
# 生产: bohrium-core.dp.tech + openapi.dp.tech
# 测试: bohrium-core.test.dp.tech + ??? (需确认测试版 openapi 地址)
BOHRIUM_ACCOUNT_API=https://account.test.dp.tech
BOHRIUM_CORE_API=https://bohrium-core.test.dp.tech
BOHRIUM_OPENPLATFORM_API=https://openapi.dp.tech
BOHRIUM_OPENPLATFORM_AK=<platform-ak>   # 备用, 当前未使用

# Bohrium RAG (论文搜索)
BOHRIUM_BASE_URL=https://uat.bohrium.com
BOHRIUM_RAG_ACCESS_KEY=<key>
BOHRIUM_RAG_ACCESS_SECRET=<secret>

# OSS
OSS_ENDPOINT=https://oss-cn-beijing.aliyuncs.com
OSS_BUCKET=arm-hub
OSS_ACCESS_KEY_ID=<ak>
OSS_ACCESS_KEY_SECRET=<sk>
OSS_ROLE_ARN=acs:ram::1761286239356625:role/ramossstsupload
```

### 前端 `.env.test`

```bash
VITE_BOHRIUM_ENV=dev   # dev 对应 test.bohrium.com
```

### 启动

```bash
./start.sh              # 构建前端 + 启动后端
./start.sh --daemon     # 后台运行
./start.sh --skip-build # 跳过前端构建
./start.sh --stop       # 停止
```

---

## 六、关键经验

### STS 上传
- STS inline policy 必须包含 `oss:*` (不能只给 `oss:PutObject`), 因为 multipart upload 需要 `InitiateMultipartUpload`, `UploadPart`, `CompleteMultipartUpload` 等多个 action
- ali-oss SDK 的 `client.put()` 不支持 progress 回调, 必须用 `client.multipartUpload()`
- 中文文件名在 ali-oss SDK 中会导致编码问题, 服务端应返回 ASCII 化的 object_key

### Bohrium 环境
- `bohrium-core.test.dp.tech` 返回的用户 AK 仅在测试环境有效, 不能用于生产 `openapi.dp.tech`
- `.env` 中 `BOHRIUM_CORE_API` (查 AK) 和 `BOHRIUM_OPENPLATFORM_API` (调 openapi) 必须指向同一套环境, 否则 AK 跨环境 401
- `account.test.dp.tech` 在公网不可达 (返回 432), 需飞连 VPN 或部署到内网

### BohrClaw
- 所有面向用户的文本统一用 "BohrClaw" 品牌, 不要混用 OpenClaw
- 路由路径 `/bohrclaw`, 不要用 `/playground` 等泛化名称
- OpenClaw 服务启动后不能立即标记 ready — 进程起来不代表 HTTP 可用, 必须健康检查
- 健康检查只 GET base URL (去掉 `?token=...`), 返回 200 即算就绪
- 超时 120s 足够 (supervisor 会自动重启 gateway, 通常 30s 内就绪)
- 前端进度条要和后端 `on_step()` 回调的 step key 严格对齐, 否则进度会跳步

### 分页
- 后端如果已支持 `limit`/`offset` 分页, 前端一定要用上, 不要无参全量加载
- 分页 UI: `page` state (0-based), `offset = page * PAGE_SIZE`, `total > PAGE_SIZE` 时显示
- 搜索后要 `setPage(0)` 重置页码, 否则可能看到空页
