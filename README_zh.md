[English](./README.md) | 中文

![Coneshare logo](https://raw.githubusercontent.com/coneshare/coneshare/refs/heads/main/coneshare_logo.png)

[![Build CI](https://github.com/coneshare/coneshare/actions/workflows/build-ci.yml/badge.svg)](https://github.com/coneshare/coneshare/actions/workflows/build-ci.yml)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/coneshare/coneshare)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-coneshare-blue)](https://docs.coneshare.com/zh/)

# Coneshare

在您现有的存储（Nextcloud、Google Drive、Dropbox）之上添加虚拟资料室、安全分享、文档追踪和工作流自动化。自托管的 DocSend 与传统虚拟资料室替代方案。

Coneshare 是一个开源的自托管平台，为您现有的文件添加安全分发层。分享文档和视频，实时追踪受众参与度，并触发自动化工作流，同时将文件完整保留在您自己的基础设施中。

[快速开始](https://github.com/coneshare/coneshare-compose) · [文档](https://docs.coneshare.com/zh/) · [在线演示](https://www.coneshare.com/demo) · [路线图](https://github.com/orgs/coneshare/projects/2/) · [论坛](https://github.com/orgs/coneshare/discussions)

如果这个项目对您有帮助，欢迎给仓库点个 Star。

![Coneshare 30s product walkthrough](https://github.com/coneshare/coneshare/releases/download/v1.2.0/overview-30s.gif)

---

## 工作原理

Coneshare 直接运行在您的现有存储之上：

- 文件保留在您的存储提供商中（Nextcloud、Google Drive 或 Dropbox）。
- Coneshare 提供：
  - 虚拟资料室与多媒体预览
  - 访问控制与链接权限
  - 文档参与度追踪
  - Webhook 与工作流自动化

在保持现有存储工作流的同时，获得访问控制、虚拟资料室与参与度分析能力。

---

## 功能特性

### 虚拟资料室与媒体预览
- 将文档和多媒体整理在结构化的资料室中。
- PDF 渲染与安全视频流式传输。
- 内联查看器，方便在相关项目之间切换浏览。

### 访问控制
- 密码保护、链接到期时间与邮箱验证。
- 下载限制与动态水印。

### 分析与参与度追踪
- 实时追踪浏览、回访与下载。
- 查看逐页阅读时长与视频播放指标。

### 自动化与 Webhook
- 链接事件的 Slack 与 Webhook 通知。
- 根据访客行为触发自动化操作。

### 基础设施与隐私
- 完全自托管于您自己的服务器或私有云中。
- 直接连接现有存储，不复制或冗余存储文件。

---

## 支持的集成

Coneshare 可连接：

- Nextcloud（自托管）
- Google Drive
- Dropbox

更多存储连接器正在开发中。

---

## 常见用例

### 销售与融资
向潜在客户展示融资商业计划书与交易资料室，清晰掌握哪些页面最受关注。

### 安全的外部共享
向组织外部发送敏感文档，支持到期自动失效、下载限制和查看者水印。

### 受监管环境
在保持文件存储合规边界与数据自主可控的前提下，部署资料室与外部分享工作流。

---

## Coneshare 适合谁？

Coneshare 专为满足以下需求的团队打造：

- 将文件存放在云存储或自托管存储中（Nextcloud、Google Drive、Dropbox）
- 需要向外部合作伙伴分享敏感文件
- 需要详细的文档数据洞察与阅读凭证
- 要求自托管或私有基础设施

---

## 部署（自托管）

生产环境部署请使用 [coneshare-compose 仓库](https://github.com/coneshare/coneshare-compose)。该仓库提供了包含自动化 Let's Encrypt SSL、反向代理以及预置容器配置的 Docker Compose 方案。

---

## 本地开发

如需在本地运行代码库以进行开发或参与贡献：

### 从源码构建

```bash
git clone git@github.com:coneshare/coneshare.git
cd coneshare
cp .env.template .env
make build
make up
make migrate
```

### 首次运行验证清单

执行 `make up` 和 `make migrate` 后，在配置存储集成之前验证本地服务：

- 前端可通过 [http://localhost:5173](http://localhost:5173) 访问
- API 可通过 [http://localhost:8000/api/v1/](http://localhost:8000/api/v1/) 访问
- 核心服务已启动（`backend`、`frontend`、`core`、`redis`、`celery`）
- 本地文件持久化在 `docker-compose.yml` 中定义的数据卷下
- 冒烟测试：
  - 上传一个文档
  - 创建一个分享链接
  - 在隐私/无痕浏览器窗口中打开链接，确认查看权限正常

### 首次安装故障排除

- `.env` 与 `SITE_DOMAIN` 不匹配：
  - 确认已从 `.env.template` 复制创建 `.env`，且 `SITE_DOMAIN` 与本地访问地址一致。
- Backend 无法连接 `core` 服务：
  - 检查 `docker-compose.yml` 中的服务名与端口，并查看 backend 和 core 日志中的连接错误。
- Redis 或 Celery 异常（后台任务未执行）：
  - 确认 `redis` 和 `celery` 容器均已运行，并检查 Celery worker 日志。
- 存储权限问题：
  - 确认挂载的存储目录存在且容器进程具有写入权限。
- 排查优先关注：
  - 在仓库根目录运行 `make logs`，优先检查 `backend`、`core` 和 `celery` 的报错信息。

---

## 架构

![Coneshare architecture diagram](./docs/assets/readme/architecture-v1.3.png)

Coneshare 由四个主要服务组成：

* `backend/`: Django 与 DRF API、Celery 以及用于后台任务的 Redis
* `core/`: 用于文件分发与媒体流式传输的 Go 服务
* `frontend/`: React 与 Vite Web 应用
* `mcp-server/`: 用于 AI Agent 与智能助手集成的 FastMCP 远程服务器

技术参考：

* [Technology Stack](docs/strategy/coneshare-techstack.md)
* [Open API Reference](docs/strategy/coneshare-open-api.md)

---

## 参与贡献

欢迎参与贡献。详情请参阅 [CONTRIBUTING.md](CONTRIBUTING.md) 了解行为准则和 PR 提交流程。

## 贡献者

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/xiez"><img src="https://avatars.githubusercontent.com/u/1459699?v=4?s=100" width="100px;" alt="Justin Zheng"/><br /><sub><b>Justin Zheng</b></sub></a><br /><a href="https://github.com/coneshare/coneshare/commits?author=xiez" title="Code">💻</a> <a href="https://github.com/coneshare/coneshare/commits?author=xiez" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="https://github.com/coneshare/coneshare/commits?author=xiez" title="Documentation">📖</a> <a href="https://github.com/coneshare/coneshare/commits?author=xiez" title="Design">🎨</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/jamesramsay"><img src="https://avatars.githubusercontent.com/u/1191554?v=4?s=100" width="100px;" alt="James Ramsay"/><br /><sub><b>James Ramsay</b></sub></a><br /><a href="https://github.com/coneshare/coneshare/commits?author=jamesramsay" title="Code">💻</a> <a href="https://github.com/coneshare/coneshare/commits?author=jamesramsay" title="Tests">⚠️</a> <a href="https://github.com/coneshare/coneshare/issues?q=author%3Ajamesramsay" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/mfriedewald"><img src="https://avatars.githubusercontent.com/u/12811724?v=4?s=100" width="100px;" alt="Matthias Friedewald"/><br /><sub><b>Matthias Friedewald</b></sub></a><br /><a href="https://github.com/coneshare/coneshare/commits?author=mfriedewald" title="Code">💻</a> <a href="https://github.com/coneshare/coneshare/commits?author=mfriedewald" title="Tests">⚠️</a> <a href="https://github.com/coneshare/coneshare/issues?q=author%3Amfriedewald" title="Bug reports">🐛</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

---

## 社区

* 文档: [https://docs.coneshare.com/zh/](https://docs.coneshare.com/zh/)
* 讨论区: [https://github.com/orgs/coneshare/discussions](https://github.com/orgs/coneshare/discussions)
* 邮箱: [dev@coneshare.com](mailto:dev@coneshare.com)

---

## 许可证

MIT License. 详情请参阅 [LICENSE](LICENSE)。

---

## 安全问题

关于安全问题，请联系 [dev@coneshare.com](mailto:dev@coneshare.com)。
