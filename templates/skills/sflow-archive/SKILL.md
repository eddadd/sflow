---
name: sflow-archive
description: sflow 工作流的归档收口命令。当用户说 "/sflow-archive"，或验证与审查全部通过、需要归档变更并同步主规格时使用。生成变更总结与 delta 合并方案，触发 DP-4 人工确认后归档并合并主规格，防规格腐烂。agent_created: true
---

# sflow-archive

归档阶段：把 delta spec 合并回主规格，变更封卷。规格不是写完一次就扔的草稿——不合并就会腐烂。

## 前置检查（缺一不可，否则拒绝归档）

1. 加载共享约定 core.md（单一母本：`sflow-start/references/core.md`，本目录不再保留副本）。
2. 状态检测：state.yaml 回执流末条为 `review.passed` 且其中 `counts.critical == 0`（或用户明确确认跳过审查并留有 `override` 回执）。**没有 `review.passed` = 审查未发生**，不允许把"验证通过"当作"审查通过"——两者是不同环节，前者证明跑得过，后者证明改得对。存量变更（无 state.yaml）回退 progress.md 的审查结论记录。
3. 不满足 → 拒绝归档，输出阶段报告指回缺失环节（缺审查 → `/sflow-review`；验证未过 → `/sflow-verify`）。

## DP-4：归档确认（人工决策，可直通）

DP-4 的目的是拦住「合并范围没人过目」。当本次变更**不可能改变既有条款语义**时，人工确认不产生决策，只产生等待。先按下面的判据判定走「直通合并」还是「DP-4 确认」（core.md 第 14 节摘要 + 本节完整判据）。

**可直通（跳过等待，合并后一次性呈报）——同时满足全部**：

1. 本次 delta **只含 `## 新增需求`**，无 MODIFIED、无 REMOVED；
2. 每个 delta 需求标题在目标主规格中**不存在**（纯新增，不撞标题）；
3. 目标 capability 的主规格文件**已存在**且格式与 delta 逐字一致。

**必须走 DP-4 人工确认（任一命中）**：

- 含 MODIFIED 或 REMOVED（改动/删除既有条款，语义变化需人过目）；
- delta 需求标题与主规格已有标题**重合或近似**（存在覆盖风险）；
- 目标 capability 主规格**不存在**（本次新建主规格文件，需确认 Purpose/命名）；
- delta 与主规格格式不一致（需用户决定以谁为准）。

走 DP-4 确认时，向用户展示三件事，明确批准后才执行归档；要求调整合并范围则修改方案后重新展示：

1. **变更总结**：一段话说清做了什么、为什么、影响哪些模块
2. **delta 合并方案**：列出本次变更每个 capability 的 spec（ADDED/MODIFIED/REMOVED），逐条说明合并进 `openspec/specs/` 主规格的方式；REMOVED 的说明主规格对应条款的删除
3. **归档清单**：将移动到 `<changes_dir>/archive/<日期>-<变更名>/` 的文件列表（`changes_dir` 读自 workflow.config.md，默认 `openspec/changes/`）

**直通不等于无记录**：选择直通时，**仍必须**在 state.yaml **先**追加 `archive.direct` 回执（含上述三条依据），**再**追加 `archive.done`；并在归档报告中列出合并清单与合并结果 diff 摘要——「跳过等待」不是「跳过留痕」。任一判据拿不准 → 走 DP-4 确认，不要「反正看着像新增」就直通。

## 执行归档（批准后）

1. **合并主规格**：按批准的方案把 delta 合并进 `openspec/specs/`——ADDED 追加、MODIFIED 原位改写、REMOVED 删除。**合并时保留主规格既有结构头格式，不强制转换**：主规格用什么结构头（中文或英文），合并结果就继续用哪种；delta 与主规格格式不一致时以**主规格**为准并如实记录差异，不得借合并"顺手"把主规格改头换面（那会让历史条款标题漂移，破坏后续变更的标题匹配）。

2. **移动变更目录**：整个变更目录（含 `.openspec.yaml`、`state.yaml`）移入 `<changes_dir>/archive/`（`changes_dir` 读自 workflow.config.md，默认 `openspec/changes/`），保留全部工件与台账作审计证据。目录结构与 OpenSpec CLI 兼容，`.openspec.yaml` 保留不删，确保 OpenSpec CLI 仍能识别归档记录（core.md 第 4 节）。
3. **收尾登记**：在 state.yaml **先**追加 `archive.direct`（仅直通合并时，含判定依据三条），**再**追加 `archive.done`——两条都在合并完成后、移动目录前写入，随目录一起归档（终态回执始终是 `archive.done`，`archive.direct` 只是它前面的一个附加标记，不得替代它）；**最后**移动目录；progress.md 末尾追加终态记录：`done：<日期> 已归档，delta 已合并`。
4. 主规格合并处出现冲突或语义含糊时**停下询问用户**，不得自行取舍。

## 阶段报告（强制收尾）

输出末尾必须附共享约定 core.md（sflow-start 母本）第 8 节的四行报告。归档完成即终态：`done`，"下一步"写 `none`（新需求从 `/sflow-start` 重新进入）。

## 反模式

- 不得跳过 DP-4 直接归档——合并方案必须用户过目。
- 不得归档后删除变更目录——archive 是审计证据，只进不出。
- 不得只移目录不合并主规格——那等于把规格写完就扔，下个变更又从零猜起。
