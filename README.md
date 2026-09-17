# hasker 工作台

基于 [TianyiDataScience/my-own-app](https://github.com/TianyiDataScience/my-own-app) 改造的本地个人工作台。项目使用 React、Fastify 和 SQLite，在本机保存个人数据，并提供学习、内容、开发、健身、饮食与娱乐等模块。

## 当前功能

- **学习工作台**：从已登录的 UNNC Moodle 读取课程目录、课件链接和 Coursework 状态；支持多课程总览、课件学习进度、考试前复习、Part 折叠、重要星标、学习记录及站内更新消息。
- **Coursework 待办**：显示截止时间、提交状态、上传文件、评分状态和成绩；读取不确定时保留学校原始信息，并支持本人确认。
- **内容与开发管理**：记录内容想法、备忘和开发工作项，支持状态编辑、安全删除与回收站恢复。
- **生活模块**：健身循环计划、饮食记录和娱乐记录。
- **本地桌面体验**：Liquid Glass、Notebook 和 Neo 三种外观，支持简体中文与 English，包含本地图标和响应式布局。
- **数据保护**：SQLite 本地持久化、完整备份、恢复和 ZIP 导出。

“今日计划”页面及相关入口已经移除；已有历史计划数据仍保留在数据库和备份中。咨询入口已隐藏，历史数据同样保留。

## 快速启动

### 当前项目电脑

双击项目外层的 `启动hasker工作台.command`，或运行：

```sh
/Users/hasker/Documents/Codex/Workspace/project005/启动hasker工作台.command
```

工作台地址为 [http://127.0.0.1:4317](http://127.0.0.1:4317)。关闭浏览器不会停止后台服务；页面中的“保存并退出”会安全保存并关闭服务。

### 其他电脑

需要 Node.js 22.13 或更高版本：

```sh
git clone https://github.com/Hasker-tao/my-own-app.git
cd my-own-app
git switch feature/learning-v1
npm install
npm run build
npm run app:start
```

macOS 可以双击 `启动hasker工作台.command`，Windows 可以使用 `启动hasker工作台.bat`。新电脑会创建独立的本地数据库，不包含当前电脑的个人记录。

## Moodle 连接

1. 在 Google Chrome 登录 [UNNC Moodle](https://moodle.nottingham.ac.uk)。
2. 在 Chrome“查看 → 开发者”中开启“允许 Apple 事件中的 JavaScript”。
3. 打开学习模块，读取可见课程并选择本学期课程。

Moodle 接入只读取账号有权访问的页面信息，不保存学校密码，也不会代替本人上传或提交作业。自动检查只在工作台运行、Chrome 可用且登录有效时执行；失败时保留上次可靠数据。

## 本机数据

当前项目电脑的个人数据位于：

```text
/Users/hasker/Documents/Codex/Workspace/project005/work/MuziWorkspace/
```

其中包含 SQLite 数据库、备份、导出和日志。该目录以及 `*.sqlite`、`dist/`、`node_modules/` 和测试产物均被 Git 忽略，不会上传到 GitHub。

源码回退只改变代码，不会恢复个人数据库。恢复数据请使用设置页的备份功能。

## 开发与验证

当前项目电脑使用项目自带的 Node.js：

```sh
cd /Users/hasker/Documents/Codex/Workspace/project005
export PATH="$PWD/work/node-v22.23.2-darwin-arm64/bin:$PATH"
export MUZI_DATA_DIR="$PWD/work/MuziWorkspace"
cd src/my-own-app
```

常用命令：

```sh
npm run dev          # 开发服务器
npm run verify       # lint、类型、测试、构建和生产启动检查
npm run test:e2e     # Playwright 浏览器验收
npm run test:all     # 完整验证
```

macOS 使用系统 Chrome 运行浏览器验收：

```sh
PLAYWRIGHT_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:e2e
```

当前版本已通过 74 项单元、组件与集成测试，以及 23 项浏览器验收。

## 项目结构

```text
src/          React 页面、组件、业务逻辑、主题与界面语言
server/       Fastify API、SQLite 数据访问和 Moodle 只读连接
database/     数据库迁移
public/       本地图标与静态资源
scripts/      本地启动和测试准备脚本
tests/        单元、组件、集成与浏览器验收
docs/         当前功能说明、回退指南和历史归档
```

## 文档

- [学习模块说明](docs/LEARNING_V1.md)
- [桌面外观与界面语言](docs/DESK_UI_LANGUAGE.md)
- [移除今日计划的范围与数据保留](docs/2026-09-16_移除今日计划.md)
- [Git 查看与安全回退](docs/GIT_GUIDE.md)
- [上游历史资料](docs/archive/upstream/README.md)

## 开源归属

上游作者与版权声明保持不变。本项目继续使用 [MIT License](LICENSE)。
