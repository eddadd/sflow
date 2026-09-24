# @eddadd/sflow

sflow 规格驱动 AI 工作流的**安装器**（路线 A）。

sflow 把"先想清楚、再写代码"钉成一条流水线：规划（proposal / specs / design / tasks）→ 执行契约硬门禁 → 按批次实现 → 真实验证 → 审查 → 归档合并主规格。本 CLI 把 8 条 `/sflow-*` 命令一键分发到你的 AI 客户端技能目录。

> 灵感来源：[spec-superflow](https://github.com/)（OpenSpec × superpowers 的融合思路），sflow 是其个人化减配版——4 个人工决策点、强制回退规则、进度台账贯穿全程。

## 安装

```bash
# 无需全局安装，直接使用
npx @eddadd/sflow init

# 或全局安装
npm install -g @eddadd/sflow
sflow init
```

## 支持的目标

| 目标 | 目录 | 命令 |
|------|------|------|
| WorkBuddy（默认） | `~/.workbuddy/skills/` | `sflow init` |
| Claude Code | `~/.claude/skills/` | `sflow init --target claude-code` |
| 当前项目 | `<cwd>/.workbuddy/skills/` | `sflow init --target project` |
| 任意目录 | 自定义路径 | `sflow init --dir <path>` |

## 命令

| 命令 | 说明 |
|------|------|
| `sflow init` | 安装/覆盖 8 条技能；`--config` 额外生成 `workflow.config.md` 模板 |
| `sflow update` | 同 `init`，语义化别名 |
| `sflow list` | 查看各目标的安装状态 |
| `sflow remove` | 卸载已安装的 `sflow-*` 技能 |

## 安装后你会得到什么

8 条技能命令：

```
/sflow-start     入口与状态检测（含恢复中断会话）
/sflow-propose   规划阶段：澄清需求 → 四份工件（DP-1 确认）
/sflow-contract  桥接阶段：生成执行契约（DP-2 批准，唯一硬门禁）
/sflow-apply     执行阶段：按契约批次实现，范围栅栏 + 工件指纹核对
/sflow-debug     调试阶段：四阶段根因分析，3 次失败升级 DP-3
/sflow-verify    验证阶段：真实验证链 + 三维判定
/sflow-review    审查阶段：可插拔接 code-cr 等审查工具
/sflow-archive   归档阶段：delta 合并回主规格（DP-4 确认）
```

加上共享约定 `core.md`（状态机 / 决策点 / 强制回退 / 阶段报告）与项目配置模板 `workflow.config.md`。

## 开始使用

安装后，在你的 AI 客户端中说：

```
/sflow start
```

入口命令会读取项目 `workflow.config.md`、检测工件状态、推荐执行路径，并路由到正确的下一步。

## 许可

MIT
