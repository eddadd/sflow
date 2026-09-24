---
name: sflow-archive
description: sflow 工作流的归档收口命令。当用户说 "/sflow-archive"，或验证与审查全部通过、需要归档变更并同步主规格时使用。生成变更总结与 delta 合并方案，触发 DP-4 人工确认后归档并合并主规格，防规格腐烂。agent_created: true
---

# sflow-archive

归档阶段：把 delta spec 合并回主规格，变更封卷。规格不是写完一次就扔的草稿——不合并就会腐烂。

## 前置检查（缺一不可，否则拒绝归档）

1. 加载共享约定 core.md（单一母本：`sflow-start/references/core.md`，本目录不再保留副本）。
2. 状态检测：progress.md 中验证记录表全绿（/sflow-verify 通过）且审查结论无阻塞 Critical（/sflow-review 通过或用户确认跳过）。
3. 不满足 → 拒绝归档，输出阶段报告指回缺失环节。

## DP-4：归档确认（人工决策）

向用户展示三件事：

1. **变更总结**：一段话说清做了什么、为什么、影响哪些模块
2. **delta 合并方案**：列出本次变更每个 capability 的 spec（ADDED/MODIFIED/REMOVED），逐条说明合并进 `openspec/specs/` 主规格的方式；REMOVED 的说明主规格对应条款的删除
3. **归档清单**：将移动到 `openspec/changes/archive/<日期>-<变更名>/` 的文件列表

用户明确批准后才执行归档；要求调整合并范围则修改方案后重新展示。

## 执行归档（批准后）

1. **合并主规格**：按批准的方案把 delta 合并进 `openspec/specs/`——ADDED 追加、MODIFIED 原位改写、REMOVED 删除，保持主规格格式（Requirement 含 SHALL/MUST + Scenario）。
2. **移动变更目录**：整个变更目录（含 `.openspec.yaml`）移入 `openspec/changes/archive/`，保留全部工件与 progress.md 作审计证据。目录结构与 OpenSpec CLI 兼容，`.openspec.yaml` 保留不删，确保 OpenSpec CLI 仍能识别归档记录（core.md 第 4 节）。
3. **收尾登记**：progress.md 末尾追加终态记录：`done：<日期> 已归档，delta 已合并`；状态写 done。
4. 主规格合并处出现冲突或语义含糊时**停下询问用户**，不得自行取舍。

## 阶段报告（强制收尾）

输出末尾必须附共享约定 core.md（sflow-start 母本）第 8 节的四行报告。归档完成即终态：`done`，"下一步"写 `none`（新需求从 `/sflow-start` 重新进入）。

## 反模式

- 不得跳过 DP-4 直接归档——合并方案必须用户过目。
- 不得归档后删除变更目录——archive 是审计证据，只进不出。
- 不得只移目录不合并主规格——那等于把规格写完就扔，下个变更又从零猜起。
