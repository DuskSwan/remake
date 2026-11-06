# 人生重开模拟器

<a href="https://discord.gg/U3qrf49NMQ"><img src="https://img.shields.io/discord/883382868427014255?color=%23FEE75C&label=Discord&logo=discord&logoColor=white&style=for-the-badge" /></a>

[English](./README.md) | 简体中文

## 开发环境

本项目已验证的环境：Node.js `24.21.0`、pnpm `11.25.0`、Bun `1.4.4`。项目脚本同时使用 `pnpm`、`bun` 和 `bunx`，需要这些命令在终端中可用。

先安装 Node.js；如果还没有 pnpm 和 Bun，可以在终端中运行：

```sh
npm install --global pnpm@11.25.0 bun@1.4.4
```

安装后重新打开终端，用 `node --version`、`pnpm --version`、`bun --version` 检查环境。

## 本地运行网页版

在项目根目录执行。Windows PowerShell 可以先运行 `cd D:\GithubRepos\remake`，其他位置请使用自己的项目路径。

```sh
pnpm install --frozen-lockfile
pnpm build:data
pnpm dev --host 127.0.0.1 --port 5173 --strictPort
```

浏览器打开 **http://127.0.0.1:5173/**。运行期间保持终端开启，按 `Ctrl+C` 停止。`--strictPort` 会在端口占用时报错；停止占用该端口的旧开发服务后重试，避免自动切换端口后看不到原来的本地存档。

第一次启动需要安装依赖并生成数据，数据构建中的 `bunx` 可能需要联网下载转换工具。后续启动直接执行上面的 `pnpm dev ...` 命令即可；修改 Excel 配置或更新项目后，应重新执行 `pnpm build:data`，依赖变化时也需重新执行安装命令。

事件现使用结构化 JSON 配置，角色状态、条件、效果及旧数据迁移方式见 [事件数据说明](packages/data/EVENTS.md)。其他配置表仍使用 Excel；`pnpm build:data` 会构建并校验数据。

## 测试存档导入导出

网页版首页可导出和导入 JSON 存档，沿用现有字段，包含成就、游玩次数、事件与天赋收集记录、属性极值及继承天赋。导入会替换当前跨局档案；不包含进行中的人生或单独保存的唯一角色。请完成本局结算返回首页后再导出。

1. 在首页点击“导出存档”，下载当前档案的 JSON 备份。首次打开、没有游玩记录时也可以导出。
2. 游玩并完成一局结算，或准备另一份测试存档。
3. 点击“导入存档”，选择之前导出的 JSON，成就和统计会立即恢复为该文件的内容。
4. 刷新页面，确认恢复后的档案仍然保留。无效文件会提示错误，且不会覆盖原档。

本地存档保存在浏览器的 `localStorage` 中，浏览器、域名和端口不同会使用不同的存档。测试时请固定使用上述地址。导入、导出按钮无需解锁；若想在第一次游玩前查看成就页，开发模式下可打开 **http://127.0.0.1:5173/?features=0**。

## 其他命令

```sh
# 构建生产版网页
pnpm build:web

# 本地预览生产版，打开终端输出的地址（默认端口 4173）
pnpm preview

# 启动终端版；存档导入导出按钮位于网页版
pnpm dev:console
```
