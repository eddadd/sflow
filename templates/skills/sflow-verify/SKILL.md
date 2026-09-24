---
name: sflow-verify
description: sflow 工作流的验证收口命令。当用户说 "/sflow-verify"，或执行阶段全部批次完成后需要验证收口时使用。逐条真实执行项目验证链并贴出输出，做 Completeness/Correctness/Coherence 三维判定，验证失败触发 DP 处理。agent_created: true
---

# sflow-verify

验证阶段："完成"不是声称出来的，是跑出来的。本命令是收口前的最后一道硬门禁。

## 前置检查

1. 加载共享约定 core.md（单一母本：`sflow-start/references/core.md`，本目录不再保留副本）与项目 `workflow.config.md`。
2. 状态检测：tasks.md 全部勾选且 progress.md 记录"执行完成"。未完成 → 拒绝验证，输出阶段报告指回 `/sflow-apply`。

## 验证链执行（核心动作）

1. 从 `workflow.config.md` 的 `verification` 逐条读取命令。
2. **每条真实执行**，完整贴出命令与输出（包括无输出时的退出码）。
3. 任何一条失败：
   - 在 progress.md 验证记录表登记失败详情
   - 触发 DP：向用户呈报失败项，由用户决定转 `/sflow-debug` 修复后重验，还是放弃变更
   - **不得**自行重试超过一次，不得跳过失败项继续判"通过"
4. 全部通过 → 在 progress.md 验证记录表逐条登记（时间 / 命令 / 结果）。

## 三维判定

| 维度 | 判什么 | 怎么判 |
|------|--------|--------|
| Completeness 完整性 | 需求无遗漏 | specs 每条 Requirement 都能对应到已完成的任务与验证义务 |
| Correctness 正确性 | 行为符合契约 | 契约"关键场景/验收检查"逐条比对实现行为 |
| Coherence 一致性 | 改动无越界 | progress.md 改动文件清单与契约批次一致，无范围外文件被改 |

任何一维不通过：在 progress.md 记录结论与差异说明，触发 DP 交用户决定（回 `/sflow-apply` 修复或放弃变更）。**不得**带着不通过判定进入归档。

## 快速路径收口

hotfix/tweak 不走本命令的完整三维判定，但**验证链仍必须真实跑完并贴输出**（core.md 第 7 节，快速路径只豁免文书，不豁免验证），结果登记到 `quick-<name>/progress.md` 台账并标记收口。

## 阶段报告（强制收尾）

输出末尾必须附共享约定 core.md（sflow-start 母本）第 8 节的四行报告。全部通过时"下一步"为 `/sflow-archive`。

## 反模式

- 不得用"应该没问题""类型看着是对的"代替真实执行输出。
- 不得只跑验证链的一部分就宣布通过。
- 不得在验证失败时静默降级结论（如把失败描述成"部分通过"）。
