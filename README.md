# Huayuan CRM 华远客户关系管理系统

国际贸易 CRM 系统，整合客户管理、邮件营销、B2B 获客及销售管理流程。

## 技术栈

### 前端 Frontend

| 技术 | 用途 |
|------|------|
| **React 19** | UI 框架 |
| **TypeScript** | 类型安全 |
| **Vite 8** | 构建工具 |
| **Tailwind CSS 4** | 样式框架 |
| **@base-ui/react** | 基础 UI 组件库 |
| **React Hook Form + Zod** | 表单处理与验证 |
| **React Router DOM 7** | 路由管理 |
| **next-themes** | 暗黑/亮色模式 |
| **lucide-react** | 图标库 |
| **sonner** | 消息通知 |

### 后端 Backend

| 技术 | 用途 |
|------|------|
| **NestJS 10** | Node.js 服务端框架 |
| **TypeScript** | 类型安全 |
| **TypeORM 0.3** | ORM 数据映射 |
| **MySQL 8.0 + mysql2** | 关系型数据库 |
| **Passport.js (JWT)** | 身份认证 |
| **bcrypt** | 密码加密 |
| **Nodemailer** | 邮件发送 |
| **class-validator + class-transformer** | 数据验证 |
| **SheetJS (xlsx)** | 电子表格导出 |

### 部署与运维

| 技术 | 用途 |
|------|------|
| **PM2** | 进程管理 |
| **Nginx** | Web 服务器与反向代理 |
| **GitHub Actions** | CI/CD 自动部署 |
| **Cloudflare** | DNS 与 SSL 代理 |

## 项目结构

```
huayuan-crm/
├── backend/                      # NestJS 后端
│   ├── src/
│   │   ├── auth/                 # 认证模块 (JWT)
│   │   ├── customers/            # 客户管理
│   │   ├── contacts/             # 联系人
│   │   ├── activities/           # 活动记录
│   │   ├── todos/                # 待办事项
│   │   ├── opportunities/        # 商机管理
│   │   ├── products/             # 产品管理
│   │   ├── quotes/               # 报价管理
│   │   ├── samples/              # 样品管理
│   │   ├── email-templates/      # 邮件模板
│   │   ├── email-tasks/          # 邮件任务 (批量发送)
│   │   ├── send-logs/            # 发送日志
│   │   ├── b2b-leads/            # B2B 获客 (搜索/清洗/评分)
│   │   ├── settings/             # 系统设置
│   │   ├── dashboard/            # 仪表盘
│   │   ├── common/               # 公共模块 (过滤器/管道/装饰器)
│   │   └── config/               # 配置模块
│   ├── dist/                     # 编译输出
│   └── package.json
│
├── frontend/                     # React 前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/             # 登录/注册
│   │   │   ├── dashboard/        # 仪表盘
│   │   │   ├── customers/        # 客户管理
│   │   │   ├── leads/            # B2B 获客
│   │   │   ├── marketing/        # 邮件营销
│   │   │   ├── opportunities/    # 商机管理
│   │   │   ├── products/         # 产品管理
│   │   │   ├── quotes/           # 报价管理
│   │   │   ├── samples/          # 样品管理
│   │   │   ├── sources/          # 数据源管理
│   │   │   ├── settings/         # 系统设置
│   │   │   └── ui/               # 通用 UI 组件
│   │   ├── api/client.ts         # API 客户端
│   │   ├── types/index.ts        # TypeScript 类型定义
│   │   └── lib/utils.ts          # 工具函数
│   ├── dist/                     # 编译输出
│   └── package.json
│
├── deploy/                       # 部署配置文件
│   └── nginx-huayuan-crm.conf    # Nginx 站点配置
│
├── .github/workflows/deploy.yml  # GitHub Actions 自动部署
├── ecosystem.config.js           # PM2 进程配置
└── package.json                  # 根 monorepo 配置
```

## 功能特性

### 客户管理 Customer Management
- 客户 360° 视图（客户信息、联系人、活动、待办、商机、发送记录）
- 客户分层 (A/B/C/D)
- 客户标签管理与筛选
- 批量导入/导出
- 批量操作（标签/分层）

### B2B 获客 Lead Generation
- 基于产品描述自动生成搜索查询
- 多搜索引擎支持（Brave Search / Serper / SerpAPI / Generic JSON）
- AI 驱动的客户画像（产品别名、下游行业、企业类型）
- 自动化搜索、官网爬取、邮箱提取
- 数据清洗、去重、验证与评分
- 一键导入到客户库

### 邮件营销 Email Marketing
- 可视化邮件模板编辑（支持图片）
- 批量/定时邮件发送
- SMTP 多账号管理
- 发送日志与状态追踪

### 销售管理 Sales Management
- 产品目录管理
- 报价管理（含折扣、运费、税率计算）
- 样品追踪
- 商机管线管理

### 系统管理
- JWT 身份认证
- 搜索数据源配置
- AI 模型配置（DeepSeek / OpenAI 兼容）
- 邮件服务器配置（SMTP / IMAP）

## 环境要求

- **Node.js** 20+
- **MySQL** 8.0
- **Nginx** (生产环境)
- **PM2** (生产环境)

## 本地开发

```bash
# 安装依赖
npm ci

# 配置后端环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env 填写数据库配置

# 运行开发服务（前后端同时启动）
npm run dev
```

- 前端开发服务器: `http://localhost:9527`
- 后端 API 服务器: `http://localhost:9528`
- 前端通过 Vite proxy 将 `/api` 请求转发到后端

## 生产部署

项目使用 GitHub Actions 自动部署到腾讯云服务器。

### 前置条件

1. 服务器已安装：Node.js 20+、MySQL 8.0、Nginx、PM2、Git
2. 域名 DNS 指向服务器 IP（建议通过 Cloudflare 代理）

### GitHub Secrets 配置

在仓库 Settings → Secrets and variables → Actions 中配置：

| Secret | 说明 |
|--------|------|
| `SERVER_HOST` | 服务器 IP |
| `SERVER_USER` | SSH 用户 (root) |
| `SERVER_SSH_KEY` | SSH 私钥 (PEM 格式) |
| `SERVER_PORT` | SSH 端口 (22) |
| `SERVER_PROJECT_PATH` | 部署路径 |
| `DB_HOST` | 数据库主机 (localhost) |
| `DB_PORT` | 数据库端口 (3306) |
| `DB_USERNAME` | 数据库用户 |
| `DB_PASSWORD` | 数据库密码 |
| `DB_DATABASE` | 数据库名 |
| `JWT_SECRET` | JWT 密钥 |
| `JWT_EXPIRES_IN` | JWT 过期时间 |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 (可选) |

### 部署流程

推送代码到 `main` 分支自动触发部署：

1. GitHub Actions 检出代码
2. 安装依赖 (`npm ci`)
3. 构建前后端 (`npm run build`)
4. 通过 SCP 上传到服务器
5. 服务器端：写入 `.env` → 安装生产依赖 → PM2 重启 → 部署前端静态文件 → Nginx 重载

## 端口说明

| 服务 | 端口 |
|------|------|
| 前端 (开发) | 9527 |
| 后端 API | 9528 |
| Nginx (HTTP/HTTPS) | 80 / 443 |
| MySQL | 3306 |
