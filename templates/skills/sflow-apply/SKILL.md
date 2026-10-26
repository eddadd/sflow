---
name: sflow-apply
description: sflow 工作流的执行阶段命令。当用户说 "/sflow-apply"，或执行契约获得 DP-2 批准后需要按契约推进实现时使用。按任务批次执行、维护进度台账、强制范围栅栏与回退规则，遇 bug 转入 /sflow-debug。agent_created: true
---

# sflow-apply

执行阶段：契约是唯一工作权威，聊天记录不是。按批次推进，每一步留痕。

## 前置检查（缺一不可，否则拒绝执行）

1. 加载共享约定 core.md（单一母本：`sflow-start/references/core.md`，本目录不再保留副本）与项目 `workflow.config.md`。**若 `git_discipline: on`，另加载 `sflow-start/references/git-discipline.md`**（提交纪律正文本体，core.md 第 12 节只是它的判据摘要）。
2. 读取 `execution-contract.md`：存在且 state.yaml 中存在 `dp2.approved` 回执（无 state.yaml 的存量变更以契约"批准记录"与 progress.md 为准）。
3. DP-2 未批准或契约缺失 → 拒绝写任何代码，输出阶段报告指回 `/sflow-contract`。
4. 恢复场景（会话中断后重开）：先读 state.yaml 回执流、progress.md 与契约，对齐后从**最后一条 `batch.N.done` 的下一批**继续；**不得凭聊天记忆判断做到哪了**，不得重做已完成任务、不得跳过可重试的失败任务。
5. **提交纪律开关**：读 `workflow.config.md` 的 `git_discipline`；为 `on` 时本命令全程按 `sflow-start/references/git-discipline.md` 执行（干净树前置 + TDD 红-绿 + 每批次 commit），为 `off`（默认）时不强制提交，但批次回执与验证义务照做。

## 执行纪律

1. **按批次推进**：顺序执行契约中的任务批次，不得擅自重排、合并或拆分；要调整先停下说明理由，经用户同意后按"契约过期"重走 `/sflow-contract`。
2. **工件指纹核对（每批次开始前必做，含恢复场景）**：按 core.md 第 3 节重算三个指纹（`artifacts` 逐个文件、`tasks` **剥离复选框后再哈希**、`contract`），与 state.yaml 中**最后一条** `dp2.approved` 回执的 `fingerprints` 比对；任一不一致 → 机械判定契约过期，立即停止执行并回 `/sflow-contract`，不得"先做完这批再说"。**优先用 `sflow guard [<change>]` 机械执行**（core.md 第 13 节）：退出码 1 = 契约过期、2 = 审计污染、0 = fresh；CLI 不可用时按文字规则重算比对。**注意**：本批次完成时在 tasks.md 勾选任务属于正常执行进度，归一化后的 `tasks` 指纹不会因此变化——若它变了，说明任务组被重排/增删/改写，才是真漂移。
3. **锚点完整性核对**：确认 `baseline.review_base` 与首条 `dp2.approved` 的 `review_base` 一致且未被改写（`sflow guard` 退出码 2 即锚点污染；手工核对时对比 git 历史中该文件的旧版本）。锚点被改写 → **审计污染**，停止一切执行并呈报，不得继续，也不得"改回去继续做"。
4. **范围栅栏**：只允许改契约"任务批次"中列出的文件；发现需要动范围外的文件 → 立即停下，按强制回退规则处理：范围问题回 `/sflow-propose`，约束问题回 `/sflow-contract`。禁止"顺手改掉"。
5. **每个批次完成后**：
   - 在 tasks.md 勾掉对应任务，标注覆盖的 Requirement
   - **在 state.yaml 追加 `batch.N.done` 回执**（批次号、改动文件、验证义务结果摘要、`git_discipline: on` 时含 commit sha），这是"该批已完成"的唯一机械证据
   - 在 progress.md 追加叙述：批次号、改动文件清单、验证义务的真实执行结果（贴输出）
   - 验证义务失败 → 转入 `/sflow-debug`，不得带病进下一批次
6. **批次内步骤（按 `git_discipline` 分档）**：
   - **`off`（默认）**：直接按契约实现 → 跑批次验证义务 → 贴输出 → 回执。不要求先写测试，也不要求 commit。
   - **`on`**：每批次开始前先 `git status --porcelain` 必须无输出（脏工作区拒绝进入，先请用户处理残留改动）；批次内按 `sflow-start/references/git-discipline.md`（core.md 第 12 节摘要）走 TDD 红-绿——**先写会失败的测试并贴失败输出（红）→ 最小实现 → 测试转绿并贴通过输出（绿）→ 跑批次验证义务 → `git commit`（提交信息含批次号与覆盖的 Requirement）→ 写含 commit sha 的 `batch.N.done` 回执**。测试无法先行时（纯配置/文档/无测试框架）如实记录豁免理由，不得假装红过。
7. **编码规范**：遵守项目 AGENTS.md / docs/*.md 的既有约定（箭头函数、显式类型、注释格式、枚举常量化等）。
8. **注释与魔法值**：新增逻辑按项目注释规范补注释；字面量提取为具名常量。

## 遇到 bug / 行为不符

立即转入 `/sflow-debug`，禁止在聊天里"快速试一下"。调试结束持根因结论返回本命令继续。

## 全部批次完成

最后一批的 `batch.N.done` 回执即"执行完成"的机械证据；同时在 progress.md 记一句"执行完成"作为叙述，输出阶段报告，"下一步"为 `/sflow-verify`。

**审查基线不变更**：整个执行阶段不得改写 state.yaml 的 `baseline.review_base`（首次 DP-2 批准时写入的起点 commit）。验证与审查都从该基线起算改动范围；比对时排除变更工件目录本身（core.md 第 11 节）。

## 阶段报告（强制收尾）

输出末尾必须附共享约定 core.md（sflow-start 母本）第 8 节的四行报告。

## 反模式

- 不得在无契约或 DP-2 未批准时写业务代码——这是全流程唯一的绝对硬门禁。
- 不得修改 proposal/specs/design/tasks 本身来"适配"实现——工件变了必须走回退，而不是边做边改。
- 不得把"本次先这样、下次再改"写进交付——要么进契约，要么进 Out of Scope。
