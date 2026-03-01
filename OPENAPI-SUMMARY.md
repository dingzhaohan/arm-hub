# Bohrium OpenAPI 接口验证总结报告

> 日期：2026-02-28
> 测试账号：userId=157, accessKey=f0f923c97c***

## 一、项目背景

本次工作的目标是系统性地验证 Bohrium 平台 OpenAPI 网关的各模块接口，确认哪些端点可用、哪些不可用，并为每个模块编写标准化的 SKILL 文档（含完整 Python Client 代码和 curl 示例），供 AI Agent 和开发者使用。

---

## 二、架构理解

### 2.1 三层服务架构

```
用户请求
  │
  ▼
openapi（Go/Gin 网关）         ← 代码位置: /home/claude/gitlab/openapi
  │  认证 accessKey → userId/orgId
  │  路由分发 → 不同的转发函数
  │
  ├──► bohrium-api（Go/Gin 中间层）  ← 代码位置: /home/claude/gitlab/bohrium-api
  │     接收 JWT Bearer Token
  │     处理业务逻辑或再转发到 bohrium-core
  │
  ├──► bohrium-core（Go/Gin 核心服务）← 代码位置: /home/claude/gitlab/bohrium-core
  │     直接操作 MySQL 数据库
  │     处理节点、数据集、镜像等核心逻辑
  │
  ├──► KnowledgeDatabase 服务        ← 知识库独立服务
  ├──► Database 服务                  ← 数据库查询独立服务
  └──► Parse 服务                     ← PDF 解析独立服务
```

### 2.2 核心认证流程

```
1. 用户请求带 accessKey（Header 或 Query）
2. openapi 调用 bohrium-core 的 /api/v1/ak/get_user 验证
3. 获取 userId + orgId
4. 注入下游请求头：
   - 转发到 bohrium-core: 设置 X-User-Id / X-Org-Id
   - 转发到 bohrium-api:  设置 X-User-Id / X-Org-Id + Authorization: Bearer <临时JWT>
   - 转发到 Knowledge:    设置 X-User-Id / X-Org-Id
   - 转发到 Database:     设置 X-User-Id / X-Org-Id
```

### 2.3 六种转发函数

| 转发函数 | 目标服务 | 路径映射 | 使用模块 |
|----------|----------|----------|----------|
| `brmCoreTrans` | bohrium-core | `/api/v1/{module}{path}` | Node, Dataset |
| `brmTransAccessKey` | bohrium-api | `/bohrapi/v1/{module}{path}` + JWT | Job, JobGroup |
| `bohrapiTransAccessKey` | bohrium-api | `/bohrapi/v{n}/{module}{path}` + JWT | File, Image(v1), Project |
| `brmAPITrans` | bohrium-api | `/bohrapi/v1/{module}{path}` | Image(v2) |
| `kdfileTrans` | KnowledgeDatabase | `/api/v1/{fixedPath}` | Knowledge |
| `databaseAPITrans` | Database | 硬编码路径映射 | Database |

**关键区别：**
- `brmCoreTrans` 直接转发到 bohrium-core，不需要 JWT
- `brmTransAccessKey` 和 `bohrapiTransAccessKey` 会额外生成临时 JWT Token 转发到 bohrium-api
- `kdfileTrans` 有特殊的路径重写逻辑（去掉 `/knowledge/` 前缀）
- `databaseAPITrans` 使用 switch-case 硬编码映射，只支持两个路径

---

## 三、各模块测试结果

### 3.1 总览

| 模块 | 转发目标 | 可用端点数 | 不可用端点数 | 整体评价 |
|------|----------|-----------|-------------|---------|
| Node（开发机） | bohrium-core | 13 | 0 | ✅ 完全可用 |
| Job（任务） | bohrium-api | 11 | 3 | ✅ 基本可用 |
| Project（项目） | bohrium-api | 14 | 4 | ✅ 基本可用 |
| Image（镜像） | bohrium-api/core | 16 | 7 | ⚠️ v1 部分不可用，推荐 v2 |
| Dataset（数据集） | bohrium-core | 18 | 0 | ✅ 完全可用 |
| File（文件） | bohrium-api | 15+ | 2 | ✅ 基本可用 |
| Knowledge（知识库） | KnowledgeDB | 2 | 5+ | ⚠️ 仅 list 和 create 可用 |
| Database（数据库） | Database | 0 | 2 | ❌ 服务不可达，返回 404 |

### 3.2 详细 CRUD 测试

#### Node（开发机）— 全部通过

| 操作 | 端点 | 结果 |
|------|------|------|
| 列表 | `GET /node/list` | ✅ 返回完整节点列表 |
| 精简列表 | `GET /node/lite_list` | ✅ |
| 详情 | `GET /node/{machineId}` | ✅ 注意用 machineId 不是 nodeId |
| 创建 | `POST /node/add` | ✅ 返回 machineId（可能遇到无资源错误） |
| 停止 | `POST /node/stop/{machineId}` | ✅ |
| 重启 | `POST /node/restart/{machineId}` | ✅ 需先停止 |
| 删除 | `POST /node/del/{machineId}` | ✅ |
| 资源列表 | `GET /node/resources` | ✅ |
| 价格查询 | `GET /node/resources/price` | ✅ |

#### Job（任务）— 注意 v1/v2 差异

| 操作 | 端点 | 结果 |
|------|------|------|
| 列表 | `GET /v1/job/list` | ✅ |
| 创建 | `POST /v1/job_group/add` | ✅ 返回 groupId |
| 日志 | `GET /v1/job/{jobId}/log` | ✅ |
| 终止 | `POST /v1/job/kill/{groupId}` | ✅ 注意用 groupId |
| 删除 | `POST /v1/job/del/{jobId}` | ✅ |
| v2 接口 | `GET /v2/job/*` | ❌ 全部 404 |

#### Image（镜像）— v1 有路由冲突

| 操作 | 端点 | 结果 |
|------|------|------|
| v1 列表 | `GET /v1/image/list` | ✅ 唯一可用的 v1 端点 |
| v1 public | `GET /v1/image/public` | ❌ 被 `/:imageId` 捕获 |
| v2 公共列表 | `GET /v2/image/public` | ✅ |
| v2 私有列表 | `GET /v2/image/private` | ✅ 需要 device+type 参数 |
| v2 创建 | `POST /v2/image/private` | ✅ |
| v2 删除 | `DELETE /v2/image/private/{id}` | ✅ |

### 3.3 SKILL 文档产出

共产出 7 份标准化 SKILL 文档，位于 `docs/skills/` 目录：

```
docs/skills/
├── SKILL-node.md        (511 行)
├── SKILL-job.md         (514 行)
├── SKILL-project.md     (497 行)
├── SKILL-image.md       (659 行)
├── SKILL-dataset.md     (621 行)
├── SKILL-file.md        (709 行)
└── SKILL-knowledge.md   (232 行)
```

每份文档统一格式：概述 → API 信息表 → 端点详情 → Python Client 类 → curl 示例 → 不可用端点 → 常见问题

---

## 四、发现的关键问题和教训

### 4.1 路由设计陷阱：`/:id` 通配路由吞噬命名路径

**问题：** 多个模块的路由定义了 `/:id` 通配路由，导致像 `/public`、`/private`、`/list`、`/metrics` 这样的命名路径被当作 ID 解析。

**受影响的模块：**

| 模块 | 被吞噬的路径 | 错误信息 |
|------|-------------|---------|
| Image v1 | `/image/public`, `/image/private` | `strconv.ParseUint: parsing "public": invalid syntax` |
| Dataset | `/ds/list` | `id is invalid` |
| Knowledge | `/knowledge_base/document_list` | `strconv.ParseUint: parsing "document_list"` |

**教训：**
- Gin 框架中，`/:id` 和 `/public` 是冲突的——它们在同一个路由层级上竞争
- 在 bohrium-core 的 `image.go` 中，`/:imageId` 定义在 `/public` 之前（或同级），导致所有路径都被当作 imageId
- **建议**：命名路径应该放在通配路由之前注册，或者使用不同的路由前缀（如 `/image/item/:id` 而非 `/image/:id`）

### 4.2 v1 / v2 路由组权限不匹配

**问题：** 有些端点在 bohrium-api 中注册在 `privateGroup`（需要 JWT 认证）而非 `akGroup`（支持 accessKey），导致通过 openapi 访问时返回 404。

**典型案例：**
- `v2/job/*` 路由全部注册在 `priV2Group`，不在 `akGroup` → openapi 转发后 404
- `project/join`、`project/share_status` 注册在 `ProxyCore` 但路径不匹配
- `project/available` 注册在 AK v2 Group，v1 accessKey 不可达

**教训：**
- openapi 层注册了路由不等于下游也注册了对应路由
- 必须同时检查 openapi 路由 + 下游路由 + 下游路由所在的认证组
- 建议在 openapi 层添加路由注册前的可达性检查，避免暴露无效端点

### 4.3 知识库路径重写逻辑的复杂性

**问题：** `kdfileTrans` 函数的路径重写逻辑较为复杂，包含多层 if-else：

```go
rawPath := c.Param("path")  // 例如 "/knowledge_base/list"
if strings.Contains(rawPath, "/knowledge/") {
    fixedPath = strings.Replace(rawPath, "/knowledge/", "/", 1)
} else {
    if !strings.HasPrefix(rawPath, "/api/v1/") {
        fixedPath = "/api/v1" + rawPath
    }
}
if !strings.HasPrefix(fixedPath, "/api/v1/") {
    fixedPath = "/api/v1/" + strings.TrimPrefix(fixedPath, "/")
}
```

**实际映射：**
- `/v1/knowledge/knowledge_base/list` → rawPath=`/knowledge_base/list` → 下游 `/api/v1/knowledge_base/list` ✅
- `/v1/knowledge/knowledge_base/123` → 下游 `/api/v1/knowledge_base/123` → 下游返回 not found ❌
- `/v1/knowledge/knowledge_base/123/document/list` → 下游 404 ❌

**教训：**
- 路径重写逻辑应该尽量简单和可预测
- 建议为每个下游端点显式注册路由，而非使用通配 + 重写
- 下游服务的路由也需要配合暴露对应的端点

### 4.4 `nodeId` vs `machineId` 混淆

**问题：** Node 模块中存在两个 ID：
- `nodeId`：节点在创建时的序号
- `machineId`：底层机器 ID

绝大部分操作接口（详情、停止、重启、删除、修改）使用 `machineId`，但数据集绑定接口 (`/ds`) 使用 `nodeId`。

**教训：**
- API 设计中应避免暴露多个 ID 字段，或在文档中明确标注每个接口使用哪个 ID
- SKILL 文档中需要特别注明这个区别

### 4.5 `jobId` vs `jobGroupId` 混淆

**问题：** Job 模块中：
- `kill` 接口使用 `jobGroupId`
- `del`、`log`、`modify` 接口使用 `jobId`（即 `thirdpartyId`）

**教训：**
- 同一个模块内不同操作使用不同的 ID，增加了使用复杂度
- 建议统一 ID 语义或在接口命名中体现

### 4.6 Database 服务不可达

**问题：** `databaseAPITrans` 使用硬编码的 switch-case 映射了两个路径：
- `/common_data/list` → `/api/common_db/v1/common_data/list`
- `/polymer/list` → `/api/v1/polymer/list`

但实际测试均返回 404。

**可能原因：**
- Database 服务未部署或未启动
- `config.Get().Rpc.DatabaseHost` 配置的地址不正确
- Database 服务的路由与映射的路径不匹配

**教训：**
- 独立服务的可用性应有健康检查机制
- openapi 应对不可达的服务返回明确的错误信息（如 "service unavailable"），而非简单的 404

### 4.7 v2 Image private 接口必填参数不明显

**问题：** `GET /v2/image/private` 不传 `device` 和 `type` 参数时返回参数错误，但这两个参数在 URL 和文档中不容易发现。

```
必须：?device=container&type=private
```

**教训：**
- 必填的 query 参数应该在接口设计时有默认值，或者返回更友好的错误信息
- SKILL 文档中需要明确标注必填参数

### 4.8 File 接口 userId 注入不一致

**问题：**
- v1 的 `iterate` 接口需要在 body 中手动传 `userId`，openapi 网关不会自动注入
- 这意味着调用者需要先知道自己的 userId
- 但 openapi 层已经通过 accessKey 获取了 userId，理论上可以自动注入

**教训：**
- 网关层既然已经认证获取了 userId，应该自动注入到下游请求中，减少调用者的负担
- v2 接口改用了 `pathKey`（projectId）代替 userId，是一个进步

---

## 五、测试方法论总结

### 5.1 端点验证三步法

```
1. 读源码确定路由注册
   - openapi/app/router/init.go 的 installController()
   - 对应的转发函数确定目标服务和路径映射

2. 读下游路由确认端点存在
   - bohrium-api/app/router/{module}.go
   - bohrium-core/app/router/{module}.go
   - 确认路由在哪个认证组（public/private/ak/ticket）

3. 实际 curl 测试
   - 验证端点可达
   - 确认请求/响应格式
   - 测试边界条件（缺少参数、权限不足等）
```

### 5.2 常见错误模式

| 错误现象 | 通常原因 |
|---------|---------|
| HTTP 404 | 下游路由未注册 / 认证组不匹配 |
| `strconv.ParseUint` 错误 | 命名路径被 `/:id` 路由捕获 |
| `validation failed` | 缺少必填字段 |
| `Permission error` | 操作了不属于自己的资源 |
| `record not found` | ID 不存在或已被删除 |
| HTTP 401 + `AccessKey Invalid` | accessKey 错误或过期 |
| 业务 code 非 0 | 业务逻辑错误，看 error.msg |

### 5.3 SKILL 文档编写规范

通过本次实践，总结出 SKILL 文档应包含的标准结构：

```markdown
# SKILL: 模块中文名 (English Name) API

## 概述
一句话说明模块用途

## API 信息
Base URL / 认证方式 / 转发目标

## 重要说明
- 必须知道的坑和限制

## 端点
### N. 端点名称
- 请求格式（URL + Method + Headers）
- 查询参数表 / 请求体
- 响应示例（真实测试数据）
- 特殊说明

## Python 代码示例
完整可运行的 Client 类，包含：
- __init__ / _headers / _get / _post 等基础方法
- 每个可用端点对应一个方法
- 使用示例代码

## curl 示例
每个端点一个可复制粘贴的命令

## 不可用端点
明确列出哪些端点不工作及原因

## 常见问题
问题-原因-解决 三列表格
```

---

## 六、改进建议

### 6.1 对 openapi 网关的建议

1. **路由注册前验证下游可达性**：在服务启动时 ping 下游端点，标记不可用的路由
2. **统一 ID 语义**：每个模块只暴露一个主 ID，在文档中明确
3. **自动注入 userId**：网关层已认证用户，应自动设置 userId 到请求体/头
4. **路径重写简化**：用显式映射表替代复杂的 if-else 重写逻辑
5. **添加 OpenAPI/Swagger 文档**：自动生成的 API 文档比人工维护更可靠

### 6.2 对 SKILL 文档的建议

1. **保持与代码同步**：路由变更时同步更新 SKILL 文档
2. **添加版本号**：标注文档对应的服务版本
3. **自动化测试**：将 curl 示例转为自动化测试脚本，定期验证端点可用性
4. **错误码速查**：建立统一的错误码 → 含义 → 解决方案速查表

### 6.3 对 AI Agent 集成的建议

1. **优先使用 v2 接口**：v2 设计更合理，路由冲突更少
2. **缓存 userId**：首次调用 `/v1/account/info` 获取 userId 后缓存，后续接口需要时直接使用
3. **错误重试策略**：区分可重试错误（网络超时）和不可重试错误（权限不足、参数错误）
4. **组合调用模式**：很多操作需要先查询再操作，如创建节点前先查 resources 获取 skuId

---

## 七、文件清单

| 文件路径 | 说明 |
|---------|------|
| `docs/skills/SKILL-node.md` | 开发机 API 文档 |
| `docs/skills/SKILL-job.md` | 任务 API 文档 |
| `docs/skills/SKILL-project.md` | 项目 API 文档 |
| `docs/skills/SKILL-image.md` | 镜像 API 文档 |
| `docs/skills/SKILL-dataset.md` | 数据集 API 文档 |
| `docs/skills/SKILL-file.md` | 文件管理 API 文档 |
| `docs/skills/SKILL-knowledge.md` | 知识库 API 文档 |
| `docs/OPENAPI-SUMMARY.md` | 本总结报告 |
