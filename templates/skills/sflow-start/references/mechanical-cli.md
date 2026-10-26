# 机械校验 CLI（sflow state / validate / guard）

本文件是 core.md 第 13 节的正文本体。**只由需要跑机械判定的命令加载**：`/sflow-start`（状态与回执校验）、`/sflow-apply`（契约新鲜度）、`/sflow-contract`（指纹生成）。其余命令不必读。

命令随 npm 包分发（`sflow` 二进制），在**项目根目录**执行，**只读、不修改任何文件**。

| 命令 | 作用 | 退出码 |
|------|------|--------|
| `sflow state [<change>] [--json]` | 推导大阶段 + 阶段内位置 + 下一步（读 state.yaml 与工件） | 0 成功；5 无法判定 |
| `sflow validate [<change>] [--json]` | 校验 state.yaml 与工件自洽（伪回执 / 锚点 / 结构头一致性） | 0 通过；4 失败；5 无法判定 |
| `sflow guard [<change>] [--json]` | 契约新鲜度：指纹漂移（过期）与锚点改写（审计污染） | 0 fresh；1 过期；2 污染；3 不适用；5 无法判定 |
| `sflow guard --emit-fingerprints [<change>]` | DP-2 用：输出可直接粘贴进 `dp2.approved` 回执的指纹行 | 0 成功；3 无契约 |

## 规则

- `<change>` 省略时活动变更唯一则自动选中，多个必须显式指定。
- **CLI 不可用**（未安装 / 命令不存在）时，按 core.md 第 3、10、11 节的文字规则手工执行，并在输出中说明「CLI 不可用，已按文字规则判定」——不得静默跳过判定，也不得在 CLI 明确报错时忽略其结论。
- **退出码是机械结论，不得用解释覆盖**：
  - `guard` 返回 1（过期）→ 停止执行并回 `/sflow-contract`；
  - `guard` 返回 2（污染）→ 停止一切执行并呈报（比过期更严重，是绕过而非意外）；
  - `validate` 返回 4 → 逐条读它的 ✗ 输出并停止呈报。
- 二者不受 `git_discipline` 开关影响：开关只控制提交纪律，不控制机械判定。

## 何时调用（一览）

| 命令 | 时机 |
|------|------|
| `/sflow-start` | 状态检测第一步：`sflow validate` 校验回执；`sflow state` 取阶段与下一步 |
| `/sflow-contract` | DP-2 批准时：`sflow guard --emit-fingerprints` 生成 `dp2.approved` 回执行（替代手抄哈希） |
| `/sflow-apply` | 每批次开始前：`sflow guard` 核对契约新鲜度与锚点完整性（退出码 1/2 即停止） |
