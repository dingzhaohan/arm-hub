# ARM Hub

论文复现成果管理平台 (Automated Reproducibility Management)。

## 技术栈

- **后端**: Python FastAPI + SQLAlchemy + MySQL (RDS) — `backend/`
- **前端**: React 19 + Vite 7 + TailwindCSS v4 (JSX, 非 TS) — `frontend/`
- **存储**: 阿里云 OSS (STS 临时凭证直传) — `backend/oss_service.py`
- **认证**: Bohrium brmToken (iframe 登录) — `backend/auth.py`, `backend/bohrium_auth.py`

## 项目结构

```
backend/
  main.py              # FastAPI app, CORS, static files
  database.py          # SQLAlchemy models, engine, auto-create tables
  schemas.py           # Pydantic schemas
  oss_service.py       # OSS 操作 (上传/下载/STS/zip 解压)
  auth.py              # 登录认证 (Bohrium token → 本地用户)
  bohrclaw_provisioner.py  # BohrClaw 节点编排
  routes/              # 路由模块 (arms, papers, skills, datasets, bohrclaw, diagnosis...)
  config/config.py     # 环境变量读取

frontend/
  src/api.js           # 全部 API 调用
  src/pages/           # 页面组件 (Papers, Arms, Skills, Datasets, BohrClaw, Profile)
  src/components/      # 公共组件 (Layout, CodeBrowser, ErrorBoundary)
  src/contexts/        # AuthContext
  src/utils/           # ossUpload.js (STS 分片上传工具)
```

## 开发命令

```bash
./start.sh              # 构建前端 + 启动后端 (端口 50005)
./start.sh --daemon     # 后台运行
./start.sh --skip-build --daemon  # 跳过前端构建, 只重启后端
./start.sh --stop       # 停止
```

## 开发约定

- 前端是 JSX (非 TypeScript), 不要加 `.ts`/`.tsx` 文件
- 所有 API 调用集中在 `frontend/src/api.js`, 新增接口加到这里
- OSS 上传统一用 `frontend/src/utils/ossUpload.js`, 不要在页面里重新实现
- 后端路由按资源拆分到 `backend/routes/` 下, 在 `main.py` 中注册
- 环境变量在 `backend/config/config.py` 中读取, 不要在其他文件直接 `os.getenv`
- `.env` / `env-test` 等含敏感凭证, 已在 `.gitignore` 中, 不要提交

## Git 工作流

- `origin` → GitHub (dingzhaohan/arm-hub), `upstream` → GitLab (davinci-ai/dp-paper2arm-hub)
- 日常开发在 `main` 分支, 提交后 push origin, 再 push upstream dev
- 合并上游: `git fetch upstream && git merge upstream/dev`

## 用户交互习惯

- 用中文交流
- 改完代码后自动 `./start.sh --daemon` 重建重启, 不需要每次问
- 用户会直接说"提交"/"push" → 执行 git commit + push, 不需要确认
- 用户说"重启下服务" → `./start.sh --skip-build --daemon` (如果只改了后端) 或 `./start.sh --daemon` (如果改了前端)
