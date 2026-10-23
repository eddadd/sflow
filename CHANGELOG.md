# 更新日志（Changelog）

> sflow（`@eddadd/sflow`）的版本变更记录。每条含 **版本号 / 日期 / 类型 / 概览**，细节按版本展开。
>
> - **版本号**：语义化版本——补丁 = bug 修复，次版本 = 新增能力，主版本 = 不兼容变更。
> - **日期**：提交入库日期（非发布日期）。
> - **标记**：`未发布` 表示已提交但尚未发布到 npm；发布后补上 tag 与发布日期。

## 速览

| 版本 | 日期 | 类型 | 概览 |
| ---- | ---- | ---- | ---- |
| 0.1.4 | 2026-10-23 | 补丁（**未发布**） | 修复契约指纹自炸、审查路由断链、结构头主张自相矛盾、状态判定双盲；新增状态回执 state.yaml 与提交纪律开关 |
| 0.1.3 | 2026-10-21 | 补丁 | 配置模板单一源同步；补齐内置模板的挂载点/check-only 验证链 |
| 0.1.2 | 2026-10-10 | 补丁 | README 重写为完整工作流说明 |
| 0.1.1 | 2026-09-28 | 次版本 | 可插拔增强体系 + 增强方法论内置；默认目标改名 agents |
| 0.1.0 | 2026-09-24 | 首发 | CLI 安装器 + 8 条 `/sflow-*` 命令 + 共享约定与项目配置 |

---

## 0.1.4 — 2026-10-23 · 补丁（未发布）

**主题：把"机械判定"从话术变成真的会生效的规则。**

修复四个 P0 级问题——它们都属于同一类缺陷：机制写进了文档，但实际执行时不会生效或自相矛盾。

### 修复

- **契约指纹自炸**：`tasks.md` 原本直接做 `git hash-object` 生成指纹，而 `/sflow-apply` 规定每批次完成时要在 `tasks.md` 勾选任务——勾选动作本身改变了哈希，导致第 2 批次起**必然**误判"契约过期"。现改为**先剥离复选框再哈希**（勾选属执行进度，不属规划范围），任务组重排/增删/改写仍会改变哈希。
- **指纹集合不完整**：新增 `contract_hash`（`execution-contract.md`），三指纹改为 `artifacts_hash`（proposal / specs / design）+ `tasks_hash` + `contract_hash`。
- **审查基线缺失**：新增 `review_base`——DP-2 批准时记录 `git rev-parse HEAD`，只写一次，执行阶段不得改写，作为验证一致性与审查范围的共同基线。
- **审查命令是死路由**：状态机原为 7 状态，`verifying` 直接跳 `archiving`，`/sflow-review` 没有任何路由会走到它，而 `/sflow-archive` 又要求"审查无阻塞 Critical"——形成死锁。现补 `reviewing` 与 `debugging`（8 状态），`/sflow-verify` 收口改为指向 `/sflow-review`，`/sflow-archive` 前置要求存在审查结论记录（**没有记录 = 审查未发生**，不得用"验证通过"代替"审查通过"）。
- **状态判定双盲**：改为两层判定——**大阶段看工件内容，阶段内位置看 progress.md 台账末行**（`verifying` 通过后与 `reviewing` 通过后的工件完全相同，只用工件无法区分）。
- **结构头主张自相矛盾**：原规则要求中文结构头并"禁止英文格式"，但 `spec-delta` 模板用的是英文、项目真实主规格又多种格式并存。现改为**跟随主规格**：delta 结构头必须与目标 capability 主规格逐字一致；主规格不存在时用中文标准格式；禁止同一变更内中英混用；已归档文件不得改写（归档只进不出）。"兼容 OpenSpec"的表述同步收窄为**结构兼容**（目录布局 / `.openspec.yaml` / archive 命名兼容，正文格式不兼容）。
- **Coherence 用错证据**：原判定比的是 progress.md 里 AI 自己写的"改动文件清单"，现改为 `git diff --name-only <review_base>..HEAD` 的真实改动。

### 新增

- **提交纪律开关 `git_discipline`（B2，默认 `off`）**：`workflow.config.md` 新增开关，控制 `/sflow-apply` 的批次执行方式。`on` 时每批次必须走 **TDD 红-绿**（先写会失败的测试并贴失败输出 → 最小实现 → 测试转绿并贴通过输出 → `git commit`）、且每批次开始前 `git status --porcelain` 必须无输出（脏工作区拒绝进入）；`off`（默认）时不强制先写测试与提交。**开关不改变底线**：批次回执、验证义务、指纹与锚点核对在两种档位下都照做——`off` 只是不强制提交粒度，不是允许跳过验证。批次 commit 会推进 HEAD，但 `baseline.review_base` 不随批次 commit 改变（仍是 DP-2 批准时的起点 sha）。
- **状态回执 `state.yaml`（B1）**：每个变更目录新增一份 append-only 的机器可读回执文件，与 progress.md 同级，归档时随目录整体移动。它只存两类**不可推导**的事实——**锚点**（`baseline.review_base` 与三组工件指纹，只写一次、重新桥接也不得改写）与**回执**（`dp1.approved` / `dp2.approved` / `batch.N.done` / `verify.passed` / `review.passed` / `debug.attempt.N` / `archive.done`）。**可推导的不存**：大阶段仍由工件内容推断，state.yaml 不写状态枚举——避免"文件说 building、工件说没勾完"这类需要仲裁的矛盾。状态判定的分工因此变为：**大阶段看工件，阶段内位置看回执末条**。存量变更（无 state.yaml）不强制迁移，回退 progress.md 台账末行判定。
- **锚点完整性核对**：`/sflow-apply` 每批次开始前除指纹比对外，新增核对 `baseline.review_base` 未被改写。锚点被改写判为**审计污染**（比契约过期更严重——它是绕过而不是意外），立即停止执行并呈报。
- **调试计数机械化**：DP-3 的"连续 3 次失败"改由 `counters.debug_attempts` 计数（`/sflow-debug` 每次失败 +1，通过或换方向归零），不再靠人眼数台账段落。
- **范围比对排除流程产物**：`git diff` 比对统一排除变更工件目录本身（`:(exclude)openspec/changes/<change-name>`）——工件、progress.md、state.yaml 是流程产物，不是业务改动。
- **路径选择留痕**：快速路径也必须在 `changes_dir` 下建 `quick-<name>/` 目录并写入 `state.yaml` 与 `progress.md`，保证会话中断后状态检测可恢复。
- **/sflow-start 给出单条推荐**：多个活动变更并存时不再只罗列，而是给出单条推荐并说明理由；用户选择非推荐项时在 state.yaml 追加 `override` 回执留痕。
- **`CHANGELOG.md`**：新增版本变更记录（版本号 / 日期 / 类型 / 概览），并回填 0.1.0→0.1.4 全部历史。
- `/sflow-start` 生成 `workflow.config.md` 前增加**验证链真实性预检**：验证链里的每条命令必须逐条真实执行确认存在，禁止把模板默认值（如 `pnpm lint:check`）直接当作项目验证链——未经验证的验证链会让 `/sflow-verify` 跑出假的"通过"。

---

## 0.1.3 — 2026-10-21 · 补丁

- **配置模板单一源同步**：根目录 `templates/workflow.config.template.md` 为唯一母本，`sflow init` 时复制生成到 `<目标>/sflow-start/assets/workflow.config-template.md`，仓库内不再存副本，消除多副本漂移。
- **内置配置模板补齐**：补测试工具挂载点、`dp1_lightweight` 开关、check-only 验证链；修正"审查工具留空"的语义（留空 = 走内置默认审查，不是跳过审查）。
- 文档：修正 README 中的工具名 `glodrapay-test` → `glodrapay-front-test`。

---

## 0.1.2 — 2026-10-10 · 补丁

- **README 重写**为完整工作流说明（必要性 → 设计初衷 → 工作方式 → 安装 → 配置 → 远景）。
- 新增 `.gitignore`，忽略 AI 相关目录与本地临时文件。

---

## 0.1.1 — 2026-09-28 · 次版本

- **可插拔增强体系**：`workflow.config.md` 增加两个挂载点——测试工具、审查工具；**留空不跳过**，自动使用工作流内置默认逻辑（默认深度验证 / 默认代码审查）。
- **增强方法论内置**：spec 增强方法论（三支柱预检）内置进 `/sflow-propose`，随技能分发，不再依赖外部 skill 手动调用。
- **方法论升级至 v1.7**：新增契约与承载预检五类（组件能力 / 接口返回结构 / 粘贴契约 / 未点名控件 / 新建页面要素默认值）与 `hideInMenu` 隐藏路由权限预检。
- **目标客户端收敛**为 6 类（agents / claude / codex / workbuddy / trae / opencode），默认目标由 `agent` 改名 `agents`（`~/.agents/skills/`）。
- **配置模板增加概念速览**：`tweak` / `hotfix` / `full` / `dp1_lightweight` 五个概念开箱即懂。
- 流程文件收口：`tweak` 判定标准与 DP-1 轻量化语义移入流程文件，配置只保留数值。

---

## 0.1.0 — 2026-09-24 · 首发

- **CLI 安装器**（路线 A）：`sflow init / update / list / remove`，把技能文件分发到目标客户端技能目录。
- **8 条 `/sflow-*` 命令**：`start` / `propose` / `contract` / `apply` / `debug` / `verify` / `review` / `archive`。
- **共享约定 `core.md`**：状态机、4 个人工决策点（DP-1~4）、强制回退规则、阶段报告规范。
- **项目配置 `workflow.config.md`**：验证链、测试/审查工具、快速路径边界。

---

<!-- 维护约定：
     1. 每次发版前在本文件顶部"速览"表加一行，并在下方新增该版本小节；
     2. 类型用「补丁 / 次版本 / 主版本」，与前缀区分（fix: / feat: / 破坏性变更）；
     3. 已发布的版本补上 tag（v<版本>）与发布日期，去掉「未发布」标记；
     4. 只写"用户可见的变化"（行为、命令、配置、兼容性），不复制提交列表。 -->
