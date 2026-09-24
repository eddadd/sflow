---
name: sflow-contract
description: sflow 工作流的桥接阶段命令。当用户说 "/sflow-contract"，或 DP-1 批准后需要把规划工件压缩成执行契约、或在契约过期需要重新生成时使用。从 proposal/specs/design/tasks 提炼 execution-contract.md，执行需求覆盖交叉检查，末尾触发 DP-2 契约批准硬门禁。agent_created: true
---

# sflow-contract

桥接阶段：把四份规划工件压缩成一份执行契约，作为规划到实现的**唯一交接层**。契约批准前，一行业务代码都不许写。

## 前置检查

1. 加载共享约定 core.md（单一母本：`sflow-start/references/core.md`，本目录不再保留副本）。
2. 读取项目 `workflow.config.md`。
3. 状态检测：确认活动变更的四份工件齐全，且 DP-1 已在 progress.md 记录批准。DP-1 未批准 → 拒绝生成契约，输出阶段报告指回 `/sflow-propose`。
4. 工件语言：契约用简体中文，代码标识符和 schema 关键字保持原样。

## 生成执行契约

读取四份工件后，按 `assets/execution-contract.md` 模板生成 `<changes_dir>/<change-name>/execution-contract.md`，映射关系：

| 来源 | 提取为 |
|------|--------|
| proposal.md 的 Why + What Changes | 意图锁（问题 + 变更范围） |
| proposal.md 的 Out of Scope | 范围栅栏（原样继承，不得缩水或扩大） |
| specs/ 的每条 Requirement 与 Scenario | 已批准行为 + 验收检查 |
| design.md 的 Decisions 与约束 | 设计约束（接口/依赖/数据） |
| tasks.md 的任务分组 | 任务批次（含完成标准） |

压缩原则：契约只锁定**决策和边界**，不复制工件细节；细节有歧义时回到工件，不在契约里发明新决策。

## 需求覆盖交叉检查（生成时必做）

1. 逐条列出 specs/ 中所有 SHALL/MUST。
2. 核对每条：已出现在"已批准行为"、映射到至少一个任务批次、有对应验证义务。
3. 未映射的 Requirement **显式列入契约的"未覆盖项"**，并提示回 `/sflow-propose` 补齐——不得静默丢弃。

## DP-2：契约批准（唯一硬门禁）

向用户展示：契约全文 + 需求覆盖映射表 + 识别到的歧义点。请求**明确批准**。

- 未批准：记录修改意见，迭代契约后重新展示。
- 批准：在 progress.md 记录 `DP-2 批准：<时间> <结论摘要>`；随后用 `git hash-object` 对 proposal.md、specs/ 下全部 spec.md、design.md、tasks.md 生成指纹，记入 progress.md 的"工件指纹"表，状态改为 building。

**硬规则**：
- 不得替用户批准契约。
- 存在未解歧义时不得请求批准，先解决歧义。
- DP-2 未批准，`/sflow-apply` 必须拒绝执行。

## 契约过期检测

出现下列任一情况，契约视为过期，须重新生成本命令的流程（重走 DP-2）：

- proposal 范围变化
- specs 增删改 Requirement
- design 关键决策变化
- tasks 任务组重排
- 契约意图锁与 proposal 范围不再匹配

## 阶段报告（强制收尾）

输出末尾必须附共享约定 core.md（sflow-start 母本）第 8 节的四行报告。DP-2 待批准时"下一步"写"等待用户批准契约"；批准后写 `/sflow-apply`。

## 反模式

- 不得跳过覆盖交叉检查直接生成契约。
- 不得在契约里新增工件中不存在的需求或方案。
- 不得因为"工件看起来很完整"就跳过契约——没有契约，执行就没有边界。
