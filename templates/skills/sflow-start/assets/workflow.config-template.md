# sflow 项目配置（<项目名>）

> 本文件是 sflow 工作流的项目级配置。/sflow-start 每次启动都会读取它；项目差异全部收敛在这里，工作流本体保持平台无关。

## 验证链（/sflow-verify 逐条真实执行并贴出输出）

- pnpm lint
- pnpm typecheck
- pnpm build

## 审查工具（/sflow-review 调用；留空则跳过 review 阶段）

code-cr

## 快速路径边界（超出自动升级回 full）

- tweak: 4   # ≤4 个文件，且纯配置/文档修改
- hotfix: 2  # ≤2 个文件

## 强制 full 的情形（不可走快速路径）

- 新增模块或页面
- schema / API 契约变更
- 跨模块改动

## 变更工件目录

openspec/changes

## 工件语言

zh-CN
