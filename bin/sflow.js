#!/usr/bin/env node
/**
 * @eddadd/sflow CLI — sflow 规格驱动工作流的安装器
 *
 * 路线 A：CLI 只负责把 8 条 /sflow-* 技能分发到目标客户端目录，
 * 并提供 update / remove / list 维护能力。工作流本体见各技能 SKILL.md。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const VERSION = '0.1.0';
const PKG_NAME = '@eddadd/sflow';
const SKILL_PREFIX = 'sflow-';

// 技能源目录（随 npm 包分发）
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'skills');
const CONFIG_TEMPLATE = path.join(__dirname, '..', 'templates', 'workflow.config.template.md');

// 目标客户端 → 技能目录映射（默认 agent；路径规则：~/.<target>/skills/，例外见下）
const TARGETS = {
  agent: () => path.join(os.homedir(), '.agent', 'skills'),
  claude: () => path.join(os.homedir(), '.claude', 'skills'),
  codex: () => path.join(os.homedir(), '.codex', 'skills'),
  workbuddy: () => path.join(os.homedir(), '.workbuddy', 'skills'),
  trae: () => path.join(os.homedir(), '.trae-cn', 'skills'),
  opencode: () => path.join(os.homedir(), '.config', 'skills'),
};
const DEFAULT_TARGET = 'agent';

/** @returns {string[]} 技能目录名列表 */
const listTemplateSkills = () =>
  fs
    .readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith(SKILL_PREFIX))
    .map((d) => d.name);

/**
 * @function 解析目标目录：--dir 优先，其次 --target，默认 agent
 * @param {Object} opts 命令行选项
 * @param {string} [opts.target] 目标客户端名
 * @param {string} [opts.dir] 自定义目录（绝对或相对路径）
 * @return {string} 目标技能目录绝对路径
 */
const resolveDest = (opts) => {
  if (opts.dir) return path.resolve(opts.dir);
  const key = opts.target || DEFAULT_TARGET;
  const fn = TARGETS[key];
  if (!fn) {
    console.error(`未知目标：${key}（可选：${Object.keys(TARGETS).join(' | ')}，或用 --dir 指定目录）`);
    process.exit(1);
  }
  return fn();
};

/**
 * @function 递归复制目录
 * @param {string} src 源目录
 * @param {string} dest 目标目录
 * @return {void}
 */
const copyDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
};

/** @returns {string} 帮助文本 */
const helpText = () => `
sflow CLI（${PKG_NAME}）v${VERSION} — 规格驱动 AI 工作流安装器

用法：
  sflow init    [--target <name>] [--dir <path>] [--config]   安装/覆盖 8 条技能
  sflow update  [--target <name>] [--dir <path>]              同 init（语义化别名）
  sflow list                                                 查看各目标安装状态
  sflow remove  [--target <name>] [--dir <path>]             卸载已安装的 sflow-* 技能
  sflow --help / -h                                           本帮助
  sflow --version / -v                                        版本号

目标（--target，默认 agent）：
  agent         ~/.agent/skills/
  claude        ~/.claude/skills/
  codex         ~/.codex/skills/
  workbuddy     ~/.workbuddy/skills/
  trae          ~/.trae-cn/skills/
  opencode      ~/.config/skills/
  或用 --dir <path> 指定任意技能目录

选项：
  --config     init 时把 workflow.config.template.md 复制为当前目录 workflow.config.md（已存在则跳过）
  --force      配合 --config 使用时覆盖已存在的 workflow.config.md
`;

/** @returns {Object} 解析后的命令与选项 */
const parseArgs = (argv) => {
  const opts = { target: undefined, dir: undefined, config: false, force: false };
  let cmd = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target') opts.target = argv[++i];
    else if (a === '--dir') opts.dir = argv[++i];
    else if (a === '--config') opts.config = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--help' || a === '-h') cmd = 'help';
    else if (a === '--version' || a === '-v') cmd = 'version';
    else if (!a.startsWith('-')) cmd = a;
  }
  return { cmd, opts };
};

/**
 * @function 执行安装
 * @param {Object} opts 命令行选项
 * @return {void}
 */
const runInit = (opts) => {
  const dest = resolveDest(opts);
  const skills = listTemplateSkills();
  fs.mkdirSync(dest, { recursive: true });
  for (const name of skills) {
    copyDir(path.join(TEMPLATES_DIR, name), path.join(dest, name));
    console.log(`  ✔ ${name} → ${path.join(dest, name)}`);
  }

  if (opts.config) {
    const cfg = path.join(process.cwd(), 'workflow.config.md');
    if (fs.existsSync(cfg) && !opts.force) {
      console.log('  - workflow.config.md 已存在，跳过（--force 可覆盖）');
    } else if (fs.existsSync(CONFIG_TEMPLATE)) {
      fs.copyFileSync(CONFIG_TEMPLATE, cfg);
      console.log(`  ✔ workflow.config.md → ${cfg}`);
    } else {
      console.log('  - 未找到 workflow.config.template.md，跳过配置生成');
    }
  }

  console.log(`\n完成：${skills.length} 条技能已安装到 ${dest}`);
  console.log('下一步：在客户端中运行 /sflow-start 开始工作流。');
};

/**
 * @function 执行卸载
 * @param {Object} opts 命令行选项
 * @return {void}
 */
const runRemove = (opts) => {
  const dest = resolveDest(opts);
  const skills = listTemplateSkills();
  let removed = 0;
  for (const name of skills) {
    const dir = path.join(dest, name);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`  - 已删除 ${dir}`);
      removed++;
    }
  }
  console.log(`\n完成：共移除 ${removed} 个技能目录。`);
};

/**
 * @function 列出各目标安装状态
 * @return {void}
 */
const runList = () => {
  for (const [name, fn] of Object.entries(TARGETS)) {
    const dest = fn();
    const installed = listTemplateSkills().filter((s) => fs.existsSync(path.join(dest, s)));
    console.log(`${name.padEnd(12)} ${dest}`);
    console.log(`${''.padEnd(12)} 已安装 ${installed.length}/8：${installed.join(', ') || '无'}`);
  }
};

// ── 入口 ──
const { cmd, opts } = parseArgs(process.argv.slice(2));

switch (cmd) {
  case 'init':
  case 'update':
    runInit(opts);
    break;
  case 'remove':
    runRemove(opts);
    break;
  case 'list':
    runList();
    break;
  case 'help':
    console.log(helpText());
    break;
  case 'version':
    console.log(VERSION);
    break;
  default:
    console.log(helpText());
    process.exit(cmd ? 1 : 0);
}
