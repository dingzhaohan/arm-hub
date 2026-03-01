
# 论文复现网站（Paper–ARM Hub）详细开发文档 v1.0

## 1. 目标与范围

### 1.1 产品目标

构建一个“论文复现成果（ARM, Agent Ready Manuscript）”网站，支持：

1. 用户使用 **Bohrium** 账号登录（复用 Bohrium 用户体系）
2. 登录后调用 Bohrium open-platform 论文搜索服务，检索论文元信息
3. 用户为论文上传 ARM（四模块必备：**Code / Dataset / Report / Trace**）
4. ARM 代码可在前端以 GitHub 风格浏览（目录树 + 文件预览 + README 渲染）
5. Dataset 与 Skill（你口述中的 Scale，这里统一叫 Skill）可上传/下载并与 ARM/Paper 产生关联
6. 预留 ARM 自动评分接口：未来 agent 自动对 ARM 打分并回写

### 1.2 非目标

* 不引入管理员账号、审核流、奖励机制、reviewer 工作流
* 不做复杂的组织级权限/共享 ACL（仅匿名 vs 登录）
* 不做富文本编辑器（报告/说明用 Markdown）

---

## 2. 关键决策（冻结）

1. **Trace 必填**（ARM 四模块之一，提交前必须上传）
2. **匿名用户不允许在线调用 Bohrium 论文搜索**
3. ARM 多版本必须有独立表：`arm_series` + `arm_versions`
4. Code 浏览方案：上传 `code.zip` → 后端解压到 OSS `extracted/` + 生成 `manifest.json` → 前端按路径浏览
5. OSS 对象全部 **private**；**所有下载/文件预览都必须登录**
6. 用户体系完全复用 Bohrium：userId/orgId 取自 token；站内仅存“映射与业务数据”（ARM/关注/资源归属等）

---

## 3. 术语与对象定义

### 3.1 术语

* **Paper**：论文条目。来源于 Bohrium 搜索结果；站内落库后用于关联 ARM/Dataset/Skill
* **bohrium_paper_id**：Bohrium 搜索服务返回的论文唯一 ID（字符串），作为外部主键
* **ARM**：论文复现包
* **ARM Series**：某用户对某篇 Paper 的一个复现系列（多版本容器）
* **ARM Version**：某 Series 下的一个具体版本（包含 Code/Dataset/Report/Trace 文件与关联）
* **Dataset**：数据集资源（文件存 OSS，私有）
* **Skill**：技能资源（zip + md，存 OSS，私有）

---

## 4. 权限模型

系统只有两类访问状态：

### 4.1 匿名（未登录）

* ✅ 浏览：Home、站内 Paper 列表/详情、ARM 列表/详情（仅元信息）、Dataset/Skill 列表/详情（仅元信息）
* ❌ 禁止：在线 Bohrium 搜索、上传、关注、个人中心、下载与文件内容预览（因为 OSS 私有）

### 4.2 登录用户（Bohrium）

* ✅ 在线 Bohrium 搜索
* ✅ 上传 ARM/Dataset/Skill
* ✅ 下载与预览私有 OSS 对象
* ✅ 关注/个人中心

**资源编辑/删除规则：**

* 仅上传者（owner）可编辑/删除自己的 ARM/Dataset/Skill
* 不存在管理员覆盖权限

---

## 5. 信息架构（页面与核心功能）

### 5.1 Home（`/`）

* 统计卡片：Paper 总数、ARM 总数、Dataset 总数、Skill 总数
* 列表：最新 ARM、最高分 ARM（按 score_total）
* 所有内容匿名可浏览（仅元信息）

### 5.2 Paper

#### 5.2.1 站内 Paper 列表（`/papers`）

* 匿名可浏览：站内已落库 Papers（可按 title/author/year 本地搜索）
* 登录额外功能：“在线搜索 Bohrium”入口（调用后端代理搜索）

#### 5.2.2 Paper 详情（`/papers/:paper_id`）

展示：

* Paper 元信息
* 关联 ARM Series/Versions 列表
* 关联 Dataset/Skill（通过 ARM 派生聚合）
  按钮：
* 登录后：上传 ARM、关注论文

### 5.3 ARM

#### 5.3.1 ARM Series 列表（`/arms`）

* 展示最新版本摘要（版本号、状态、分数、更新时间、上传者）
* 支持按 paper/domain/year/uploader/score 过滤（可逐步加）

#### 5.3.2 ARM 详情（`/arm-versions/:arm_version_id`）

分区块：

1. Paper 元信息（title/authors/abstract/citation/impact）
2. Score（展示总分 + 维度 + 评分报告摘要）
3. Code：GitHub 风格目录树 + 文件预览 + README 默认展示 + 下载
4. Dataset：卡片列表（跳转 dataset 详情、下载、下载次数）
5. Report：Markdown 渲染
6. Trace：预览/下载（必须存在）

> 说明：由于 OSS 私有，ARM 的 Code/Report/Trace/Dataset 文件内容与下载 **必须登录**。

### 5.4 Dataset

* 列表（`/datasets`）：元信息卡片（匿名可见）
* 详情（`/datasets/:dataset_id`）：

  * 元信息（匿名可见）
  * 登录后：下载按钮（signed url）
  * 关联 ARM Versions 列表（反查）
  * 关联 Papers 列表（通过 ARM 派生）

### 5.5 Skill

* 列表（`/skills`）：元信息卡片（匿名可见）
* 详情（`/skills/:skill_id`）：

  * 元信息（匿名可见）
  * 登录后：渲染 skill.md、下载 skill.zip（signed url）
  * 关联 ARM Versions 列表（反查）

### 5.6 个人中心（`/profile`，登录必需）

展示：

* 我关注的 Papers / Datasets / Skills
* 我提交的 ARM Series/Versions（含状态与分数）
* （可选）我的下载统计、我的评分任务概览

---

## 6. 关系模型（逻辑检查与一致性）

### 6.1 事实来源（必须遵守）

**ARM Version 是关联枢纽（source of truth）**：

* Paper 1—N ARM Series
* ARM Series 1—N ARM Versions
* ARM Version N—M Datasets
* ARM Version N—M Skills

**Paper ↔ Dataset / Paper ↔ Skill 不额外存映射表**，统一通过 ARM Version 关联派生（join distinct）以避免双写不一致。

### 6.2 反向关联必须支持

* Paper → ARM Versions：直接查
* Paper → Datasets：`Paper -> ARM Versions -> arm_version_datasets -> Datasets (distinct)`
* Dataset → ARM Versions：`arm_version_datasets` 反查
* Dataset → Papers：`Dataset -> arm_version_datasets -> ARM Versions -> Paper (distinct)`
* Skill 同理

---

## 7. 存储设计（OSS 私有对象）

### 7.1 总原则

* 所有对象 **private**
* 上传：前端通过后端签发 STS 临时凭证，直传 OSS
* 下载/预览：后端鉴权后返回 Signed URL（短时效）或后端代理流式下载
* 所有下载/预览 **必须登录**

### 7.2 OSS Key 规范（强制，满足 paperId/bohrium_paper_id/userId/armVersionId 索引）

#### ARM Version 根前缀

```
papers/{paper_id}/bohrium/{bohrium_paper_id}/users/{bohrium_user_id}/arm_versions/{arm_version_id}/
  code/code.zip
  code/extracted/{...}
  code/manifest.json
  report/report.md
  trace/trace.zip
  runtime/runtime.json            (optional)
  score/report.md                 (optional, agent output)
```

#### Dataset

```
datasets/{dataset_id}/users/{bohrium_user_id}/origin/
  paper/{paper_id}/bohrium/{bohrium_paper_id}/arm_version/{arm_version_id}/dataset.zip
```

#### Skill

```
skills/{skill_id}/users/{bohrium_user_id}/skill.zip
skills/{skill_id}/users/{bohrium_user_id}/skill.md
```

### 7.3 Code 浏览所需的 extracted/ 与 manifest.json

* `code.zip` 永远保留（整体下载）
* `code/extracted/`：解压后的目录结构，用于按路径浏览
* `code/manifest.json`：索引文件（强烈建议，用于快速构建目录树 + 判断文本/二进制/大小）

**manifest.json 最小结构建议：**

```json
{
  "root": "",
  "generated_at": "2026-03-01T00:00:00Z",
  "files": [
    {"path":"README.md","size":1234,"is_text":true,"lang":"markdown"},
    {"path":"src/main.py","size":4321,"is_text":true,"lang":"python"},
    {"path":"assets/logo.png","size":9999,"is_text":false}
  ]
}
```

---

## 8. ARM 上传流程（端到端，必须清晰可实现）

### 8.1 ARM 创建与多版本

1. 用户选择一篇 Paper（站内 paper_id + bohrium_paper_id 已存在或 ensure）
2. 创建 ARM Series（归属当前登录用户）
3. 在 Series 下创建一个 ARM Version（version 字符串由用户输入，如 `1.0.0`）

### 8.2 四模块上传（必须模块）

* Code：`code.zip`（必须）
* Report：`report.md`（必须）
* Trace：`trace.zip`（必须）
* Dataset：至少 1 个 dataset（必须）

### 8.3 上传步骤（推荐标准化为 5 步）

**Step 1**：创建 version（DB 生成 arm_version_id + storage_prefix）
**Step 2**：针对每个模块请求 upload-credential（STS + object_key）
**Step 3**：前端直传 OSS（private）
**Step 4**：逐个模块 complete（登记 oss_key/size/hash）
**Step 5**：提交 complete（后端校验 + 解压 + manifest 生成）

### 8.4 强制校验规则（提交时）

* Trace 必填：trace.zip 必须存在
* Code 必填：code.zip 必须存在
* Report 必填：report.md 必须存在
* Dataset 必须至少 1 个绑定到该 arm_version
* 解压 code.zip 后根目录必须包含 `README.md`（大小写兼容 `readme.md`）
* 解压过程必须防 ZipSlip（禁止 `../` 路径穿越）
* 解压总文件数、总大小需限制（可配置）

### 8.5 状态机（替代审核流）

`draft` → `uploading` → `processing` → `ready`
任何阶段失败进入 `failed`（需记录错误原因）

---

## 9. Bohrium 在线论文搜索接入（后端代理）

### 9.1 用户 accessKey 获取（后端内部）

* 从 token 得到 `bohrium_user_id` / `bohrium_org_id`
* 调用 Bohrium Core API `GET /api/v1/ak/list`（header: `X-User-Id`, `X-Org-Id`）
* 获取默认 accessKey（优先 default；否则取第一项）
* 建议缓存 5–10 分钟（key=(userId, orgId)）

### 9.2 在线搜索规则

* **必须登录**才能调用在线搜索接口（后端强制 401）
* 后端拿到 user accessKey 后，调用 open-platform 搜索服务（header `accessKey: <user_ak>`）
* 后端返回规范化后的论文结果给前端
* 前端从结果中可 “ensure 落库” 成站内 Paper（用于后续关联 ARM）

---

## 10. 数据库设计（MySQL）——最终表结构

> 可在现有表基础上增量添加；旧 arms 表可保留兼容，但新逻辑全部走新表。

### 10.1 papers

* id (PK)
* bohrium_paper_id (UNIQUE, string)
* doi, title, authors, abstract（可分中英字段）
* citation_nums, impact_factor, impact_score, publication fields, year/cover_date_start
* created_at, updated_at

### 10.2 arm_series

* id (PK)
* paper_id (FK)
* bohrium_paper_id（冗余，便于路径组装）
* owner_user_id (FK users)
* title, description
* created_at, updated_at

### 10.3 arm_versions

* id (PK)
* series_id (FK)
* paper_id (FK)
* bohrium_paper_id（冗余）
* owner_user_id (FK)
* version (string, unique per series)
* status (draft/uploading/processing/ready/failed)
* storage_prefix (string)

**四模块定位：**

* code_zip_key (NOT NULL)
* code_manifest_key (NULL)
* report_md_key (NOT NULL)
* trace_zip_key (NOT NULL)
* runtime_key (NULL)

**展示/排序：**

* entry_command (text)
* runtime_env (text)
* score_total (float, NULL)
* downloads (int)
* created_at, updated_at

### 10.4 datasets

* id (PK)
* name, description
* oss_bucket, oss_key (dataset.zip)
* size_bytes, checksum
* uploader_user_id (FK)
* is_private (bool=1)
* downloads
* created_at, updated_at

### 10.5 skills

* id (PK)
* name, description, tags, version
* oss_bucket, oss_zip_key, oss_md_key
* uploader_user_id (FK)
* is_private (bool=1)
* downloads
* created_at, updated_at

### 10.6 关联表

* arm_version_datasets(arm_version_id, dataset_id, created_at) PK(arm_version_id,dataset_id)
* arm_version_skills(arm_version_id, skill_id, created_at) PK(arm_version_id,skill_id)

### 10.7 关注表

* user_follow_papers(user_id, paper_id, created_at) PK(user_id,paper_id)
* user_follow_datasets(user_id, dataset_id, created_at) PK(user_id,dataset_id)
* user_follow_skills(user_id, skill_id, created_at) PK(user_id,skill_id)

### 10.8 评分表（预留）

* arm_score_jobs(id, arm_version_id, status, triggered_by, created_at, updated_at)
* arm_score_results(id, job_id, arm_version_id, total_score, dimensions_json, report_md_key, created_at)

---

## 11. 后端 API 契约（FastAPI，最终版）

### 11.1 认证

* `GET /api/auth/me`（登录）：返回站内 user 信息（含 bohrium_user_id/org_id）
* `GET /api/auth/bohrium/me`（登录）：返回 Bohrium 用户信息（可选透传）

### 11.2 在线论文搜索（登录必需）

* `POST /api/papers/search/bohrium`（登录）

  * 入参：关键词、筛选条件（按 Bohrium 搜索协议）
  * 行为：后端获取用户 AK → 调 open-platform → 返回结果
  * 输出：论文列表（含 `bohrium_paper_id`）

### 11.3 Paper 落库与聚合

* `POST /api/papers/ensure`（登录）

  * 入参：bohrium_paper_id + 元信息（title/authors/abstract/citation/impact…）
  * 行为：upsert papers（bohrium_paper_id unique）
  * 出参：paper_id
* `GET /api/papers`（匿名）
* `GET /api/papers/{paper_id}`（匿名）

  * 返回：paper 元信息 + arm_series/versions 摘要 + 派生 datasets/skills（distinct）
* `GET /api/papers/{paper_id}/arm-series`（匿名）
* `GET /api/papers/{paper_id}/datasets`（匿名，派生）
* `GET /api/papers/{paper_id}/skills`（匿名，派生）

### 11.4 ARM Series / Versions

#### Series

* `POST /api/arm-series`（登录）
* `GET /api/arm-series?paper_id=...`（匿名）
* `GET /api/arm-series/{series_id}`（匿名）
* `DELETE /api/arm-series/{series_id}`（登录，owner）

#### Versions

* `POST /api/arm-series/{series_id}/versions`（登录，owner）
* `GET /api/arm-versions/{arm_version_id}`（匿名，元信息）
* `DELETE /api/arm-versions/{arm_version_id}`（登录，owner）

### 11.5 ARM 上传（OSS）

* `POST /api/arm-versions/{arm_version_id}/upload-credential`（登录，owner）

  * 入参：module=code|report|trace|runtime|dataset + filename
  * 出参：sts + bucket + object_key + expire_at
* `POST /api/arm-versions/{arm_version_id}/complete`（登录，owner）

  * 入参：四模块 keys（code_zip_key/report_md_key/trace_zip_key/runtime_key optional） + dataset_ids 关联是否齐全
  * 行为：强制校验 + 进入 processing + 触发解压/manifest
  * 出参：status

### 11.6 ARM 内容浏览（登录必需）

> 因为 OSS 私有，所有 code/report/trace 文件内容都必须登录后才能访问。

* `GET /api/arm-versions/{arm_version_id}/content/{tab}?path=...`（登录）

  * tab：code | report | trace | runtime
  * 行为：返回目录 entries 或文件内容（文本最大 1MB，超限返回 truncated + download_url）
* `GET /api/arm-versions/{arm_version_id}/content/{tab}/download?path=...`（登录）

  * 行为：下载计数 + 返回 signed url

### 11.7 Dataset

* `POST /api/datasets`（登录）：创建元信息（包含 origin：paper_id/bohrium_paper_id/arm_version_id）
* `POST /api/datasets/{dataset_id}/upload-credential`（登录，owner）
* `POST /api/datasets/{dataset_id}/complete`（登录，owner）
* `GET /api/datasets`（匿名）
* `GET /api/datasets/{dataset_id}`（匿名）
* `GET /api/datasets/{dataset_id}/download`（登录）
* `GET /api/datasets/{dataset_id}/arm-versions`（匿名）
* `GET /api/datasets/{dataset_id}/papers`（匿名，派生）

### 11.8 Skill

* `POST /api/skills`（登录）
* `POST /api/skills/{skill_id}/upload-credential`（登录，owner）
* `POST /api/skills/{skill_id}/complete`（登录，owner）
* `GET /api/skills`（匿名）
* `GET /api/skills/{skill_id}`（匿名，元信息；md 内容是否匿名展示可配置，默认登录才展示 md）
* `GET /api/skills/{skill_id}/download`（登录）
* `GET /api/skills/{skill_id}/arm-versions`（匿名）

### 11.9 Follow + Profile

* `POST /api/me/follows/papers/{paper_id}`（登录，toggle）
* `POST /api/me/follows/datasets/{dataset_id}`（登录，toggle）
* `POST /api/me/follows/skills/{skill_id}`（登录，toggle）
* `GET /api/me/profile`（登录）

  * 返回：关注列表 + 我的 arm_series/arm_versions + 我的 datasets/skills（可选）

### 11.10 Scoring（预留）

* `POST /api/arm-versions/{arm_version_id}/score/request`（登录，owner）

  * 创建 job（pending），返回 job_id
* `GET /api/arm-versions/{arm_version_id}/score`（匿名可读总分与状态；详情维度仅登录可读亦可）
* `POST /api/scoring/jobs/{job_id}/callback`（服务间鉴权）

  * agent 上报：total_score + dimensions_json + report_md_key
  * 回填：更新 job 状态、写 result、更新 arm_versions.score_total

---

## 12. 前端技术方案（React）

### 12.1 基本原则

* 前端永远只持有 `brmToken`（登录后）
* 不暴露 Bohrium 用户 accessKey 给前端
* OSS 上传使用 STS 直传（前端 SDK 或 XHR）
* 文件预览/下载均走后端鉴权接口拿 signed url 或内容

### 12.2 GitHub 风格 Code 浏览组件

建议实现：

* 左侧：目录树（懒加载或一次加载 manifest 构建树）
* 右侧：文件预览

  * Markdown：渲染（README.md 默认展示）
  * 代码：语法高亮（建议 CodeMirror 或 Monaco 只读模式）
  * 大文件：提示下载

### 12.3 ARM 上传向导（推荐 UI）

* Step 1：选择 Paper（或从 Paper 详情进入）
* Step 2：创建 Series & Version
* Step 3：上传 Code.zip（展示 README 检查结果）
* Step 4：上传 Report.md
* Step 5：上传 Trace.zip（必填）
* Step 6：上传 Dataset（至少 1 个）
* Step 7：提交（complete）→ 显示 processing → ready

---

## 13. 安全与工程要求（必须落地）

### 13.1 防越权

* 所有上传/complete 操作必须校验 owner_user_id
* 所有 signed url 生成必须校验登录且有权限访问该资源（至少存在性 + private 资源必须登录）

### 13.2 防 zip 漏洞

* 解压必须防 ZipSlip：禁止 `../`、绝对路径、软链接逃逸
* 限制最大文件数/最大解压总大小
* 超限直接失败并记录原因（arm_version.status=failed）

### 13.3 日志与密钥

* 禁止日志打印用户 accessKey、STS secret
* 错误日志仅记录 request_id、userId、orgId、path、status、latency

---

## 14. 开发里程碑（可执行拆解）

### Milestone A：DB + OSS 基建

* 新表与字段迁移
* OSS service：STS、signed url、list/get/head
* 登录鉴权中间件（匿名/登录分流）

### Milestone B：ARM 多版本主链路

* arm_series + arm_versions CRUD
* 4 模块上传 credential + complete
* 解压 code.zip 到 extracted/ + manifest.json
* content/{tab} 浏览 + download

### Milestone C：Paper 搜索代理 + ensure 落库

* 用户 AK 获取（core api）
* open-platform 搜索代理（登录必需）
* papers.ensure + paper 详情聚合（arms/datasets/skills）

### Milestone D：Dataset/Skill OSS 化 + 反向关联

* Dataset 文件上传/下载 + 反查 arms/papers
* Skill zip+md 上传/下载 + 反查 arms

### Milestone E：个人中心 + 关注

* follow 表 + toggle API
* /profile 聚合展示

### Milestone F：评分预留

* score/request、score/query、callback
* ARM 详情展示分数与状态

---

## 15. 验收清单（功能级）

### 15.1 必须通过

* 登录后可在线搜索 Bohrium 论文，拿到含 `bohrium_paper_id` 的结果
* 可 ensure 落库 Paper，并在 Paper 详情页看到关联 ARM 列表
* 可创建 ARM Series、创建 ARM Version，并完成四模块上传
* Trace 必填：缺 Trace 无法 complete
* code.zip 解压并生成 extracted/ + manifest，README.md 默认展示
* ARM 代码可像 GitHub 一样浏览目录与文件
* 所有下载必须登录（ARM/Dataset/Skill 一致）
* Dataset/Skill 与 ARM 的关联与反向查询可用
* 评分接口存在且可跑通：request 创建 job、callback 回填 score_total、ARM 列表/详情展示分数

---

如果你希望我把这份文档**再进一步“工程化到可复制粘贴”**的程度（例如：MySQL migration 脚本、FastAPI 路由文件骨架、Pydantic schema 全量字段定义、OSS STS policy 模板、前端接口对接表），我也可以继续输出一个 **“Implementation Pack”**，但不会改变以上需求与契约。
