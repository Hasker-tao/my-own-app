> 上游历史文档（2026-09-10 原版），仅供追溯，不代表 hasker 当前功能。当前入口见 [项目 README](../../../README.md)。

# 第一版验收覆盖

本表把 `PRD.md` 中 AC-001 至 AC-040 映射到可重复执行的检查。自动化总入口为 `npm run test:all`。涉及“重启电脑”的标准通过完全关闭进程后从同一独立 SQLite 文件重新读取来做等价自动化；这是应用能控制的持久化边界，真实电脑重启不引入额外内存状态。

| 标准 | 覆盖方式 |
| --- | --- |
| AC-001 | `production-server.test.mjs` 验证生产启动与首页/API；启动器测试验证无需登录的本机启动 |
| AC-002 | `rendered-html.test.mjs` 检查无远程运行资源；E2E 监听并拒绝任何外部请求 |
| AC-003 | `config.test.ts`、`health.test.ts` 验证仅绑定 `127.0.0.1`，并拒绝外部 Origin 写入 |
| AC-004 | E2E 逐一进入九页；`app-shell.test.tsx` 检查完整分组导航 |
| AC-005 | `work-modules.test.ts`、`life-modules.test.ts` 和 E2E 写入并重新读取七个业务领域与计划 |
| AC-006 | SQLite 数据不依赖浏览器；E2E 页面重载与 `persistence.test.ts` 重新读取 |
| AC-007 | `persistence.test.ts` 完全关闭并重新创建服务后读取同一记录 |
| AC-008 | 与 AC-007 同一文件级持久化路径；启动器进程退出测试确保无进程内状态依赖 |
| AC-009 | E2E 检查数据设置页；`config.test.ts` 和 `persistence.test.ts` 检查实际文件路径 |
| AC-010 | `persistence.test.ts` 制造 SQLite 只读错误；组件测试验证顶部显示“保存失败” |
| AC-011–AC-013 | `planning-dashboard.test.ts` 与 E2E 验证时间线、待安排、完成状态和进度联动 |
| AC-014–AC-015 | E2E 验证来源标题实时更新和“打开来源”；集成测试验证无标题副本漂移 |
| AC-016 | E2E 访问首页摘要目标；Dashboard 摘要按钮直接使用模块来源路由 |
| AC-017 | `planning-dashboard.test.ts` 验证备忘转换与归档；首页组件使用延时自动保存并显示失败 |
| AC-018 | `planning-dashboard.test.ts` 和 E2E 覆盖日期、时间、时长、优先级、完成、取消与延期接口/界面 |
| AC-019 | `work-modules.test.ts` 覆盖五阶段、发布链接和三项表现数据；E2E 覆盖实际页面 |
| AC-020 | `work-modules.test.ts` 覆盖项目、里程碑、四类工作项字段和日志 |
| AC-021 | `work-modules.test.ts` 覆盖客户、项目、沟通、交付、跟进、时长、费用和结算字段 |
| AC-022 | `life-modules.test.ts` 与健身页面流程覆盖模板、实际动作/组、上次数据和身体趋势 |
| AC-023 | `life-modules.test.ts` 覆盖计划/实际分离、未知营养值和目标；页面实时汇总实际摄入 |
| AC-024 | `life-modules.test.ts` 覆盖四状态、进度、目标、评分和游玩时长；娱乐不进入逾期提醒 |
| AC-025 | 专属数据库表、模块集成测试和 E2E 的不同页面记录共同验证非通用任务换名 |
| AC-026 | `cross-cutting.test.ts` 对计划和七个业务模块搜索并核对模块集合；E2E 验证搜索交互 |
| AC-027 | `cross-cutting.test.ts` 与 E2E 覆盖软删除、回收站和恢复 |
| AC-028 | `ui.test.tsx` 验证取消确认不会调用永久删除；设置页只在确认回调调用永久删除接口 |
| AC-029 | `cross-cutting.test.ts` 重启后读取设置；E2E 验证主题和首页摘要设置刷新后仍生效 |
| AC-030 | E2E 从空库进入九页；`ui.test.tsx` 验证通用空、加载和错误状态 |
| AC-031 | `backup-slice.test.ts` 检查独立备份文件；E2E 检查手动备份列表 |
| AC-032 | `backup-export.test.ts` 验证名称和长期保留刷新后仍在；E2E 修改备份名 |
| AC-033 | `backup-export.test.ts` 连续调用每日备份并验证同日仅一份 |
| AC-034 | `backup-export.test.ts` 创建超过 30 份并验证保留规则和长期保留例外 |
| AC-035–AC-036 | `backup-slice.test.ts` 验证快照恢复及恢复前安全备份 |
| AC-037 | `backup-export.test.ts` 损坏备份后验证拒绝覆盖、当前数据与主库完整性不变 |
| AC-038 | `backup-export.test.ts` 制造备份写入失败；`app-shell.test.tsx` 验证界面错误提示 |
| AC-039 | `backup-export.test.ts` 解压验证 manifest、全量 JSON、各集合 CSV；E2E 验证下载 |
| AC-040 | `persistence.test.ts` 验证 WAL 检查点、数据库完整性与重启持久化；`app-shell.test.tsx` 验证入口和成功状态；E2E 验证手动保存未到延时的快速备忘 |

最终回归时还会执行 ESLint、两套 TypeScript 检查、Vite/服务端生产构建、生产静态资源检查、真实生产进程和桌面启动器测试。
