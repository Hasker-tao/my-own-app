# hasker 工作台

基于 [TianyiDataScience/my-own-app](https://github.com/TianyiDataScience/my-own-app) 的本地个人工作台。新增 UNNC EEE 学习模块，保留计划、自媒体、开发、健身、饮食与娱乐；咨询入口已隐藏，历史数据保留。

## 文档入口

- [学习模块总文档](docs/LEARNING_V1.md)：唯一当前学习需求、使用说明、实际范围与验证记录。
- [Git 查看与安全回退](docs/GIT_GUIDE.md)：查看本次提交，以及用新提交撤回和恢复。
- [上游历史资料](docs/archive/upstream/README.md)：原产品需求、接口、数据模型、运行说明、验收表及截图，仅供追溯。

## 在当前电脑启动

双击 project005 外层的 `启动hasker工作台.command`，或在终端执行：

```sh
/Users/hasker/Documents/Codex/Workspace/project005/启动hasker工作台.command
```

打开 http://127.0.0.1:4317 。使用页面“手动保存”提交草稿，“保存并退出”安全关闭服务；关闭浏览器不会停服务。构建更新后，启动器会先安全保存，再替换旧服务。

本项目已自带 Node.js 22.23.2/npm 10.9.8。开发或构建前：

```sh
cd /Users/hasker/Documents/Codex/Workspace/project005
export PATH="$PWD/work/node-v22.23.2-darwin-arm64/bin:$PATH"
export MUZI_DATA_DIR="$PWD/work/MuziWorkspace"
cd src/my-own-app
npm run build
```

开发用 `npm run dev`，页面为 http://127.0.0.1:3000；先退出生产服务以避免默认接口端口冲突。源码内的 macOS/Windows 启动器供其他环境使用，需自行安装 Node.js >=22.13.0 并安装依赖；当前电脑优先使用外层启动器，确保继续访问已有数据。

## 文件结构

```text
README.md、AGENTS.md、LICENSE    项目入口、规则、上游许可证
package*.json、各 *.config.*     包管理、构建、测试配置（保留根目录）
src/                            React 页面、组件与样式
server/                         Fastify 接口、SQLite 与 Moodle 读取
database/                       数据库迁移
public/                         本地图标与静态资源
scripts/                        启动与测试准备
tests/                          自动化测试
docs/                           当前总文档、Git 指南与分类归档
```

`.git/` 保留完整历史。`node_modules/`、`dist/`、`dist-server/`、`.test-data/`、`test-results/` 和 `playwright-report/` 是工具需要或生成的忽略目录，不作为散乱文档移动。

## 数据与兼容

真实数据在外层 `work/MuziWorkspace/`，包含 `data/app.sqlite`、`backups/`、`exports/` 和 `logs/`，不提交 Git，也不能当缓存删除。品牌为小写 hasker；`MUZI_DATA_DIR`、`MuziWorkspace`、服务内部标识保留以兼容已有数据和启动器。

设置页支持完整 SQLite 备份、恢复和 ZIP 导出；学习数据包含在数据库及导出 `all-data.json` 的 learning 字段中。恢复旧备份会撤销备份后业务变化；Git 回退只影响代码，详见 Git 指南。

## 验证

```sh
npm run verify       # lint、类型、单元/组件/集成、构建、产物与启动器
npm run test:e2e      # 浏览器验收，使用独立测试数据库
```

macOS 使用已安装 Chrome 可设置 `PLAYWRIGHT_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。实际验收结果集中记录在学习总文档。学校登录失效时需本人重新登录；没有把测试数据冒充真实课程。

## 开源归属

上游作者与版权归属保留，使用 [MIT LICENSE](LICENSE)，本地品牌修改不改变上游版权声明。
