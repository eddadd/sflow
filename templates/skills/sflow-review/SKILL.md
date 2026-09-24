---
name: sflow-review
description: sflow 工作流的审查阶段命令。当用户说 "/sflow-review"，或验证通过后、归档前需要对改动做结构化代码审查时使用。调用 workflow.config.md 配置的审查工具（如 code-cr），问题按 Critical/Important/Minor 三级归类，Critical 未清零不得进入归档。agent_created: true
---

# sflow-review

审查阶段：验证链保证"跑得过"，审查保证"改得对"。工具可插拔，严重度分级统一。

## 前置检查

1. 加载共享约定 core.md（单一母本：`sflow-start/references/core.md`，本目录不再保留副本）与项目 `workflow.config.md`。
2. 状态检测：`/sflow-verify` 已通过（progress.md 验证记录表全绿）。验证未通过 → 拒绝审查，指回 `/sflow-verify`。
3. 读取 `review_tool` 配置：
   - 配置了工具（如 code-cr）→ 确认工具可用（查找项目内工具目录/命令说明，如 `code-cr/`）；不可用时**询问用户**如何调用，不得静默跳过审查。
   - 配置为空 → 询问用户是跳过审查还是手动指定方式；用户确认跳过则记录"review 跳过（用户确认）"后放行。

## 审查范围

- 改动基线：progress.md 各批次的改动文件清单（或 git diff）
- 审查维度：契约符合度（行为 vs 已批准行为）、需求覆盖（漏实现）、编码规范（项目 AGENTS.md / docs/*.md）、副作用（范围外文件、公共组件影响面、样式与枚举规范）

## 三级严重度归类

| 级别 | 定义 | 处理 |
|------|------|------|
| Critical | 违反契约/需求、逻辑错误、安全问题、范围外改动 | **阻塞**：必须修复并复验后才能归档 |
| Important | 规范违反、边界缺失、可维护性隐患 | 应修：修复或经用户确认延后并记录 |
| Minor | 命名、注释措辞、风格细节 | 记录：不阻塞，留给后续 |

审查结论记入 progress.md：`review：<时间> Critical n / Important n / Minor n <阻塞与否>`。

## 修复循环

Critical/Important 需要修复时：回 `/sflow-apply`（在契约范围内改）或 `/sflow-debug`（缺陷修复），修完重跑 `/sflow-verify` 相关项，再回到本命令复审。**Critical 未清零，下一命令 `/sflow-archive` 必须拒绝归档。**

## 阶段报告（强制收尾）

输出末尾必须附共享约定 core.md（sflow-start 母本）第 8 节的四行报告。

## 反模式

- 不得把审查做成"看一眼没问题"——结论必须有依据（引用文件/行/契约条款）。
- 不得替用户决定 Important 延后是否可接受——延后必须用户确认。
- 不得审查通过却在 progress.md 留空结论——台账是归档的依据。
