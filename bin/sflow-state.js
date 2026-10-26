#!/usr/bin/env node
/**
 * @eddadd/sflow — B3：机械校验与门禁（state / validate / guard）
 *
 * 把 core.md 里"机械判定"的文案变成可执行命令：指纹比对、锚点核对、状态推导、
 * 结构头一致性由程序算，不由 AI 眼判——换会话、换模型都不会走样。
 *
 * 设计约束：
 * - 只读：任何子命令都不修改项目文件（判定可以自动化，改动永远由人/AI 显式执行）。
 * - 极简 YAML 子集：只认 sflow 自己写出的 state.yaml 形态；遇到不认识的写法**抛错**，
 *   绝不静默误解析——宁可停机呈报，也不给假结论。
 * - 与 core.md 第 3 / 10 / 11 节逐条对应。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const STATE_SCHEMA = 'sflow-state/v1';

// ── 极简 YAML 子集解析 ──────────────────────────────────────────

/** 剥离行内注释（尊重引号；仅当 '#' 前是空白时视为注释起点） */
const stripInlineComment = (s) => {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '#' && i > 0 && /\s/.test(s[i - 1])) return s.slice(0, i);
  }
  return s;
};

/** 按顶层分隔符切分（跳过引号内与嵌套 {} [] 内部） */
const splitTop = (s, sep) => {
  const out = [];
  let depth = 0;
  let cur = '';
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '{' || c === '[') { depth++; cur += c; continue; }
    if (c === '}' || c === ']') { depth--; cur += c; continue; }
    if (c === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter((x) => x.length > 0);
};

/** 顶层第一个 ':' 的位置 */
const topColon = (s) => {
  let depth = 0;
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === ':' && depth === 0) return i;
  }
  return -1;
};

const parseValue = (raw) => {
  const v = raw.trim();
  if (v === '' || v === 'null' || v === '~') return null;
  if (v.startsWith('{')) {
    if (!v.endsWith('}')) throw new Error(`flow mapping 未闭合：${v}`);
    const obj = {};
    for (const part of splitTop(v.slice(1, -1), ',')) {
      const i = topColon(part);
      if (i < 0) throw new Error(`flow mapping 里出现无法解析的项：${part}`);
      obj[part.slice(0, i).trim().replace(/^["']|["']$/g, '')] = parseValue(part.slice(i + 1));
    }
    return obj;
  }
  if (v.startsWith('[')) {
    if (!v.endsWith(']')) throw new Error(`flow sequence 未闭合：${v}`);
    return splitTop(v.slice(1, -1), ',').map(parseValue);
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v === 'true') return true;
  if (v === 'false') return false;
  // 仅短整数字面量才转数字：哈希是全十六进制（可能全为数字且长 40 位），
  // 若被 Number 强转会丢精度并变成 falsy，进而误报"锚点缺失"。
  if (/^-?\d{1,15}$/.test(v)) return Number(v);
  return v;
};

/**
 * @function 解析 state.yaml（sflow 自己写出的受限 YAML 子集）
 * @param {string} text 文件全文
 * @return {Object} 解析结果
 */
const parseStateYaml = (text) => {
  const lines = text.split(/\r?\n/);
  const indentOf = (l) => l.match(/^ */)[0].length;
  const root = {};
  let i = 0;
  while (i < lines.length) {
    const line = stripInlineComment(lines[i]);
    if (/^\s*(#|$)/.test(line)) { i++; continue; }
    if (indentOf(line) !== 0) throw new Error(`顶层出现意外缩进（第 ${i + 1} 行）：${line.trim()}`);
    const m = line.match(/^([^\s:]+):\s*(.*)$/);
    if (!m) throw new Error(`无法解析（第 ${i + 1} 行）：${line.trim()}`);
    const key = m[1];
    const rest = m[2].trim();
    i++;
    if (rest !== '') { root[key] = parseValue(rest); continue; }
    const block = [];
    while (i < lines.length) {
      const l = stripInlineComment(lines[i]);
      if (/^\s*(#|$)/.test(l)) { i++; continue; }
      if (indentOf(l) <= 0) break;
      block.push(l);
      i++;
    }
    if (block.length === 0) { root[key] = null; continue; }
    if (/^\s*-(\s|$)/.test(block[0])) {
      root[key] = block.map((b) => parseValue(b.replace(/^\s*-\s?/, '').trim()));
    } else {
      const obj = {};
      for (const b of block) {
        const mm = b.trim().match(/^([^\s:]+):\s*(.*)$/);
        if (!mm) throw new Error(`块映射里出现无法解析的项：${b.trim()}`);
        obj[mm[1]] = parseValue(mm[2]);
      }
      root[key] = obj;
    }
  }
  return root;
};

// ── 哈希（与 git hash-object 逐字节等价） ────────────────────────

/** git blob 哈希：sha1("blob <字节数>\0" + 内容) */
const gitBlobHash = (buf) =>
  crypto.createHash('sha1').update(`blob ${buf.length}\0`, 'utf8').update(buf).digest('hex');

const hashFile = (p) => gitBlobHash(fs.readFileSync(p));

/** tasks.md 归一化哈希：先剥离复选框（勾选属执行进度，不属规划范围）再哈希 */
const hashTasksNormalized = (p) =>
  gitBlobHash(Buffer.from(fs.readFileSync(p, 'utf8').replace(/- \[[ xX]\]/g, '- [ ]'), 'utf8'));

// ── 变更目录发现 ────────────────────────────────────────────────

const relOf = (root, p) => path.relative(root, p).replaceAll('\\', '/');

/** 读 workflow.config.md 的「变更工件目录」；缺省 openspec/changes */
const readChangesDir = (projectRoot) => {
  const cfg = path.join(projectRoot, 'workflow.config.md');
  if (!fs.existsSync(cfg)) return 'openspec/changes';
  const lines = fs.readFileSync(cfg, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s*变更工件目录/.test(lines[i])) {
      for (let j = i + 1; j < lines.length && j < i + 6; j++) {
        const t = lines[j].trim();
        if (!t || t.startsWith('#') || t.startsWith('>')) continue;
        return t;
      }
    }
  }
  return 'openspec/changes';
};

/** 定位目标变更目录：给定名字，或活动变更唯一时自动选中 */
const collectChange = (projectRoot, name) => {
  const changesRel = readChangesDir(projectRoot);
  const base = path.join(projectRoot, changesRel);
  if (!fs.existsSync(base)) throw new Error(`变更目录不存在：${changesRel}（项目根：${projectRoot}）`);
  const names = fs
    .readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'archive')
    .map((d) => d.name);
  let target = name;
  if (!target) {
    if (names.length === 1) target = names[0];
    else if (names.length === 0) throw new Error(`${changesRel} 下没有活动变更`);
    else throw new Error(`有多个活动变更，请指定其一：${names.join(', ')}`);
  }
  const dir = path.join(base, target);
  if (!fs.existsSync(dir)) throw new Error(`变更目录不存在：${changesRel}/${target}`);
  return { changesRel, base, name: target, dir };
};

const walkSpecFiles = (specsDir) => {
  if (!fs.existsSync(specsDir)) return [];
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'spec.md') out.push(p);
    }
  };
  walk(specsDir);
  return out;
};

const inspectArtifacts = (dir) => ({
  proposal: fs.existsSync(path.join(dir, 'proposal.md')),
  design: fs.existsSync(path.join(dir, 'design.md')),
  tasks: fs.existsSync(path.join(dir, 'tasks.md')),
  contract: fs.existsSync(path.join(dir, 'execution-contract.md')),
  openspecYaml: fs.existsSync(path.join(dir, '.openspec.yaml')),
  specs: walkSpecFiles(path.join(dir, 'specs')).map((p) => relOf(dir, p)),
});

const readState = (dir) => {
  const p = path.join(dir, 'state.yaml');
  if (!fs.existsSync(p)) return { path: p, exists: false, data: null };
  return { path: p, exists: true, data: parseStateYaml(fs.readFileSync(p, 'utf8')) };
};

const countTasks = (md) => ({
  total: (md.match(/^\s*-\s*\[[ xX]\]/gm) || []).length,
  done: (md.match(/^\s*-\s*\[[xX]\]/gm) || []).length,
});

const getReceipts = (state) => (state.exists && Array.isArray(state.data.receipts) ? state.data.receipts : []);
const lastReceipt = (receipts) => (receipts.length ? receipts[receipts.length - 1] : null);
const eventName = (r) => (r && typeof r === 'object' ? r.event : null);

// ── 结构头风格（core.md 第 10 节） ──────────────────────────────

/** 判定一份 spec 的结构头语言风格：zh / en / mixed / null（无） */
const headerStyleOf = (md) => {
  const lang = (lines, zhRe, enRe) => {
    let zh = 0;
    let en = 0;
    for (const l of lines) {
      if (zhRe.test(l)) zh++;
      else if (enRe.test(l)) en++;
    }
    if (zh && en) return 'mixed';
    if (zh) return 'zh';
    if (en) return 'en';
    return null;
  };
  return {
    chapter: lang(md.match(/^##\s+.*$/gm) || [], /^##\s*((新增|修改|移除)需求|需求)/, /^##\s*(ADDED|MODIFIED|REMOVED)\s+Requirements/),
    req: lang(md.match(/^###\s+.*$/gm) || [], /^###\s*需求[:：]/, /^###\s*Requirement[:：]?/),
    scenario: lang(md.match(/^####\s+.*$/gm) || [], /^####\s*场景[:：]/, /^####\s*Scenario[:：]?/),
  };
};

/** delta 结构头必须与目标主规格逐字一致（主规格不存在时不检查） */
const checkSpecHeaders = (projectRoot, change) => {
  const issues = [];
  for (const sp of change.artifacts.specs) {
    const cap = path.basename(path.dirname(sp));
    const main = path.join(projectRoot, 'openspec', 'specs', cap, 'spec.md');
    if (!fs.existsSync(main)) continue;
    const d = headerStyleOf(fs.readFileSync(path.join(change.dir, sp), 'utf8'));
    const m = headerStyleOf(fs.readFileSync(main, 'utf8'));
    if ([d.chapter, d.req, d.scenario].includes('mixed')) {
      issues.push(`capability ${cap}：delta 内部结构头中英混用（同一文件内不得混用）`);
    }
    for (const [k, label] of [['req', '需求标题'], ['scenario', '场景标题']]) {
      if (d[k] && m[k] && d[k] !== 'mixed' && m[k] !== 'mixed' && d[k] !== m[k]) {
        issues.push(`capability ${cap}：delta 的${label}为 ${d[k]} 风格、主 spec 为 ${m[k]} 风格（归档按标题精确匹配，须逐字一致）`);
      }
    }
  }
  return issues;
};

// ── 指纹计算（guard 与 DP-2 生成共用；只读） ────────────────────

/**
 * @function 计算变更的三组指纹（与 core.md 第 3 节逐条对应）
 * @param {Object} change collectChange 的结果（需已填 artifacts）
 * @return {{artifacts: Object<string,string>, tasks: ?string, contract: ?string}}
 */
const computeFingerprints = (change) => {
  const a = change.artifacts || inspectArtifacts(change.dir);
  const artifacts = {};
  for (const f of ['proposal.md', ...a.specs, 'design.md']) {
    const p = path.join(change.dir, f);
    if (fs.existsSync(p)) artifacts[f] = hashFile(p);
  }
  return {
    artifacts,
    tasks: a.tasks ? hashTasksNormalized(path.join(change.dir, 'tasks.md')) : null,
    contract: a.contract ? hashFile(path.join(change.dir, 'execution-contract.md')) : null,
  };
};

/** 把三组指纹渲染成可直接粘贴进 dp2.approved 回执的单行 flow mapping */
const renderFingerprints = (fp) => {
  const inner = Object.entries(fp.artifacts)
    .map(([k, v]) => `"${k}": ${v}`)
    .join(', ');
  return `fingerprints: { artifacts: { ${inner} }, tasks: ${fp.tasks || 'null'}, contract: ${fp.contract || 'null'} }`;
};

// ── 状态推导（core.md 第 1 / 11 节：大阶段看工件，阶段内位置看回执末条） ──

const deriveStatus = (change, state) => {
  const quick = change.name.startsWith('quick-');
  const a = change.artifacts;
  const tasks = a.tasks
    ? countTasks(fs.readFileSync(path.join(change.dir, 'tasks.md'), 'utf8'))
    : { total: 0, done: 0 };
  const receipts = getReceipts(state);
  const ev = eventName(lastReceipt(receipts));
  const counters = (state.exists && state.data.counters) || {};
  const base = { quick, tasks, lastEvent: ev, counters };

  if (quick) {
    const done = ev === 'verify.passed';
    return { ...base, stage: done ? 'done' : 'building', position: done ? '快速路径已收口' : '快速路径执行中', next: done ? 'none' : '继续执行，收口走 /sflow-verify' };
  }
  const complete = a.proposal && a.tasks && a.specs.length > 0;
  if (!complete) return { ...base, stage: 'specifying', position: '工件不全', next: '/sflow-propose' };
  if (!a.contract) return { ...base, stage: 'specifying', position: '工件齐全，待桥接', next: '/sflow-contract' };
  if (!receipts.some((r) => r.event === 'dp2.approved')) {
    return { ...base, stage: 'bridging', position: '契约待批准（DP-2）', next: '展示契约，请求用户批准' };
  }
  // 调试态检查优先于 tasks 完成度——正在调试的变更即使 tasks 未勾完也不该指回 /sflow-apply
  if (ev && ev.startsWith('debug.attempt')) {
    return { ...base, stage: 'debugging', position: `调试中（连续失败计数 ${counters.debug_attempts ?? 0}）`, next: '/sflow-debug' };
  }
  if (ev === 'debug.resolved') return { ...base, stage: 'verifying', position: '调试已解决，待重验', next: '/sflow-verify' };
  if (tasks.total === 0 || tasks.done < tasks.total) {
    return {
      ...base,
      stage: 'building',
      position: tasks.total ? `待执行批次（已完成 ${tasks.done}/${tasks.total}）` : '待执行批次',
      next: '/sflow-apply',
    };
  }
  // 任务全部完成 → 阶段内位置只能由回执末条确定（工件在这一层无法区分）
  if (ev === 'verify.failed') return { ...base, stage: 'debugging', position: '验证失败', next: '/sflow-debug' };
  if (ev === 'review.blocked') return { ...base, stage: 'building', position: '审查有阻塞 Critical，待修复', next: '/sflow-apply' };
  if (ev === 'review.passed') return { ...base, stage: 'archiving', position: '待归档', next: '/sflow-archive' };
  if (ev === 'archive.done') return { ...base, stage: 'done', position: '已归档', next: 'none' };
  if (ev === 'verify.passed') return { ...base, stage: 'reviewing', position: '待审查', next: '/sflow-review' };
  return { ...base, stage: 'verifying', position: '批次已完成，待验证', next: '/sflow-verify' };
};

// ── 子命令 ─────────────────────────────────────────────────────

const yn = (b) => (b ? '有' : '无');

const runState = (opts) => {
  const projectRoot = path.resolve(opts.cwd || process.cwd());
  const change = collectChange(projectRoot, opts._[0]);
  change.artifacts = inspectArtifacts(change.dir);
  const state = readState(change.dir);
  const st = deriveStatus(change, state);

  // 存量变更（无 state.yaml）且不在快速路径时，无法可靠推断阶段内位置——
  // AI 可能会按错误路由行动。退出码 0 + 明确提示回落 progress.md。
  if (!state.exists && !st.quick && st.stage !== 'specifying') {
    st.position += '（⚠ 存量变更无 state.yaml，阶段内位置回落 progress.md 台账末行判定）';
  }

  const a = change.artifacts;
  const reviewBase = state.exists && state.data.baseline ? state.data.baseline.review_base : null;
  if (opts.json) {
    console.log(JSON.stringify({
      change: change.name,
      workflow: st.quick ? 'quick' : 'full',
      stage: st.stage,
      position: st.position,
      next: st.next,
      stateFile: relOf(projectRoot, state.path),
      stateExists: state.exists,
      tasks: st.tasks,
      lastReceipt: st.lastEvent,
      counters: st.counters,
      reviewBase,
      artifacts: a,
    }, null, 2));
    return 0;
  }
  console.log(`变更：${change.name}（${change.changesRel}）`);
  console.log(`路径：${st.quick ? '快速路径' : 'full'}　大阶段：${st.stage}`);
  console.log(`阶段内位置：${st.position}`);
  console.log(`下一步：${st.next}`);
  console.log(`工件：proposal=${yn(a.proposal)} design=${yn(a.design)} tasks=${yn(a.tasks)} specs=${a.specs.length} contract=${yn(a.contract)}`);
  console.log(`任务：${st.tasks.done}/${st.tasks.total}　回执末条：${st.lastEvent || '（无）'}`);
  console.log(`review_base：${reviewBase || '（未写入）'}`);
  console.log(`state.yaml：${state.exists ? '存在' : '不存在（⚠ 存量变更：阶段内位置请回落 progress.md 台账末行判定，以下路由可能不准）'}`);
  return 0;
};

const runValidate = (opts) => {
  const projectRoot = path.resolve(opts.cwd || process.cwd());
  const change = collectChange(projectRoot, opts._[0]);
  change.artifacts = inspectArtifacts(change.dir);
  const a = change.artifacts;
  const errors = [];
  const warnings = [];
  const state = readState(change.dir);

  if (!state.exists) {
    warnings.push('无 state.yaml（存量变更）：跳过回执校验，回落 progress.md 台账末行判定');
  } else {
    const d = state.data;
    if (d.schema !== STATE_SCHEMA) errors.push(`schema 应为 ${STATE_SCHEMA}，实为 ${JSON.stringify(d.schema)}`);
    if (d.change !== change.name) errors.push(`change 字段（${JSON.stringify(d.change)}）与目录名（${change.name}）不一致`);
    if (!d.baseline || !('review_base' in d.baseline)) errors.push('baseline.review_base 缺失');
    if (!Array.isArray(d.receipts)) {
      errors.push('receipts 不是合法列表');
    } else {
      const receipts = d.receipts;
      const idx = (ev) => receipts.findIndex((r) => r.event === ev);
      const dp2 = receipts.filter((r) => r.event === 'dp2.approved');
      if (dp2.length === 0) {
        const later = receipts.find((r) => /^(batch|verify|review|archive)\./.test(r.event || ''));
        if (later) errors.push(`尚无 dp2.approved 却出现下游回执 ${later.event}（伪回执）`);
      } else {
        if (!dp2[0].review_base) errors.push('首条 dp2.approved 缺 review_base');
        if (!dp2[0].fingerprints) errors.push('首条 dp2.approved 缺 fingerprints');
        for (const r of dp2) {
          if (r.review_base && d.baseline && r.review_base !== d.baseline.review_base) {
            errors.push(`dp2.approved 的 review_base（${r.review_base}）与 baseline.review_base（${d.baseline.review_base}）不一致 → 锚点疑似被改写（审计污染）`);
          }
        }
      }
      if (idx('verify.passed') >= 0 && idx('dp2.approved') > idx('verify.passed')) {
        errors.push('verify.passed 出现在 dp2.approved 之前（回执乱序）');
      }
      if (idx('review.passed') >= 0 && idx('verify.passed') < 0 && !receipts.some((r) => r.event === 'override')) errors.push('有 review.passed 但无前置 verify.passed');
      // override 是用户确认跳过审查的合法回执（sflow-archive 认可），等价于 review.passed
      const hasReviewApproval = idx('review.passed') >= 0 || receipts.some((r) => r.event === 'override');
      if (idx('archive.done') >= 0 && !hasReviewApproval) errors.push('有 archive.done 但无前置 review.passed 或 override');
    }
  }

  if (!change.name.startsWith('quick-')) {
    if (!a.proposal) errors.push('full 路径缺 proposal.md');
    if (!a.tasks) errors.push('full 路径缺 tasks.md');
    if (a.specs.length === 0) errors.push('full 路径 specs/ 下无 spec.md');
    // design.md 按需（B4-3）：缺文件时不报错，改看 proposal 是否声明「无独立技术决策」
    if (!a.design) {
      const propPath = path.join(change.dir, 'proposal.md');
      const prop = fs.existsSync(propPath) ? fs.readFileSync(propPath, 'utf8') : '';
      if (/^##\s*技术决策\s*$/m.test(prop)) {
        warnings.push('未生成 design.md（proposal 含「技术决策」节说明，符合按需规则）');
      } else {
        warnings.push('未生成 design.md 且 proposal 无「技术决策」节：请确认本变更确无接口/依赖/选型决策，或补一节说明');
      }
    }
    if (!a.contract) warnings.push('尚无 execution-contract.md（bridging 之前属正常）');
  } else {
    // 快速路径只要求 progress.md（意图 + 改动清单 + 验证输出）；state.yaml 存在则校验
    if (!fs.existsSync(path.join(change.dir, 'progress.md'))) errors.push('快速路径缺 progress.md');
  }
  if (a.tasks && state.exists && Array.isArray(state.data.receipts)) {
    const t = countTasks(fs.readFileSync(path.join(change.dir, 'tasks.md'), 'utf8'));
    const hasVerify = state.data.receipts.some((r) => r.event === 'verify.passed');
    if (hasVerify && t.total > 0 && t.done < t.total) {
      errors.push(`tasks 未全部勾选（${t.done}/${t.total}）却存在 verify.passed → 伪回执`);
    }
  }
  errors.push(...checkSpecHeaders(projectRoot, change));

  if (opts.json) {
    console.log(JSON.stringify({ change: change.name, ok: errors.length === 0, errors, warnings }, null, 2));
    return errors.length ? 4 : 0;
  }
  for (const w of warnings) console.log(`  ! ${w}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log(
    errors.length === 0
      ? `✔ ${change.name} 校验通过${warnings.length ? `（${warnings.length} 条提示）` : ''}`
      : `✗ ${change.name} 校验失败：${errors.length} 项`,
  );
  return errors.length ? 4 : 0;
};

const runGuard = (opts) => {
  const projectRoot = path.resolve(opts.cwd || process.cwd());
  const change = collectChange(projectRoot, opts._[0]);
  change.artifacts = inspectArtifacts(change.dir);
  const state = readState(change.dir);

  // --emit-fingerprints：DP-2 生成契约后调用，输出可直接粘贴进 dp2.approved 的回执片段。
  // 这一步替代了"AI 手抄哈希"——手抄是错误率的来源，机械算才是 B3 的意义。
  if (opts.emit) {
    if (!change.artifacts.contract) {
      const msg = '尚无 execution-contract.md：DP-2 前无法生成指纹';
      if (opts.json) console.log(JSON.stringify({ change: change.name, applicable: false, reason: msg }, null, 2));
      else console.log(`变更：${change.name}\n  ${msg}`);
      return 3;
    }
    const fp = computeFingerprints(change);
    // review_base：首次 DP-2 用当前 HEAD，重批时保留 baseline 里的原值（锚点只写一次）
    let reviewBaseForReceipt;
    if (state.exists && state.data.baseline && state.data.baseline.review_base) {
      reviewBaseForReceipt = state.data.baseline.review_base;
    } else {
      const headResult = cp.spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' });
      reviewBaseForReceipt = headResult.status === 0 ? headResult.stdout.trim() : null;
    }
    if (opts.json) {
      console.log(JSON.stringify({ change: change.name, fingerprints: fp, reviewBase: reviewBaseForReceipt, isNewBaseline: reviewBaseForReceipt === (state.exists && state.data.baseline ? state.data.baseline.review_base : null) }, null, 2));
      return 0;
    }
    const pad2 = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const tzOff = -now.getTimezoneOffset();
    const tzSign = tzOff >= 0 ? '+' : '-';
    const tzH = pad2(Math.floor(Math.abs(tzOff) / 60));
    const tzM = pad2(Math.abs(tzOff) % 60);
    const at = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}T${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}${tzSign}${tzH}:${tzM}`;
    console.log(`变更：${change.name}`);
    console.log('把下面这行粘进 state.yaml 的 receipts 区块（替换最后一行注释或追加在已有回执之后）：');
    console.log('');
    console.log(`  - { at: ${at}, cmd: /sflow-contract, event: dp2.approved, review_base: ${reviewBaseForReceipt}, ${renderFingerprints(fp)} }`);
    console.log('');
    if (state.exists && state.data.baseline && state.data.baseline.review_base) {
      console.log(`baseline.review_base 已存在（${state.data.baseline.review_base}），emit 已自动使用原值——直接粘贴即可，无需手改。`);
    } else {
      console.log(`同时把 baseline.review_base 写为 ${reviewBaseForReceipt}（首次写入，此后不得改写）。`);
    }
    return 0;
  }

  const refuse = (reason) => {
    if (opts.json) console.log(JSON.stringify({ change: change.name, applicable: false, reason }, null, 2));
    else console.log(`变更：${change.name}\n  ${reason}：无机械基线可比对，改用 progress.md 手工核对`);
    return 3;
  };
  if (!state.exists) return refuse('无 state.yaml（存量变更）');
  const d = state.data;
  const receipts = getReceipts(state);
  const dp2 = receipts.filter((r) => r.event === 'dp2.approved');
  if (dp2.length === 0) return refuse('尚无 dp2.approved 回执（契约未批准）');

  const cur = dp2[dp2.length - 1].fingerprints || {};
  const base = d.baseline ? d.baseline.review_base : null;
  const problems = [];
  const drift = [];

  // 锚点核对：缺失、被改写、非本仓库提交
  if (!base) problems.push('baseline.review_base 缺失');
  for (const r of dp2) {
    if (r.review_base && base && r.review_base !== base) {
      problems.push(`锚点污染：dp2.approved 的 review_base=${r.review_base} 与 baseline=${base} 不一致`);
    }
  }
  if (base) {
    const r = cp.spawnSync('git', ['cat-file', '-e', `${base}^{commit}`], { cwd: projectRoot });
    if (r.status !== 0) problems.push(`review_base ${base} 不是本仓库的有效提交`);
  }

  // 指纹核对：三组（artifacts 逐文件 / tasks 归一化 / contract）
  const now = computeFingerprints(change);
  const wantArtifacts = cur.artifacts || {};
  for (const k of new Set([...Object.keys(wantArtifacts), ...Object.keys(now.artifacts)])) {
    if (wantArtifacts[k] !== now.artifacts[k]) {
      drift.push(`artifacts.${k}：${wantArtifacts[k] ? wantArtifacts[k].slice(0, 7) : '（缺）'} → ${now.artifacts[k] ? now.artifacts[k].slice(0, 7) : '（缺）'}`);
    }
  }
  if ((cur.tasks || null) !== now.tasks) {
    drift.push(`tasks：${cur.tasks ? cur.tasks.slice(0, 7) : '（缺）'} → ${now.tasks ? now.tasks.slice(0, 7) : '（缺）'}（勾选已归一化；不一致说明任务组被重排/增删/改写）`);
  }
  if ((cur.contract || null) !== now.contract) {
    drift.push(`contract：${cur.contract ? cur.contract.slice(0, 7) : '（缺）'} → ${now.contract ? now.contract.slice(0, 7) : '（缺）'}`);
  }

  const polluted = problems.length > 0;
  const expired = drift.length > 0;
  const code = polluted ? 2 : expired ? 1 : 0;
  if (opts.json) {
    console.log(JSON.stringify({ change: change.name, ok: code === 0, pollution: polluted, expired, problems, drift, reviewBase: base }, null, 2));
    return code;
  }
  console.log(`变更：${change.name}　review_base：${base || '（缺）'}`);
  if (polluted) {
    console.log('  ✗ 审计污染（比契约过期更严重——它是绕过而非意外）：停止一切执行并呈报');
    for (const p of problems) console.log(`      - ${p}`);
  }
  if (expired) {
    console.log('  ✗ 契约过期（指纹漂移）：停止执行并回 /sflow-contract');
    for (const x of drift) console.log(`      - ${x}`);
  }
  if (code === 0) console.log('  ✔ 锚点完整、三组指纹一致：契约 fresh，可继续执行');
  return code;
};

module.exports = { runState, runValidate, runGuard, parseStateYaml, hashTasksNormalized, gitBlobHash, deriveStatus, headerStyleOf, computeFingerprints, renderFingerprints };
