# ARM Hub 开发进度

> 最后更新: 2026-03-02

---

## 一、已完成功能

### 1. 基础架构

| 模块 | 技术栈 | 说明 |
|------|--------|------|
| Backend | FastAPI + SQLAlchemy + MySQL (RDS) | 13 张表, auto-create |
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

### 3. 文件上传 (STS)

- 后端调用阿里云 STS AssumeRole, 生成临时 AK/SK/Token
- inline policy 按路径前缀限制写权限
- 前端用 `ali-oss` JS SDK 直传 OSS, 支持进度显示
- ARM (code.zip / report.md / trace.zip) + Dataset + Skill 全部走 STS

上传路径:
```
ARM:     papers/{paper_id}/bohrium/{bohrium_paper_id}/users/{uid}/arm_versions/{vid}/{module}/{file}
Dataset: datasets/{dataset_id}/users/{uid}/dataset.zip
Skill:   skills/{skill_id}/users/{uid}/skill.zip
```

### 4. ARM 版本管理

- ARM Series (一篇论文可有多个复现系列)
- ARM Version (每个系列可有多版本, 状态: draft → uploading → processing → ready/failed)
- 四模块必填: Code + Report + Trace + Dataset
- code.zip 上传后自动解压到 OSS `extracted/`, 生成 `manifest.json`

### 5. 代码浏览

- GitHub 风格: 目录树 + 文件内容预览
- 语法高亮 (rehype-highlight)
- README.md 自动渲染

### 6. 其他功能

- Dataset / Skill CRUD + 上传下载
- 用户关注 (Paper / Dataset / Skill)
- 个人中心 (我的 ARM / 我的数据集 / 我的技能 / 关注列表)
- ARM 评分接口 (预留, 支持回调)
- 首页统计 + 最新 ARM 列表

---

## 二、已修复问题

| 问题 | 原因 | 修复 |
|------|------|------|
| 页面白屏 "Something went wrong" | `.env.test` 设 `VITE_BOHRIUM_ENV=test`, 但 bohrium.js 只有 prod/dev 配置, CONFIG=undefined | 改为 `VITE_BOHRIUM_ENV=dev` (dev 对应 test.bohrium.com) |
| `TypeError: Cannot read properties of undefined (reading 'COOKIE_NAME')` | 同上, CONFIG 为 undefined | 同上 |
| ErrorBoundary 点返回首页崩溃 | 错误态下 Router context 丢失, `<Link>` 不可用 | 改用 `<a href="/">` |
| OSS 上传 CORS 403 | bucket 未配置 CORS 规则 | 用 oss2 SDK 配置 CORS (AllowedOrigin=*, AllowedMethod=GET/PUT/POST/DELETE/HEAD) |
| 登录后仍显示 Sign In | AuthContext 读 `user.nickname` 但后端返回 `display_name` | 重写 AuthContext, 调 `/api/auth/me` 统一字段 |
| 论文搜索 paperId 为空导致 422 | 部分中文论文 Bohrium 返回空 paperId | 添加 id → doi 兜底链 |
| MySQL 连接超时 | 默认连接池不回收长空闲连接 | 加 `pool_pre_ping=True`, `pool_recycle=1800` |
| 中文文件名上传失败 | ali-oss SDK 对中文文件名编码异常 | 服务端重命名为 ASCII 文件名 |
| ali-oss multipart 上传报权限错误 | STS policy 只允许 `oss:PutObject` | 扩大为 `oss:*` |

---

## 三、已知问题 / TODO

### 待解决

- [ ] **登录 401**: `account.test.dp.tech` 在公网返回 HTTP 432 (需要飞连 VPN). 服务器 47.92.172.133 在公网, 无法访问内网 Bohrium 账户服务. 需要切换到公网可达的 Bohrium 账户 API, 或部署到内网.
- [ ] **OSS_ROLE_ARN**: 需在 `.env` 中配置阿里云 RAM Role ARN, 上传功能才可用. ARN: `acs:ram::1761286239356625:role/ramossstsupload` (已获取, 待写入)

### 功能待完善

- [ ] ARM 评分: 目前只有接口骨架, 未接入实际评分 agent
- [ ] Skill 与 ARM Version 关联: 上传向导中未集成 Skill 选择步骤
- [ ] 论文详情页: 关联的 Dataset / Skill 列表展示
- [ ] 搜索分页: 当前搜索只返回一页结果 (pageSize=20)
- [ ] 前端暗色模式: 样式已写但未加切换开关
- [ ] 前端代码分包: 单 chunk 1.3MB, 需配置 manualChunks

---

## 四、环境配置

### 后端 `.env` 必填项

```bash
# MySQL
MYSQL_HOST=rm-8vbyu20od5esyu86ldo.mysql.zhangbei.rds.aliyuncs.com
MYSQL_PASSWORD=<password>

# Bohrium Auth (test 环境)
BOHRIUM_ACCOUNT_API=https://account.test.dp.tech
BOHRIUM_CORE_API=https://bohrium-core.test.dp.tech

# Bohrium RAG (论文搜索)
BOHRIUM_BASE_URL=https://uat.bohrium.com
BOHRIUM_RAG_ACCESS_KEY=CPUvBB87aNAxVIzxvmnjCborgKcHoRXM
BOHRIUM_RAG_ACCESS_SECRET=GWWfeUjoX7REbwmfJ7pfFkldhArvhM2D

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
