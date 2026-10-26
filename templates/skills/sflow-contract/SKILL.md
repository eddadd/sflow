---
name: sflow-contract
description: sflow 工作流的桥接阶段命令。当用户说 "/sflow-contract"，或 DP-1 批准后需要把规划工件压缩成执行契约、或在契约过期需要重新生成时使用。从 proposal/specs/design/tasks 提炼 execution-contract.md，执行需求覆盖交叉检查，末尾触发 DP-2 契约批准硬门禁。agent_created: true
---

# sflow-contract

桥接阶段：把规划工件压缩成一份执行契约，作为规划到实现的**唯一交接层**。契约批准前，一行业务代码都不许写。

## 前置检查

1. 加载共享约定 core.md（单一母本：`sflow-start/references/core.md`，本目录不再保留副本）。
2. 读取项目 `workflow.config.md`。
3. 状态检测：确认活动变更的规划工件齐全，且 state.yaml 中存在 `dp1.approved` **或** `dp1.skipped` 回执（无 state.yaml 的存量变更以 progress.md 批准记录为准）。两者都没有 → 拒绝生成契约，输出阶段报告指回 `/sflow-propose`。`dp1.skipped` 是合法的 DP-1 条件化结果（简单 full 需求），不是缺批准。
4. 工件语言：契约用简体中文，代码标识符和 schema 关键字保持原样。

## 生成执行契约

读取规划工件后，按 `assets/execution-contract.md` 模板生成 `<changes_dir>/<change-name>/execution-contract.md`，映射关系：

| 来源 | 提取为 |
|------|--------|
| proposal.md 的 Why + What Changes | 意图锁（问题 + 变更范围） |
| proposal.md 的 Out of Scope | 范围栅栏（原样继承，不得缩水或扩大） |
| specs/ 的每条 Requirement 与 Scenario | 已批准行为 + 验收检查 |
| design.md 的 Decisions 与约束（**未生成 design.md 时改取 proposal「技术决策」节**） | 设计约束（接口/依赖/数据） |
| tasks.md 的任务分组 | 任务批次（含完成标准） |

压缩原则：契约只锁定**决策和边界**，不复制工件细节；细节有歧义时回到工件，不在契约里发明新决策。

## 需求覆盖交叉检查（生成时必做）

1. 逐条列出 specs/ 中所有规范条款（中文「必须」/「不得」，或英文项目的 SHALL/MUST）。
2. 核对每条：已出现在"已批准行为"、映射到至少一个任务批次、有对应验证义务。
3. 未映射的 Requirement **显式列入契约的"未覆盖项"**，并提示回 `/sflow-propose` 补齐——不得静默丢弃。

## DP-2：契约批准（唯一硬门禁）

向用户展示：契约全文 + 需求覆盖映射表 + 识别到的歧义点。请求**明确批准**。

- 未批准：记录修改意见，迭代契约后重新展示。
- 批准：**在 state.yaml 追加一条 `dp2.approved` 回执**，它是 DP-2 批准的唯一机械证据（格式见 core.md 第 11 节）。回执内容：

  1. `fingerprints.artifacts`：对 `proposal.md`、`specs/` 下全部 `spec.md`、`design.md`（**存在时**）逐个执行 `git hash-object <file>`；未生成 design.md 时该项只有 proposal 与 specs。**推荐直接运行 `sflow guard --emit-fingerprints` 生成整行**（core.md 第 13 节），避免手抄哈希出错。
  2. `fingerprints.tasks`：对 `tasks.md` **先剥离复选框再哈希**（逐字照用 core.md 第 3 节的命令，不得自行改写归一化逻辑）——勾选任务是执行进度不是规划范围，直接哈希原文会让批次勾选动作本身误判契约过期；
  3. `fingerprints.contract`：对 `execution-contract.md` 执行 `git hash-object execution-contract.md`；
  4. `review_base`：执行 `git rev-parse HEAD` 取 commit sha，**仅首次 DP-2 批准时写入**，并同步写入 `baseline.review_base`（只写一次，后续含重新桥接都不得改写）。

  随后把状态改为 building，progress.md 只记一句"DP-2 批准 + 回执已写入 state.yaml"，**不再抄写哈希值**。

**硬规则**：
- 不得替用户批准契约。
- 存在未解歧义时不得请求批准，先解决歧义。
- DP-2 未批准，`/sflow-apply` 必须拒绝执行。

## 契约过期检测

出现下列任一情况，契约视为过期，须重新生成本命令的流程（重走 DP-2）：

- proposal 范围变化（`artifacts` 变）
- specs 增删改 Requirement（`artifacts` 变）
- design 关键决策变化（`artifacts` 变）
- tasks 任务组重排、任务增删或文字改动（`tasks` 变；**仅勾选状态变化不算**）
- 契约自身条款被改动（`contract` 变）
- 契约意图锁与 proposal 范围不再匹配

判定方式：重算三个指纹，与 state.yaml 中**最后一条** `dp2.approved` 回执的 `fingerprints` 比对，任一不一致即过期——机械判定，不靠人眼。重新生成契约并获批时**追加新的 `dp2.approved`**，不改写旧条目；`baseline.review_base` 始终不变。存量变更（无 state.yaml）回退 progress.md 的"工件指纹"表比对。

## 阶段报告（强制收尾）

输出末尾必须附共享约定 core.md（sflow-start 母本）第 8 节的四行报告。DP-2 待批准时"下一步"写"等待用户批准契约"；批准后写 `/sflow-apply`。

## 反模式

- 不得跳过覆盖交叉检查直接生成契约。
- 不得在契约里新增工件中不存在的需求或方案。
- 不得因为"工件看起来很完整"就跳过契约——没有契约，执行就没有边界。
