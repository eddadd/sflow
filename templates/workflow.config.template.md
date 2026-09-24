# sflow 项目配置（<项目名>）

> 本文件是 sflow 工作流的项目级配置。/sflow-start 每次启动都会读取它；项目差异全部收敛在这里，工作流本体保持平台无关。
> 使用前请把各项改为本项目的真实命令与约定。

## 验证链（/sflow-verify 逐条真实执行并贴出输出；验证阶段建议使用只读命令，不修改文件）

- pnpm lint:check
- pnpm typecheck
- pnpm test
- pnpm build

## 审查工具（/sflow-review 调用；留空则跳过 review 阶段）

<审查工具 skill 名，如 code-cr；留空跳过>

## 快速路径边界（超出自动升级回 full）

- tweak: 4   # ≤4 个文件，且纯配置/文档修改
- hotfix: 2  # ≤2 个文件

### tweak 的"纯配置/文档"判定

- ✅ 算：`*.md` 文档、`.env*` 环境文件、`workflow.config.md`、纯注释增删
- ❌ 不算：构建配置、`package.json`（依赖变更影响面大）、`src/**` 下任何逻辑代码

## 强制 full 的情形（不可走快速路径）

- 新增模块或页面
- schema / API 契约变更
- 跨模块改动

## DP-1 轻量化

- dp1_lightweight: true # 非强制 full 的需求（一句话能说清），propose 将需求确认与工件展示合并为一次确认；强制 full 情形不受此开关影响

## 变更工件目录

openspec/changes

## 工件语言

zh-CN
