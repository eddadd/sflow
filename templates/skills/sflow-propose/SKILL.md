---
name: sflow-propose
description: sflow 工作流的规划阶段命令。当用户说 "/sflow-propose"，或确认要为某个新需求走完整 sflow 流程、需要澄清需求并产出 proposal/specs/design/tasks 四份规划工件时使用。一次一问澄清需求，产出中文工件并自检，末尾触发 DP-1 人工确认。agent_created: true
---

# sflow-propose

规划阶段：把模糊需求澄清成四份可审查的工件，一次人工确认（DP-1）后锁定方向。

## 前置检查

1. 加载共享约定 core.md（单一母本：`sflow-start/references/core.md`，本目录不再保留副本）。
2. 读取项目 `workflow.config.md`；缺失则先走 `/sflow-start` 的配置流程。
3. 状态检测：已存在活动变更且未收口时，询问用户是继续该变更还是另起变更；不得默认覆盖旧变更。
4. 判断路径：符合 tweak/hotfix 边界的，提示用户可直接走快速路径，用户坚持走 full 才继续。

## 需求探索纪律

1. **一次只问一个问题**，不得一次抛出一串问题。
2. 每个方向性问题给出 **2-3 个方案并明确推荐其中一个**，说明理由；用户难以抉择时，基于已有上下文直接替用户选定并说明。
3. 方向未定前**禁止写任何工件**。
4. 覆盖四个基本盘后即可收口：要解决什么问题、范围内/外是什么、关键约束有哪些、怎么算完成。

## 产出四份工件

写入 `<changes_dir>/<change-name>/`，全部使用 `assets/` 中的模板，内容为简体中文：

1. `proposal.md` — Why（≥50 字，讲清问题与动机）/ What Changes / Scope（含 Out of Scope 范围栅栏）
2. `specs/<capability>/spec.md` — delta 格式（ADDED / MODIFIED / REMOVED Requirements）；每条 Requirement 含 SHALL 或 MUST，且至少一个 `#### Scenario:` 块
3. `design.md` — 技术选型、接口/依赖/数据约束、关键决策及理由
4. `tasks.md` — 有序任务清单，任务粒度可独立验证
5. `.openspec.yaml` — 内容为 `schema: spec-driven` 与 `created: <日期>`（与 OpenSpec CLI 共存的元数据，见 core.md 第 4 节）

change-name 用英文短横线命名（如 `add-order-export`），目录内工件用中文。

## 工件自检（写完必过）

- [ ] `## Why` ≥ 50 字符
- [ ] 每条 Requirement 含 SHALL/MUST 且有 `#### Scenario:`
- [ ] Out of Scope 非空——明确写了不做什么
- [ ] tasks 与 specs 的每条 Requirement 可对应（映射关系在 DP-1 时展示）
- [ ] 无占位符残留（TODO、xxx、待定）

## DP-1：需求 + 工件合并确认

向用户展示：变更摘要（一段话）、范围栅栏、Requirement → tasks 映射表、关键设计决策。用户明确批准后才算通过；提出修改意见则迭代工件后重新展示。

**轻量化开关**：workflow.config.md 配置 `dp1_lightweight: true` 且需求不属强制 full 情形（见 config 强制 full 清单）时，可将需求确认与工件展示合并为一次确认；强制 full 情形不受开关影响，仍分步确认。

**硬规则**：DP-1 未批准，不得建议用户执行 `/sflow-contract`，更不得写任何业务代码。DP-1 批准后，在台账 progress.md 记录批准时间与结论。

## 阶段报告（强制收尾）

执行结束（无论工件写完、DP-1 等待确认、还是被用户中断）时，输出末尾必须附共享约定 core.md（sflow-start 母本）第 8 节的固定四行报告。DP-1 已批准时，"下一步"写 `/sflow-contract`。

## 反模式

- 不得跳过探索直接写工件，哪怕需求"看起来很简单"。
- 不得在 proposal 里堆砌代码实现细节——实现细节属于 design.md。
- 不得为了通过自检凑字数——Why 写不清说明问题还没想清楚，回去继续问。
