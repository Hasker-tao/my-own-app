> 上游历史文档（2026-09-10 原版），仅供追溯，不代表 hasker 当前功能。当前入口见 [项目 README](../../../README.md)。

# 数据模型说明

主数据库由 `database/migrations/001_initial.sql` 创建。所有业务主键使用 UUID；业务集合都有创建、更新时间和软删除字段。外键启用，父记录永久删除时按模型定义级联或置空。

## 核心集合

| 领域 | 表 | 作用 |
| --- | --- | --- |
| 首页与计划 | `quick_memos`、`daily_reviews`、`plan_items` | 快速备忘、当日复盘、日期和时间安排；计划项可引用业务来源 |
| 自媒体 | `media_contents` | 灵感到发布的五阶段流程、素材位置、发布链接和表现数据 |
| 开发 | `dev_projects`、`dev_milestones`、`dev_work_items`、`dev_logs` | 项目、里程碑、类型化工作项和连续开发日志 |
| 咨询 | `clients`、`consulting_projects`、`consulting_interactions`、`consulting_deliverables`、`consulting_followups`、`consulting_time_entries` | 客户、项目、沟通、交付、跟进、时长和费用 |
| 健身 | `workout_templates`、`workout_template_exercises`、`workouts`、`workout_exercises`、`workout_sets`、`body_metrics` | 训练部位、模板与实际训练快照、逐组数据和身体指标 |
| 饮食 | `nutrition_targets`、`foods`、`meals`、`meal_items` | 生效日营养目标、常用食物、计划/实际餐食和营养明细 |
| 娱乐 | `entertainment_items`、`play_sessions` | 娱乐清单、状态、进度、目标和游玩时长 |
| 系统 | `settings`、`trash_entries`、`schema_migrations` | 使用偏好、回收站索引和数据库版本 |

## 首页、计划和来源记录

`plan_items` 只保存执行安排。`source_module`、`source_entity_type`、`source_entity_id` 指向业务记录；接口读取状态和首页时实时解析来源标题，因此修改业务标题不会生成重复记录或保留过期标题。当前支持的来源包括自媒体内容、开发工作项、咨询交付/跟进、训练、餐食和娱乐项目。

首页不保存摘要副本。`server/dashboard.ts` 每次从今日计划和业务集合生成时间线、待安排、关注项和模块摘要。

## 删除和完整性

普通删除写入 `deleted_at` 并在 `trash_entries` 建立可读索引；回收站恢复会清除软删除标记。永久删除是独立接口，界面必须通过二次确认后调用。SQLite 启用外键、WAL、`synchronous=FULL`、写入忙等待和迁移事务。

## 备份元数据

备份本体是 `backups/` 下独立 SQLite 文件。`backups/index.json` 仅保存列表元数据；即使主数据库损坏，备份本体仍可单独验证和复制。恢复前安全备份使用 `safety` 类型并默认长期保留。
