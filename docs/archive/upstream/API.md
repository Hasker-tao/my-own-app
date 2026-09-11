> 上游历史文档（2026-09-10 原版），仅供追溯，不代表 hasker 当前功能。当前入口见 [项目 README](../../../README.md)。

# 本地 API 概览

生产环境 API 基址为 `http://127.0.0.1:4317/api`。接口只为当前电脑上的前端服务，不是公网 API。来自非 `localhost` / `127.0.0.1` Origin 的写请求会被拒绝。

## 系统与读取

- `GET /api/health`：数据库完整性、迁移版本和服务状态。
- `GET /api/state`：全部未删除业务集合、设置和回收站。
- `GET /api/dashboard?date=YYYY-MM-DD`：首页当天聚合。
- `GET /api/search?q=...`：跨模块全文关键字搜索。
- `GET /api/system/status`：数据文件、目录、备份和失败状态。
- `POST /api/system/open-data-directory`：在 Finder 打开数据目录。
- `POST /api/system/open-path`：打开已经存在的本地路径。

## 集合操作

- `GET /api/collections/:collection`
- `POST /api/collections/:collection`
- `PATCH /api/collections/:collection/:id`
- `DELETE /api/collections/:collection/:id`：软删除。
- `POST /api/collections/:collection/:id/restore`
- `DELETE /api/collections/:collection/:id/permanent`

可用集合及字段白名单定义在 `server/collections.ts`，未知字段不会写入数据库。

## 业务动作

- `POST /api/plan-items/:id/complete`
- `POST /api/plan-items/:id/postpone`
- `GET|PUT /api/daily-reviews/:date`
- `POST /api/quick-memos/:id/convert`
- `GET|PUT /api/settings`
- `GET /api/trash`

## 备份与导出

- `GET /api/backups`
- `POST /api/backups`
- `PATCH /api/backups/:id/metadata`
- `POST /api/backups/:id/restore`
- `POST /api/export`
- `GET /api/exports/:filename`

所有 JSON 响应的成功数据位于 `{ "data": ... }`；错误结构为 `{ "error": { "code": "...", "message": "..." } }`。
