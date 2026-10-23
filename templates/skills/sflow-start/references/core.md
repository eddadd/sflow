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
| 阶段内位置（验证是否通过、审查是否通过、调试是否进行中） | `state.yaml` 回执流**末条**（第 11 节）；无 state.yaml 的存量变更回退 progress.md 台账末行：末条"验证记录全绿"→ 待审查；末条"review：…"→ 待归档；末条"Attempt n"→ 调试中 |

禁止只用工件推断阶段内位置：`verifying` 工件齐全 ≠ 验证已通过 ≠ 审查已通过，三者必须由回执末条（存量变更用台账末行）区分。

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

**工件指纹（机械扳机）**：DP-2 批准时生成三个指纹，记入 state.yaml 的 `dp2.approved` 回执（第 11 节；progress.md 不再抄写哈希值）：

| 指纹 | 计算对象 | 命令 |
|------|---------|------|
| `artifacts_hash` | proposal.md、specs 下全部 spec.md、design.md | `git hash-object <file>` 逐个 |
| `tasks_hash` | tasks.md，**先剥离复选框再哈希** | `node -e "process.stdout.write(require('fs').readFileSync('tasks.md','utf8').replace(/- \[[ xX]\]/g,'- [ ]'))" \| git hash-object --stdin` |
| `contract_hash` | execution-contract.md | `git hash-object execution-contract.md` |

`tasks_hash` 必须归一化：勾选任务是**执行进度**，不是规划范围（Task completion is execution progress, not planning scope）。直接对 tasks.md 原文做 `git hash-object` 会让"批次完成时勾掉任务"这个规定动作本身改掉指纹，导致第 2 批次起必然误判契约过期。归一化只忽略勾选状态，**任务组重排、任务增删、文字改动仍然改变哈希**（已实测：勾选后哈希不变，重排后哈希改变）。

归一化的命令必须**逐字照用上表**，不得每次会话自行发挥——同一份文件用不同归一化逻辑会算出不同指纹，反而引入新的不确定比对。

`/sflow-apply` 每个批次开始前（含会话中断恢复时）重算三个指纹比对，任一不一致 → 机械判定契约过期，立即停止执行并回 `/sflow-contract`，不得"先做完这批再说"。AI 只负责执行命令与比对字符串，判定是确定性的。

**审查基线（review_base）**：首次 DP-2 批准时执行 `git rev-parse HEAD`，写入 state.yaml 的 `baseline.review_base` 与首条 `dp2.approved` 回执。这是审查与范围比对的起点，**只写一次**，后续任何命令（含重新桥接）不得改写它。`/sflow-verify` 做一致性判定、`/sflow-review` 确定审查范围时都以它为基线。

## 4. 工件目录布局（结构兼容 OpenSpec）

```
openspec/changes/<change-name>/
├── .openspec.yaml         # OpenSpec CLI 元数据（schema: spec-driven + created），创建变更时同步生成
├── proposal.md            # Why / What Changes / Scope
├── specs/<capability>/spec.md   # delta spec：ADDED/MODIFIED/REMOVED Requirements
├── design.md              # 技术决策
├── tasks.md               # 有序任务清单
├── execution-contract.md  # 桥接产物
├── progress.md            # 执行台账：叙述、命令与真实输出、证据
└── state.yaml             # 状态回执：审查基线 + append-only 事件流（机械可读，第 11 节）

openspec/changes/quick-<name>/     # 快速路径台账（tweak/hotfix 专用，不建四工件）
├── progress.md            # 意图 + 改动清单 + 验证输出
└── state.yaml             # 路径选择回执与验证回执
```

归档后并入 `openspec/changes/archive/<date>-<change-name>/`，delta spec 同步合并回主规格 `openspec/specs/`，防规格腐烂。state.yaml 随目录整体移动，不单独摘除。

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

## 11. 状态回执（state.yaml，机械可读）

**要解决的问题**：工件只能证明大阶段，证明不了阶段内走到哪一步；只看 progress.md 散文，换会话、换模型就可能把"验证过"读成"没验证"，把"审查过"读成"没审查"。

**位置**：`<changes_dir>/<change-name>/state.yaml`，与 progress.md 同级。归档时随变更目录整体移动，不单独摘除、不单独清理。

**最小 schema**（任何命令都可以按此内联创建，不依赖其他技能目录下的模板；完整带注释版见 `sflow-propose/assets/state.yaml`）：

```yaml
schema: sflow-state/v1
change: <目录名>
baseline:
  review_base: null
receipts: []
counters:
  debug_attempts: 0
```

**原则：可推导的不存。** 大阶段由工件推导，**不写进 state.yaml**；state.yaml 只存两类不可推导的事实——**锚点**与**回执**：

| 域 | 内容 | 写入规则 |
|----|------|---------|
| `baseline.review_base` | 首次 DP-2 批准时的 `git rev-parse HEAD` | **只写一次**；重新桥接也不得改写（它标记"本次变更进入执行前的起点"，跨重桥接保持首次值，防止用重桥接洗掉早前的越界改动） |
| `receipts[]` | append-only 事件流 | 只追加，**不得修改、删除、重排已有条目** |
| `counters.debug_attempts` | 连续失败尝试计数 | 由 `debug.attempt.N` 派生；DP-3 按它机械触发 |

**当前指纹 = 最后一条 `dp2.approved` 回执里的 `fingerprints`**（三组：`artifacts` / `tasks` / `contract`）。重新生成契约并再次获得 DP-2 批准时**追加一条新的 `dp2.approved`**，不改写旧条目——旧哈希留在历史里，篡改一眼可见。

**写入时机（每条命令收尾必做；缺回执即视为该步未发生）**：

| 命令 | 追加回执 |
|------|---------|
| /sflow-propose | 创建 state.yaml；DP-1 批准 → `dp1.approved` |
| /sflow-contract | DP-2 批准 → `dp2.approved`（含三组指纹；首次含 `review_base`） |
| /sflow-apply | 每批次完成 → `batch.N.done`（含改动文件、验证义务结果摘要） |
| /sflow-debug | 每次尝试 → `debug.attempt.N`（含假设、结果）；解决 → `debug.resolved` |
| /sflow-verify | `verify.passed` 或 `verify.failed` |
| /sflow-review | `review.passed` 或 `review.blocked`（含 Critical/Important/Minor 计数） |
| /sflow-archive | `archive.done`（合并主规格后、移动目录前写入，随目录一起归档） |
| /sflow-start | 路径选择 → `path.selected`（full / tweak / hotfix）；用户选择非推荐路径时追加 `override`（含推荐项、实际选择、理由）；仅查询状态时不写 |

**回执格式**（单行 flow mapping，便于机械解析；`at` 取系统当前时间，不得编造）：

```yaml
- { at: 2026-10-23T14:03:00+08:00, cmd: /sflow-contract, event: dp2.approved, review_base: 9f2c1ab, fingerprints: { artifacts: {...}, tasks: <sha>, contract: <sha> } }
```

**读法：阶段内位置 = 回执流最后一条**（不再靠解读散文）：

| 末条回执 | 阶段内位置 | 下一步 |
|---------|-----------|--------|
| `dp2.approved` / `batch.N.done`（tasks 未勾完） | building | `/sflow-apply` |
| `debug.attempt.N`（其后无 `debug.resolved`） | debugging | 继续调试，或按 DP-3 呈报 |
| `verify.failed` | debugging（验证失败） | `/sflow-debug` |
| `verify.passed` | reviewing | `/sflow-review` |
| `review.blocked` | building（修复） | `/sflow-apply` 或 `/sflow-debug` |
| `review.passed` | archiving | `/sflow-archive` |
| `archive.done` | done | `none` |

**冲突处理（不许猜、不许自动修）**：

- 工件与回执矛盾（如 tasks 未勾完却存在 `verify.passed`）→ 伪回执，停止并呈报。
- `state.yaml` 的 `change` 与所在目录名不一致 → 停止并呈报。
- 首次 `dp2.approved` 缺 `review_base` → 回执不完整，停止并呈报。
- 锚点或历史回执被改写 → **审计污染**（比契约过期更严重：它是绕过，不是意外），停止一切执行并呈报。
- 没有 state.yaml → 回落旧逻辑（工件 + progress.md 台账末行），**不强制迁移存量变更**；该变更下次被命令触碰时补建并写首条回执。

**范围比对必须排除流程产物**：`state.yaml`、`progress.md`、四工件、契约都在变更目录内，会出现在 `git diff` 里但不是业务改动。比对命令必须排除变更目录本身：

```bash
git diff --name-only <review_base>..HEAD -- . ':(exclude)openspec/changes/<change-name>'
```

**职责分离**：state.yaml 存"发生了什么"（机器可读事实），progress.md 存"怎么发生的"（命令、真实输出、证据、叙述）。**禁止**在 progress.md 再抄一份指纹表或状态枚举——双写必然漂移。范围判定只认 `git diff`。

