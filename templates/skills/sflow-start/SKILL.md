---
name: sflow-start
description: sflow 个人工作流的唯一入口。当用户说 "/sflow start"、"/sflow status"、"继续上次的工作流"、"帮我看看现在该干什么"，或想开始/恢复一个变更的工作流时使用。负责读取项目 workflow.config.md、对 openspec 工件做内容级状态检测、选择执行路径（full/hotfix/tweak）并路由到下一阶段命令。agent_created: true
---

# sflow-start

sflow 工作流入口：基于工件内容（而非时间戳）检测当前所处阶段，选择执行路径，路由到正确的下一条 `/sflow-*` 命令。会话中断后重开，同样通过本命令恢复。

## 第一步：读取项目配置

1. 读取项目根目录 `workflow.config.md`。
2. 文件不存在时：读取本技能 `assets/workflow.config-template.md`，就验证链、测试工具、审查工具、快速路径边界各项逐一向用户确认后，生成该文件再继续。不得跳过配置猜测验证命令。
3. **验证链真实性预检（P0，生成 config 前必做）**：验证链里的每条命令必须**逐条真实执行一遍**（如 `pnpm <script> --version`、或直接运行只读命令）确认其在**本项目**中确实存在且可运行；命令不存在、脚本名拼错或只在模板默认值里成立时，必须先向用户报告并改为项目真实命令。禁止把模板默认值（如 `pnpm lint:check` / `pnpm test`）直接当作项目验证链——未经验证的验证链会让 `/sflow-verify` 跑出假的"通过"。执行记录（命令 + 结果）贴给用户确认后才生成 config。
4. 记录配置中的：`verification`（验证链）、`review_tool`、`fast_path`（tweak/hotfix 边界）、`changes_dir`（变更工件目录，默认 `openspec/changes/`）。

## 第二步：内容级状态检测

对 `changes_dir` 下所有非 `archive/` 的变更目录，判定分两层（core.md 第 1 节）：**大阶段看工件，阶段内位置看 progress.md 台账末行**。

先看工件定大阶段：

| 目录内容 | 大阶段 | 下一步 |
|---------|--------|--------|
| 目录不存在，或全部变更已归档 | `exploring`（无活动变更） | 新需求 → `/sflow-propose` |
| 目录名为 `quick-<name>` 且仅有 progress.md（无四工件） | 快速路径（tweak/hotfix）执行中 | 继续执行，或走 `/sflow-verify` 快速路径收口 |
| 仅有 proposal.md，或工件不全 | `specifying` | 补齐工件 → `/sflow-propose`（续写） |
| 四份工件齐全，无 execution-contract.md | `specifying` 完成，待桥接 | `/sflow-contract` |
| 有 execution-contract.md，无 DP-2 批准记录 | `bridging`（待批准） | 展示契约请求批准 |
| 契约已批准，progress.md 有未完成任务 | `building` | `/sflow-apply` |
| 任务全部完成 | 见下表（阶段内位置） | 见下表 |

再看 progress.md 台账**末行**定位阶段内位置（工件在这一层无法区分）：

| 台账末行性质 | 大阶段 → 阶段内位置 | 下一步 |
|-------------|-------------------|--------|
| 末条是 `### Attempt <n>` 且无返回结论 | `building` → debugging（调试中） | 继续调试，或按 DP-3 呈报 |
| 末条是"执行完成"（无验证记录） | `verifying`（待验证） | `/sflow-verify` |
| 末条是"验证记录全绿"/阶段报告显示验证通过 | `reviewing`（待审查） | `/sflow-review` |
| 末条是 `review：…` 且 Critical 为 0 | `archiving`（待归档） | `/sflow-archive` |
| 末条是 `done：…已归档` | 终态 `done` | `none` |
| 末条是放弃记录 | 终态 `abandoned` | `none` |

**硬规则**：`verifying` 通过后不得直接路由到 `/sflow-archive`——`/sflow-archive` 的前置检查要求审查结论无阻塞 Critical，跳过 `/sflow-review` 会被归档命令拒绝。`reviewing` 是必经状态，不是可选环节。台账末行读不出性质（如台账缺失或被截断）时，如实告知用户并请其确认，不得猜测。

多个活动变更并存时，列出全部并请用户指定目标，不做自动选择。**building 串行化**：同一时间至多一个变更处于 `building`；已有变更在 building 时，其他变更只能停在 `specifying` / `bridging`（core.md 第 1 节）。

## 第三步：路径选择

用户新提一个需求时，按工作量推荐路径并请用户确认：

- **tweak**：改动 ≤ `fast_path.tweak` 个文件，且纯配置/文档（判定标准见 `references/core.md` 第 1 节）→ 直接编辑，收口时附验证证据摘要。
- **hotfix**：改动 ≤ `fast_path.hotfix` 个文件 → 跳过完整工件，只记录意图 + 改动清单，收口必须有验证链真实输出。
- **full**：其余一律完整流程。

硬规则：
- 涉及新模块、schema/API 变更、跨模块改动 → 强制 `full`，不得走快速路径。
- 快速路径执行中超出边界 → 立即停下，升级回 `full`，已完成工作写入 progress.md 备查。
- 路径选择必须留痕：full 路径记录到变更目录 progress.md 首部；快速路径必须先在 `changes_dir` 下建 `quick-<name>/progress.md` 台账（意图 + 改动清单 + 验证输出），路径选择记录到台账首部——保证会话中断后状态检测可恢复。

## 第四步：输出阶段报告

每次执行结束，按 `references/core.md` 第 8 节的固定格式收尾（当前阶段 / 已完成或阻塞 / 下一步命令 / 进入条件）。该报告格式对**所有** `/sflow-*` 命令强制生效，不仅是本命令。

## 反模式

- 不得凭聊天记忆推断状态，必须重新读工件。
- 不得在 `bridging` 状态批准契约——批准永远由用户做出。
- 不得在无配置的情况下建议具体验证命令。
- 目标命令的技能文件缺失或不可用时，明确告知用户，不得用通用流程顶替。

## 共享约定

状态机、决策点、强制回退规则的完整定义见 `references/core.md`，执行任何 `/sflow-*` 命令前先加载它。
