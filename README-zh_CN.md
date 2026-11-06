# 人生重开模拟器

<a href="https://discord.gg/U3qrf49NMQ"><img src="https://img.shields.io/discord/883382868427014255?color=%23FEE75C&label=Discord&logo=discord&logoColor=white&style=for-the-badge" /></a>

[English](./README.md) | 简体中文

## 开发环境

包管理: `pnpm`
运行时: `bun`

## 使用

### 开发

```bash
pnpm build:data
pnpm dev
```

事件现使用结构化 JSON 配置，角色状态、条件、效果及旧数据迁移方式见 [事件数据说明](packages/data/EVENTS.md)。其他配置表仍使用 Excel；`pnpm build:data` 会构建并校验数据。
