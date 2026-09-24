# sflow 全局共享约定（所有 /sflow-* 命令执行前加载）

## 1. 状态机（7 状态 + 2 快速路径）

```
exploring ──> specifying ──> bridging ──> building ──> verifying ──> archiving ──> done
                ^              ^             │    │
                │              │             │    └──> debugging（返回 building）
                │              └─────────────┘（契约漂移 → 重新桥接）
                └────────────────────────────（范围变化 → 重新规划）

快速路径：tweak（≤4 文件，纯配置/文档）→ 直接编辑
          hotfix（≤2 文件）→ 意图 + 改动清单 → 收口必须有验证证据
          超出边界 → 自动升级回 full
```

**tweak 的"纯配置/文档"判定标准**（边界数值以 workflow.config.md 为准）：

- ✅ 算：`*.md` 文档、`.env*` 环境文件、`workflow.config.md`、纯注释增删
- ❌ 不算：`vite.config.ts` 等构建配置、`package.json`（依赖变更影响面大）、`src/**` 下任何逻辑代码
- 判不准 → 按 full 处理，宁可流程重一点，不要边界裸奔

状态一律从工件内容推断，不从聊天记忆或文件时间戳推断。

**building 串行化**：同一时间至多允许一个变更处于 `building`（执行中）；其余活动变更只能停在 `specifying` / `bridging` 并行规划。理由：执行是唯一有写权限的阶段，串行化保证"改动文件清单 vs 契约"的比对不被其他变更干扰。

## 2. 人工决策点（DP，仅 4 个）

| DP | 时点 | 内容 | 硬规则 |
|----|------|------|--------|
| DP-1 | specifying 末 | 需求范围 + 四份工件合并一次确认 | 未批准不得生成契约 |
| DP-2 | 契约生成后 | 契约批准，唯一硬门禁 | 未批准不准写一行业务代码 |
| DP-3 | 调试 3 次失败 | 呈现已试方案与证据，用户决定方向 | 不得未经 DP-3 继续盲试 |
| DP-4 | 归档前 | 变更总结 + delta 合并方案确认 | 未确认不合并不归档 |

## 3. 强制回退规则（Mandatory Rewind）

出现下列任一情况，必须回退，禁止"在聊天里顺手改"：

- 出现新范围 / 新行为
- 关键接口变化
- 设计假设被证伪
- 契约的意图锁与 proposal 的范围不再匹配
- 回退目标：范围问题 → `specifying`（重跑 /sflow-propose）；约束问题 → `bridging`（重跑 /sflow-contract）

反模式一句话：契约变了，工件就必须跟着变（If the contract changed, the artifacts changed）。

**工件指纹（机械扳机）**：DP-2 批准时，用 `git hash-object <file>` 对四份规划工件各生成一个指纹，记入 progress.md 的"工件指纹"表；`/sflow-apply` 每个批次开始前（含会话中断恢复时）重算比对，任一指纹不一致 → 机械判定契约过期，立即停止执行并回 `/sflow-contract`，不得"先做完这批再说"。AI 只负责执行命令与比对字符串，判定是确定性的。

## 4. 工件目录布局（兼容 OpenSpec）

```
openspec/changes/<change-name>/
├── .openspec.yaml         # OpenSpec CLI 元数据（schema: spec-driven + created），创建变更时同步生成
├── proposal.md            # Why / What Changes / Scope
├── specs/<capability>/spec.md   # delta spec：ADDED/MODIFIED/REMOVED Requirements
├── design.md              # 技术决策
├── tasks.md               # 有序任务清单
├── execution-contract.md  # 桥接产物
└── progress.md            # 执行台账：路径选择、工件指纹、任务状态、验证记录、attempt 记录

openspec/changes/quick-<name>/     # 快速路径台账（tweak/hotfix 专用，不建四工件）
└── progress.md            # 意图 + 改动清单 + 验证输出
```

归档后并入 `openspec/changes/archive/<date>-<change-name>/`，delta spec 同步合并回主规格 `openspec/specs/`，防规格腐烂。

**与 OpenSpec CLI 共存**：变更目录结构、`.openspec.yaml` 元数据、archive 命名 `archive/<date>-<change-name>/` 均保持与 OpenSpec CLI 兼容；`.openspec.yaml` 随目录创建、随归档移动，任何阶段不得删除，确保 OpenSpec CLI 仍能识别变更与归档记录。

## 5. 工件语言

所有工件、契约、progress.md、注释性说明默认**简体中文**。代码、命令、schema 关键字保持原样不翻译。

## 6. 命令清单与交付状态

| 命令 | 里程碑 | 状态 |
|------|--------|------|
| /sflow-start | M1 | 已交付（含 status） |
| /sflow-propose | M1 | 已交付 |
| /sflow-contract | M2 | 已交付 |
| /sflow-apply | M2 | 已交付 |
| /sflow-verify | M2 | 已交付 |
| /sflow-debug | M2 | 已交付 |
| /sflow-review | M3 | 已交付（可插拔接 code-cr） |
| /sflow-archive | M3 | 已交付 |

全部 8 条命令均已交付；平台适配（Claude Code 用户级命令）由单一源同步生成。

目标命令不可用（技能文件缺失）时，明确告知用户，不得用通用流程顶替。

## 7. 完成前真实验证（P0 纪律，全命令通用）

任何"完成/通过/没问题"的声明，必须附带本轮真实执行验证链命令并贴出输出；禁止凭经验断言。项目验证链以 workflow.config.md 的 `verification` 为准。

## 8. 阶段报告与下一步提示（P0 纪律，全命令通用）

**每条 `/sflow-*` 命令执行完毕，输出的最后必须是阶段报告**，缺一不可：

```
- 当前阶段：<detected 状态>
- 已完成/阻塞：<已完成的工作，或阻塞原因>
- 下一步：<下一条可执行的 /sflow-* 命令，或等待用户动作>
- 进入条件：<进入下一步所需的人工确认或工件>
```

硬规则：

- "下一步"必须给出**具体命令名**（如 `/sflow-contract`）；该命令不可用时，必须写明原因，禁止含糊。
- 下一步有前置确认（DP）时，必须写明是哪个 DP、等谁批。
- 无下一步（终态 done/abandoned）时，"下一步"写 `none` 并说明原因。
- 报告前的正文可以自由展开，但这四行必须原样出现在输出末尾。

## 9. 可插拔增强（config 外挂）

项目专属能力不进工作流本体，经 workflow.config.md 以技能名外挂，三个挂载点对称：

| 配置节 | 挂载命令 | 作用 | 留空行为 |
|--------|---------|------|---------|
| 规划增强 | /sflow-propose | 写工件前执行增强预检（需求拆解 / 颗粒度 / 边界） | 跳过预检，按命令自身纪律 |
| 测试工具 | /sflow-verify | 验证链通过后执行深度验证（走查 + 依验收标准测试 + 报告） | 仅验证链 + 三维判定 |
| 审查工具 | /sflow-review | 结构化代码审查（如 code-cr） | 询问用户是否跳过 |

规则：值为技能名；技能不可用时明确告知用户，不得静默跳过；快速路径（tweak/hotfix）不经过规划与审查，也不执行深度验证，但验证链不豁免。
