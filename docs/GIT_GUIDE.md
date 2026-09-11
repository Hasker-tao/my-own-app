# 第一版 Git 查看与安全回退

实际 Git 仓库在 `project005/src/my-own-app`，不是 project005 根目录。代码、源码内 docs 和测试被 Git 保存；外层需求文档、work/MuziWorkspace 数据库、课件和运行缓存不由该仓库保存。

改造分支：`feature/learning-v1`。改造前提交：`ad6b3bd`，标签 `learning-v1-before`。第一版使用标签 `learning-v1`。main 保留改造前位置。提交只保存在本机，未推送 GitHub。

## 查看保存结果

打开终端，粘贴：

```sh
cd /Users/hasker/Documents/Codex/Workspace/project005/src/my-own-app
git status
git log -5 --oneline --decorate
git show --stat learning-v1
```

- status 显示 `nothing to commit, working tree clean`：当前文件与最新提交一致。
- log 每行开头是提交编号，后面是说明；learning-v1 标签标记本次版本。
- show --stat 列出本版改动了哪些文件。

看具体改动：

```sh
git diff learning-v1-before learning-v1 -- src/pages/LearningPage.tsx
```

长内容进入分页器时，按空格翻页，按 q 退出。也可在 Codex 的 Git review 面板查看差异。

## 不喜欢第一版：撤回这次提交

先在应用点击“手动保存”，并在“数据与设置”创建一份备份，再“保存并退出”。

```sh
cd /Users/hasker/Documents/Codex/Workspace/project005/src/my-own-app
git status
```

如果有未提交改动，先停在这里，交给 Codex 整理，避免混入或覆盖后来改动。工作区干净且仍在 feature/learning-v1 分支时：

```sh
git revert --no-edit learning-v1
```

这会增加一条“撤回第一版”的提交，保留全部历史。若后续版本已修改相同文件，可能出现冲突；不确定时可以 `git revert --abort` 取消这次撤回，再让 Codex 处理。

然后必须重新构建。仅撤回 Git 不会替换已经生成的运行文件：

```sh
export PATH="/Users/hasker/Documents/Codex/Workspace/project005/work/node-v22.23.2-darwin-arm64/bin:$PATH"
npm run build
/Users/hasker/Documents/Codex/Workspace/project005/启动hasker工作台.command
```

启动器会使用新的构建。第一版的学习表是增量添加，撤回代码后表和记录仍保留，只是不再显示学习入口。不要为了回退界面而删除 work 文件夹。

## 想再恢复第一版

若刚才的撤回是最新提交，且之后没有新的提交或未保存改动，先保存并退出应用，再执行：

```sh
cd /Users/hasker/Documents/Codex/Workspace/project005/src/my-own-app
export PATH="/Users/hasker/Documents/Codex/Workspace/project005/work/node-v22.23.2-darwin-arm64/bin:$PATH"
git revert --no-edit HEAD
npm run build
/Users/hasker/Documents/Codex/Workspace/project005/启动hasker工作台.command
```

这里是在撤回“撤回操作”。若已有其他提交，先用 git log 确认具体的撤回提交编号，不要直接照抄 HEAD。

## Git 与数据备份的区别

Git 保存代码版本；SQLite 备份保存实际业务记录。恢复改造前的数据备份会撤销该备份之后的业务数据变化，因此不把恢复旧数据库作为界面回退的默认步骤。

本指南也包含在第一版提交内。撤回后文件会消失，可随时用 `git show learning-v1:docs/GIT_GUIDE.md` 查看；外层启动hasker工作台.command 不在源码 Git 中，回退后仍可使用。
