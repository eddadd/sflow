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
const stateCli = require('./sflow-state');

const VERSION = '0.2.1';
const PKG_NAME = '@eddadd/sflow';
const SKILL_PREFIX = 'sflow-';
// 安装清单：记录该目录写入的版本与技能列表，用于下次 init 播报「旧版 → 新版」
const MANIFEST = '.sflow-install.json';
// 由 init 运行时生成、不属于模板分发的产物：孤儿清理时保留，随后由单一源同步覆盖
const GENERATED_FILES = { 'sflow-start': ['assets/workflow.config-template.md'] };

// 技能源目录（随 npm 包分发）
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'skills');
const CONFIG_TEMPLATE = path.join(__dirname, '..', 'templates', 'workflow.config.template.md');

// 目标客户端 → 技能目录映射（路径规则：~/.<target>/skills/，例外见下）
// 不再把某个客户端当"默认目标"：init 无参时探测机器上已装过的目录并全部同步，
// 一处都没有时才回落到 DEFAULT_TARGET 做首次安装。
const TARGETS = {
  agents: () => path.join(os.homedir(), '.agents', 'skills'),
  claude: () => path.join(os.homedir(), '.claude', 'skills'),
  codex: () => path.join(os.homedir(), '.codex', 'skills'),
  workbuddy: () => path.join(os.homedir(), '.workbuddy', 'skills'),
  trae: () => path.join(os.homedir(), '.trae-cn', 'skills'),
  opencode: () => path.join(os.homedir(), '.config', 'skills'),
};
const DEFAULT_TARGET = 'agents';

/** @returns {string[]} 技能目录名列表 */
const listTemplateSkills = () =>
  fs
    .readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith(SKILL_PREFIX))
    .map((d) => d.name);

/**
 * @function 判断某目录是否已有 sflow-* 安装（至少一条技能目录存在）
 * @param {string} dest 候选目录
 * @return {boolean} 是否已安装
 */
const isInstalledDir = (dest) =>
  fs.existsSync(dest) && listTemplateSkills().some((s) => fs.existsSync(path.join(dest, s)));

/**
 * @function 解析本次要同步的目标目录集合
 *   优先级：--dir > --target > --all > 探测已装目录（一处都没有则回落 DEFAULT_TARGET）
 * @param {Object} opts 命令行选项
 * @param {string} [opts.target] 目标客户端名
 * @param {string} [opts.dir] 自定义目录（绝对或相对路径）
 * @param {boolean} [opts.all] 强制覆盖全部目标客户端
 * @return {{key:string, dest:string, installed:boolean}[]} 目标目录集合
 */
const resolveDests = (opts) => {
  const build = (key) => {
    const dest = TARGETS[key]();
    return { key, dest, installed: isInstalledDir(dest) };
  };
  if (opts.dir) {
    const dest = path.resolve(opts.dir);
    return [{ key: '自定义目录', dest, installed: isInstalledDir(dest) }];
  }
  if (opts.target) {
    if (!TARGETS[opts.target]) {
      console.error(`未知目标：${opts.target}（可选：${Object.keys(TARGETS).join(' | ')}，或用 --dir 指定目录）`);
      process.exit(1);
    }
    return [build(opts.target)];
  }
  const all = Object.keys(TARGETS).map(build);
  if (opts.all) return all;
  const detected = all.filter((t) => t.installed);
  return detected.length ? detected : [build(DEFAULT_TARGET)];
};

/**
 * @function 读取目标目录的安装清单
 * @param {string} dest 目标目录
 * @return {Object|null} 清单对象；不存在或损坏时返回 null
 */
const readManifest = (dest) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dest, MANIFEST), 'utf8'));
  } catch {
    return null;
  }
};

/**
 * @function 写入安装清单
 * @param {string} dest 目标目录
 * @param {string[]} skills 本次写入的技能目录名
 * @return {void}
 */
const writeManifest = (dest, skills) => {
  const body = { name: PKG_NAME, version: VERSION, installedAt: new Date().toISOString(), skills };
  fs.writeFileSync(path.join(dest, MANIFEST), `${JSON.stringify(body, null, 2)}\n`);
};

/**
 * @function 旧版本描述：有清单读清单，无清单的历史安装标记为未知
 * @param {string} dest 目标目录
 * @return {string|null} 形如 v0.1.3 的版本描述；从未安装返回 null
 */
const describeInstalledVersion = (dest) => {
  const manifest = readManifest(dest);
  if (manifest && manifest.version) return `v${manifest.version}`;
  return isInstalledDir(dest) ? '未知（旧版无清单）' : null;
};

/**
 * @function 删除目标技能目录中源模板已不存在的文件（只叠加会导致废弃文件永久残留）
 *   注意：init 生成物（如 sflow-start/assets/）在源模板里不存在，必须整棵树跳过，
 *   否则会在重建前被误删——`keep` 同时按"等值/祖先/后代"三向匹配。
 * @param {string} src 源模板目录
 * @param {string} dest 目标技能目录
 * @param {Set<string>} keep 需保留的相对路径（init 生成物）
 * @param {string} [prefix] 递归时的相对路径前缀
 * @return {string[]} 被删除的相对路径
 */
const pruneOrphans = (src, dest, keep, prefix = '') => {
  if (!fs.existsSync(dest)) return [];
  const isKeep = (rel) => [...keep].some((k) => k === rel || k.startsWith(`${rel}/`) || rel.startsWith(`${k}/`));
  const removed = [];
  for (const entry of fs.readdirSync(dest, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (!fs.existsSync(s)) {
      if (isKeep(rel)) continue;
      fs.rmSync(d, { recursive: true, force: true });
      removed.push(rel);
    } else if (entry.isDirectory()) {
      removed.push(...pruneOrphans(s, d, keep, rel));
    }
  }
  return removed;
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
  sflow init    [--target <name> | --dir <path> | --all] [--config]   安装/覆盖 8 条技能
  sflow update  [--target <name> | --dir <path> | --all]              同 init（语义化别名）
  sflow list                                                          查看各目标版本与状态
  sflow remove  [--target <name> | --dir <path> | --all]              卸载已安装的 sflow-* 技能

目标解析（init / update / remove 通用）：
  不带 --target / --dir 时，自动探测本机已安装 sflow-* 的客户端目录并全部同步；
  一处都没有才装到默认目标 agents。加 --all 强制写入全部 6 个目标目录。
  每次安装会写 .sflow-install.json 清单，下次 init 据此播报「旧版本 → 新版本」。

机械校验（B3，在项目根执行；只读，不修改任何文件）：
  sflow state    [<change>] [--json] [--cwd <path>]           推导当前阶段与下一步（读 state.yaml + 工件）
  sflow validate [<change>] [--json] [--cwd <path>]           校验 state.yaml 与工件自洽（伪回执 / 锚点 / 结构头）
  sflow guard    [<change>] [--json] [--cwd <path>]           机械判契约过期（指纹漂移）与审计污染（锚点改写）
  sflow guard --emit-fingerprints [<change>]                   DP-2 用：输出可直接粘贴进 dp2.approved 的指纹行

  <change> 省略时：活动变更唯一则自动选中，多个则要求指定
  退出码：guard 0=fresh 1=过期 2=污染 3=不适用 5=无法判定；validate 0=通过 4=失败 5=无法判定

  sflow --help / -h                                           本帮助
  sflow --version / -v                                        版本号

目标（--target）：
  agents        ~/.agents/skills/
  claude        ~/.claude/skills/
  codex         ~/.codex/skills/
  workbuddy     ~/.workbuddy/skills/
  trae          ~/.trae-cn/skills/
  opencode      ~/.config/skills/
  或用 --dir <path> 指定任意技能目录

选项：
  --all        init / remove：不做探测，直接作用于全部 6 个目标目录
  --config     init 时把 workflow.config.template.md 复制为当前目录 workflow.config.md（已存在则跳过）
  --force      配合 --config 使用时覆盖已存在的 workflow.config.md
  --json       state / validate / guard：以 JSON 输出（便于脚本消费）
  --cwd <path> state / validate / guard：指定项目根目录（默认当前目录）
`;

/** @returns {Object} 解析后的命令与选项 */
const parseArgs = (argv) => {
  const opts = { target: undefined, dir: undefined, config: false, force: false, all: false, json: false, cwd: undefined, _: [] };
  let cmd = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target') opts.target = argv[++i];
    else if (a === '--dir') opts.dir = argv[++i];
    else if (a === '--config') opts.config = true;
    else if (a === '--force') opts.force = true;
    else if (a === '--all') opts.all = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--emit-fingerprints' || a === '--emit') opts.emit = true;
    else if (a === '--cwd') opts.cwd = argv[++i];
    else if (a === '--help' || a === '-h') cmd = 'help';
    else if (a === '--version' || a === '-v') cmd = 'version';
    else if (!a.startsWith('-')) {
      if (cmd === '') cmd = a;
      else opts._.push(a);
    }
  }
  return { cmd, opts };
};

/**
 * @function 把模板技能同步到单个目标目录：清理残留 → 覆盖复制 → 单一源同步 → 写清单
 * @param {string} dest 目标目录
 * @param {string[]} skills 技能目录名列表
 * @param {boolean} verbose 是否逐条打印技能
 * @return {string[]} 本次清理掉的残留相对路径
 */
const syncTarget = (dest, skills, verbose) => {
  fs.mkdirSync(dest, { recursive: true });
  const pruned = [];
  for (const name of skills) {
    const src = path.join(TEMPLATES_DIR, name);
    const dst = path.join(dest, name);
    pruned.push(...pruneOrphans(src, dst, new Set(GENERATED_FILES[name] || [])));
    copyDir(src, dst);
    if (verbose) console.log(`  ✔ ${name}`);
  }

  // 单一源同步：sflow-start 的内置配置模板以根模板为唯一母本，安装时生成，
  // 避免仓库内双副本各自维护导致漂移（历史上曾因此出现旧版模板被分发的事故）。
  const assetPath = path.join(dest, 'sflow-start', 'assets', 'workflow.config-template.md');
  if (fs.existsSync(CONFIG_TEMPLATE)) {
    fs.mkdirSync(path.dirname(assetPath), { recursive: true });
    fs.copyFileSync(CONFIG_TEMPLATE, assetPath);
    if (verbose) console.log('  ✔ sflow-start/assets/workflow.config-template.md ← 根模板同步');
  } else {
    console.log('  - 未找到 workflow.config.template.md，跳过 sflow-start 模板同步');
  }

  writeManifest(dest, skills);
  return pruned;
};

/**
 * @function 执行安装
 * @param {Object} opts 命令行选项
 * @return {void}
 */
const runInit = (opts) => {
  const dests = resolveDests(opts);
  const skills = listTemplateSkills();
  const verbose = dests.length === 1;
  let failed = 0;

  for (const t of dests) {
    const before = describeInstalledVersion(t.dest);
    if (!verbose) console.log('');
    console.log(`目标：${t.key}  ${t.dest}`);
    try {
      const pruned = syncTarget(t.dest, skills, verbose);
      if (pruned.length) console.log(`  - 清理残留 ${pruned.length} 项：${pruned.join(', ')}`);
      console.log(`  版本：${before || '未安装'} → v${VERSION}（${skills.length} 条技能）`);
    } catch (err) {
      failed++;
      console.error(`  ✗ 同步失败：${err.message}`);
    }
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

  if (failed) {
    console.error(`\n完成：${dests.length - failed} 个目标成功，${failed} 个失败。`);
    process.exit(1);
  }
  const where = dests.map((t) => t.key).join('、');
  console.log(`\n完成：${skills.length} 条技能已同步到 ${dests.length} 个目标（${where}）。`);
  console.log('下一步：在客户端中运行 /sflow-start 开始工作流。');
};

/**
 * @function 执行卸载
 * @param {Object} opts 命令行选项
 * @return {void}
 */
const runRemove = (opts) => {
  const dests = resolveDests(opts).filter((t) => t.installed);
  const skills = listTemplateSkills();
  if (!dests.length) {
    console.log('没有检测到任何 sflow 技能安装，无需卸载。');
    return;
  }
  let removed = 0;
  for (const t of dests) {
    console.log(`目标：${t.key}  ${t.dest}`);
    let targetRemoved = 0;
    for (const name of skills) {
      const dir = path.join(t.dest, name);
      if (!fs.existsSync(dir)) continue;
      fs.rmSync(dir, { recursive: true, force: true });
      targetRemoved++;
    }
    removed += targetRemoved;
    fs.rmSync(path.join(t.dest, MANIFEST), { force: true });
    console.log(`  - 已移除 ${targetRemoved} 条技能与安装清单`);
  }
  console.log(`\n完成：共移除 ${removed} 个技能目录（${dests.length} 个目标）。`);
};

/**
 * @function 计算字符串的显示宽度（CJK 全角字符按 2 列计，用于终端对齐）
 * @param {string} str 待测字符串
 * @return {number} 显示宽度
 */
const dispWidth = (str) =>
  [...str].reduce(
    (n, ch) => n + (/[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1),
    0
  );

/**
 * @function 按显示宽度右补空格
 * @param {string} str 原字符串
 * @param {number} width 目标显示宽度
 * @return {string} 补齐后的字符串
 */
const padDisp = (str, width) => str + ' '.repeat(Math.max(1, width - dispWidth(str)));

/**
 * @function 列出各目标安装状态（版本 / 完整度 / 是否最新）
 * @return {void}
 */
const runList = () => {
  const skills = listTemplateSkills();
  console.log(`${padDisp('目标', 10)}${padDisp('版本', 22)}${padDisp('技能', 8)}状态`);
  for (const [name, fn] of Object.entries(TARGETS)) {
    const dest = fn();
    const installed = skills.filter((s) => fs.existsSync(path.join(dest, s)));
    const manifest = readManifest(dest);
    const version = manifest && manifest.version ? `v${manifest.version}` : installed.length ? '未知（旧版无清单）' : '—';
    let state;
    if (!installed.length) state = '未安装';
    else if (installed.length < skills.length) state = `不完整（缺 ${skills.length - installed.length}）`;
    else if (manifest && manifest.version === VERSION) state = '✓ 最新';
    else state = '需更新（sflow init）';
    console.log(`${padDisp(name, 10)}${padDisp(version, 22)}${padDisp(`${installed.length}/${skills.length}`, 8)}${state}`);
    console.log(`${' '.repeat(10)}${dest}`);
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
  case 'state':
  case 'validate':
  case 'guard': {
    // 统一把"停机呈报"变成干净的一行结论，而不是抛栈——判定失败是正常结果，
    // 不是程序崩溃；退出码承载机器可读的结论。
    const run = { state: stateCli.runState, validate: stateCli.runValidate, guard: stateCli.runGuard }[cmd];
    try {
      process.exit(run(opts));
    } catch (err) {
      if (opts.json) console.log(JSON.stringify({ ok: false, error: err.message }, null, 2));
      else console.log(`✗ ${cmd} 无法判定：${err.message}`);
      process.exit(5);
    }
  }
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
