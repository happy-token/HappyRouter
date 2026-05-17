#!/usr/bin/env node
import { createInterface } from "readline";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { scanApps } from "./lib/apps.js";
import { getProxyGroups, getProxies } from "./lib/config.js";
import { getDelays, checkTunMode, fixTunMode } from "./lib/mihomo-api.js";
import { generateRules, applyRules } from "./lib/rules.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const question = (q) => new Promise((resolve) => rl.question(q, resolve));

const CLASH_DIR = join(
  homedir(),
  "Library/Application Support/io.github.clash-verge-rev.clash-verge-rev"
);

function bold(s) { return `\x1b[1m${s}\x1b[0m`; }
function dim(s) { return `\x1b[2m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function red(s) { return `\x1b[31m${s}\x1b[0m`; }
function cyan(s) { return `\x1b[36m${s}\x1b[0m`; }

function hr() { console.log(dim("─".repeat(56))); }

function statusIcon(ok) { return ok ? green("✓") : red("✗"); }

async function step1() {
  console.log(`\n${bold("Step 1/5 — 环境检查")}`);
  console.log(dim("检查 Clash Verge Rev 是否安装以及 TUN 模式是否开启。\n"));

  const configExists = existsSync(join(CLASH_DIR, "clash-verge.yaml"));
  console.log(`  ${statusIcon(configExists)} Clash Verge Rev 配置${configExists ? "已找到" : "未找到"}`);

  const tun = checkTunMode();
  const tunOk = tun.enabled;
  const tunMismatch = tun.mismatch;

  if (tunOk) {
    console.log(`  ${green("✓")} TUN 模式已开启`);
  } else if (tunMismatch) {
    console.log(`  ${yellow("⚠")} TUN 模式未生效（Clash 中已开启但核心未运行）`);
    const ans = await question("\n是否尝试修复 TUN 模式？[Y/n] ");
    if (ans.toLowerCase() !== "n") {
      console.log(dim("  修复中..."));
      const result = fixTunMode();
      if (result.ok) {
        console.log(`  ${green("✓")} TUN 已修复并持久化\n`);
      } else {
        console.log(`  ${red("✗")} 修复失败: ${result.error}\n`);
      }
    }
  } else {
    console.log(`  ${red("✗")} TUN 模式未开启`);
    console.log(yellow("\n  ⚠ 进程级别规则只在 TUN 模式下生效。"));
    console.log(yellow("  请先在 Clash Verge Rev 设置中开启 TUN 模式。\n"));
  }

  if (!configExists) {
    console.log(red("\n请先安装 Clash Verge Rev: https://github.com/clash-verge-rev/clash-verge-rev\n"));
    process.exit(1);
  }

  await question("按 Enter 继续...");
}

async function step2() {
  console.log(`\n${bold("Step 2/5 — 选择代理节点")}`);
  console.log(dim("选择你的应用流量要走的代理节点或代理组。\n"));

  const groups = getProxyGroups();
  const proxies = getProxies();
  const delays = getDelays();

  const options = [
    ...groups.map((g) => ({ label: g, value: g, type: "group" })),
    ...proxies.map((p) => {
      const d = delays[p];
      const suffix = d !== undefined ? ` (${formatDelay(d)})` : "";
      return { label: `${p}${suffix}`, value: p, type: "proxy", delay: d };
    }),
    { label: "DIRECT (直连)", value: "DIRECT", type: "direct" },
  ];

  const typeLabel = { group: "[组] ", proxy: "[节点]", direct: "[直连]" };

  options.forEach((o, i) => {
    const num = String(i + 1).padStart(2);
    const typ = o.type === "group" ? cyan : o.type === "direct" ? dim : (s) => s;
    console.log(`  ${dim(`[${num}]`)} ${typ(typeLabel[o.type])} ${o.label}`);
  });

  console.log("");
  const ans = await question(`请选择节点序号 [1-${options.length}]: `);
  const idx = parseInt(ans) - 1;
  if (idx < 0 || idx >= options.length) {
    console.log(red("无效选择，请重试。"));
    return step2();
  }
  return options[idx];
}

async function step3() {
  console.log(`\n${bold("Step 3/5 — 选择应用")}`);
  console.log(dim("勾选需要通过代理节点访问网络的应用。可以多选，用逗号分隔序号。\n"));

  const apps = scanApps();

  apps.forEach((a, i) => {
    const num = String(i + 1).padStart(2);
    const name = a.name.padEnd(30);
    const id = dim(a.bundleId || a.path);
    console.log(`  ${dim(`[${num}]`)} ${name} ${id}`);
  });

  console.log("");
  const ans = await question(`请选择应用序号（多选用逗号分隔，如 1,3,5）: `);
  const indices = ans.split(",").map((s) => parseInt(s.trim()) - 1);
  const selected = indices
    .filter((i) => i >= 0 && i < apps.length)
    .map((i) => apps[i]);

  if (!selected.length) {
    console.log(red("未选择任何有效应用，请重试。"));
    return step3();
  }

  console.log(`\n  ${green("已选:")} ${selected.map((a) => a.name).join(", ")}`);
  return selected;
}

async function step4() {
  console.log(`\n${bold("Step 4/5 — 选择路由模式")}`);
  console.log(dim("选择路由模式来决定未选中应用的流量如何处理。\n"));

  console.log(`  ${bold("[1]")} ${bold("追加规则")}`);
  console.log(`      ${dim("选中应用走代理，其他应用和规则保持不变。")}`);
  console.log("");
  console.log(`  ${bold("[2]")} ${bold("仅选中直连")}`);
  console.log(`      ${dim("选中应用走代理，其余所有流量走直连（DIRECT）。")}`);

  console.log("");
  const ans = await question("请选择模式 [1/2]: ");
  if (ans === "1") return "append";
  if (ans === "2") return "exclusive";
  console.log(red("无效选择，请重试。"));
  return step4();
}

async function step5(proxy, apps, mode) {
  console.log(`\n${bold("Step 5/5 — 确认配置")}`);
  console.log(dim("请确认以下配置无误。\n"));

  hr();
  console.log(`  ${bold("代理节点:")}   ${cyan(proxy.label)}`);
  console.log(`  ${bold("已选应用:")}   ${apps.map((a) => a.name).join(", ")}`);
  console.log(`  ${bold("路由模式:")}   ${mode === "append" ? "追加规则" : "仅选中直连"}`);

  const rules = generateRules(apps, proxy.value);
  if (mode === "exclusive") rules.push("MATCH,DIRECT");

  console.log(`\n  ${bold("生成规则:")}`);
  rules.forEach((r) => console.log(`    ${dim("-")} ${r}`));
  hr();

  console.log("");
  const ans = await question("确认应用以上规则？[Y/n] ");
  if (ans.toLowerCase() === "n") {
    console.log(dim("已取消。"));
    return false;
  }

  console.log(dim("\n应用规则中..."));
  const result = applyRules(rules, mode);
  if (result.error) {
    console.log(red(`\n✗ 应用失败: ${result.error}`));
    return false;
  }
  console.log(green(`\n✓ 规则已应用${result.reloaded ? "并热重载" : ""}。`));
  if (result.bak) console.log(dim(`  备份: ${result.bak}`));
  return true;
}

async function main() {
  console.clear();
  console.log(`\n  ${bold("Happy App Router")}  ${dim("— 应用代理路由配置工具")}`);

  const runWeb = process.argv.includes("--web") || process.argv.includes("-w");

  if (runWeb) {
    const { startServer } = await import("./server.js");
    const { exec } = await import("child_process");
    const PORT = process.env.PORT || 3456;
    const { port } = await startServer(PORT);
    const url = `http://localhost:${port}`;
    console.log(`\n  Web UI: ${cyan(url)}\n`);
    exec(`open "${url}"`);
    return;
  }

  try {
    await step1();
    const proxy = await step2();
    const apps = await step3();
    const mode = await step4();
    await step5(proxy, apps, mode);
  } catch (err) {
    console.log(red(`\n错误: ${err.message}`));
  } finally {
    rl.close();
  }
}

function formatDelay(ms) {
  if (ms === 0) return "---";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

main();
