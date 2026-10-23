# sflow 全局共享约定（所有 /sflow-* 命令执行前加载）

## 1. 状态机（8 状态 + 2 快速路径）

```
exploring ──> specifying ──> bridging ──> building ──> verifying ──> reviewing ──> archiving ──> done
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

状态**阶段**（exploring / specifying / bridging / building / verifying / reviewing / archiving / done）从工件内容推断，不从聊天记忆或文件时间戳推断。

**阶段与阶段内位置分开判**（P0）：工件只能证明"大阶段"，证明不了"阶段内走到哪一步"——`verifying` 通过后与 `reviewing` 通过后的工件完全一样，`building` 中与 `debugging` 中的工件也完全一样。因此：

| 判定对象 | 来源 |
|---------|------|
| 大阶段（上面的 8 个） | 工件内容（四工件是否齐全、契约是否存在、tasks 是否勾完） |
| 阶段内位置（验证是否通过、审查是否通过、调试是否进行中） | progress.md 台账**末行**的性质：末条是"验证记录全绿"→ 待审查；末条是"review：…"→ 待归档；末条是"Attempt n"→ 调试中 |

禁止只用工件推断阶段内位置：`verifying` 工件齐全 ≠ 验证已通过 ≠ 审查已通过，三者必须由台账末行区分。

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

**工件指纹（机械扳机）**：DP-2 批准时生成三个指纹，全部记入 progress.md 的"工件指纹"表：

| 指纹 | 计算对象 | 命令 |
|------|---------|------|
| `artifacts_hash` | proposal.md、specs 下全部 spec.md、design.md | `git hash-object <file>` 逐个 |
| `tasks_hash` | tasks.md，**先剥离复选框再哈希** | `node -e "process.stdout.write(require('fs').readFileSync('tasks.md','utf8').replace(/- \[[ xX]\]/g,'- [ ]'))" \| git hash-object --stdin` |
| `contract_hash` | execution-contract.md | `git hash-object execution-contract.md` |

`tasks_hash` 必须归一化：勾选任务是**执行进度**，不是规划范围（Task completion is execution progress, not planning scope）。直接对 tasks.md 原文做 `git hash-object` 会让"批次完成时勾掉任务"这个规定动作本身改掉指纹，导致第 2 批次起必然误判契约过期。归一化只忽略勾选状态，**任务组重排、任务增删、文字改动仍然改变哈希**（已实测：勾选后哈希不变，重排后哈希改变）。

归一化的命令必须**逐字照用上表**，不得每次会话自行发挥——同一份文件用不同归一化逻辑会算出不同指纹，反而引入新的不确定比对。

`/sflow-apply` 每个批次开始前（含会话中断恢复时）重算三个指纹比对，任一不一致 → 机械判定契约过期，立即停止执行并回 `/sflow-contract`，不得"先做完这批再说"。AI 只负责执行命令与比对字符串，判定是确定性的。

**审查基线（review_base）**：DP-2 批准时同时执行 `git rev-parse HEAD`，把结果记入 progress.md"工件指纹"表的 `review_base` 行。这是审查与范围比对的起点，**只写一次**，后续任何命令不得改写它。`/sflow-verify` 做一致性判定、`/sflow-review` 确定审查范围时都以它为基线。

## 4. 工件目录布局（结构兼容 OpenSpec）

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

**与 OpenSpec CLI 共存（仅结构层面）**：变更目录结构、`.openspec.yaml` 元数据、archive 命名 `archive/<date>-<change-name>/` 均保持与 OpenSpec CLI 兼容；`.openspec.yaml` 随目录创建、随归档移动，任何阶段不得删除，确保 OpenSpec CLI 仍能识别变更与归档记录。

**"结构兼容"不等于"格式兼容"**：sflow 的工件正文使用中文结构头（`## 新增需求` / `### 需求:<名称>` / `#### 场景:<名称>`），与 OpenSpec CLI 解析器要求的英文结构头（`## Requirements` / `### Requirement:` / `#### Scenario:`）**不通用**。sflow 不调用 `openspec validate`，机械校验由 sflow 自己的工件自检承担。**归档合并唯一的硬约束是 delta 标题与主 spec 标题逐字一致**——因此当项目主规格已存在某种结构头时，delta 必须跟随主规格的既有格式，而不是跟随本文件的主张。详见第 10 节。

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

## 9. 可插拔增强（config 外挂 + 内置默认）

规划阶段的质量增强**已内置**进 `/sflow-propose`（`sflow-propose/references/spec-methodology.md`，随技能分发，不经 config）。项目专属的测试与审查能力经 workflow.config.md 以技能名外挂，两个挂载点；**未配置时自动使用内置默认逻辑，审查与深度验证不会被跳过**：

| 配置节 | 挂载命令 | 作用 | 留空（内置默认）行为 |
|--------|---------|------|---------------------|
| 测试工具 | /sflow-verify | 验证链通过后执行深度验证（走查 + 依验收标准测试 + 报告） | 内置默认深度验证：依 tasks.md 验收标准逐条核对——能测的写测试真实执行，只能走查的贴代码位置与依据 |
| 审查工具 | /sflow-review | 结构化代码审查（如 code-cr） | 内置默认审查：按审查范围四维度 + Critical/Important/Minor 三级归类 AI 自查，结论格式与外挂工具一致 |

规则：值为技能名；技能不可用时明确告知用户，不得静默跳过；快速路径（tweak/hotfix）不经过规划与审查，也不执行深度验证，但验证链不豁免。

## 10. spec 结构头格式（跟随主规格，不跟随主张）

spec 的结构头（需求章节标题、需求标题、场景标题）**必须与目标 capability 主规格的既有格式逐字一致**，因为归档合并按标题精确匹配，格式漂移会导致合并失败或产生重复需求。

判定顺序：

1. 目标主规格 `openspec/specs/<capability>/spec.md` **已存在** → 以其既有结构头为准（下文格式表仅作参考，不覆盖现实）；
2. 主规格不存在（本次新建 capability）→ 使用下表的**中文标准格式**；
3. 主规格格式混乱（同一文件内多种结构头混用）→ 先在 DP-1 阶段向用户指出并确认统一口径，不得自行猜测跟随哪一个。

中文标准格式（sflow 默认）：

| 层级 | 格式 | 示例 |
|------|------|------|
| 需求章节头 | `## <变更类型>需求` | `## 新增需求` / `## 修改需求` / `## 移除需求` |
| 需求标题 | `### 需求:<名称>` | `### 需求:余额流水列表筛选` |
| 场景标题 | `#### 场景:<名称>` | `#### 场景:用户填写筛选条件后查询` |
| 场景要点 | `- **当** …` / `- **那么** …` / `- **并且** …` | — |

**禁止**在同一变更内混用中英结构头，**禁止**把 `### Requirement:` / `#### Scenario:` 写进以中文结构头为主规格的项目——那会被归档合并遗漏。历史归档目录（`changes/archive/`）中已存在的英文结构头是历史痕迹，**不要为"统一格式"去改写已归档文件**：归档是审计证据，只进不出。

