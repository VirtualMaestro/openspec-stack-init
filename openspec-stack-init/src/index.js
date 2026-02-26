#!/usr/bin/env node

// openspec-stack-init — cross-platform initializer for:
// OpenSpec + Beads + claude-mem + openspec-to-beads skill + brownfield-baseline skill
//
// Usage:
//   npx openspec-stack-init                  — current directory
//   npx openspec-stack-init ./my-project     — specific path
//   npx openspec-stack-init --dry-run        — preview without executing

import { execSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, statSync, unlinkSync } from "fs";
import { resolve, basename, join, sep, dirname } from "path";
import { platform } from "os";
import process from "process";

// ─── Minimal inline styling (avoids requiring chalk to be pre-installed) ─────
const c = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  blue:    "\x1b[34m",
  cyan:    "\x1b[36m",
};

const log = {
  info:    (msg) => console.log(`${c.blue}[INFO]${c.reset} ${msg}`),
  ok:      (msg) => console.log(`${c.green}[ OK ]${c.reset} ${msg}`),
  warn:    (msg) => console.log(`${c.yellow}[WARN]${c.reset} ${msg}`),
  skip:    (msg) => console.log(`${c.yellow}[SKIP]${c.reset} ${msg}`),
  error:   (msg) => console.error(`${c.red}[ERR ]${c.reset} ${msg}`),
  step:    (msg) => console.log(`\n${c.bold}${c.cyan}══> ${msg}${c.reset}`),
  section: (msg) => console.log(`${c.bold}${msg}${c.reset}`),
};

// ─── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run") || args.includes("-n");
const targetArg = args.find((a) => !a.startsWith("--") && !a.startsWith("-"));
const TARGET_DIR = resolve(targetArg || process.cwd());
const PROJECT_NAME = basename(TARGET_DIR);
const IS_WINDOWS = platform() === "win32";

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Run a shell command, return true on success */
function run(cmd, opts = {}) {
  if (DRY_RUN) {
    log.info(`[DRY RUN] ${cmd}`);
    return true;
  }
  try {
    execSync(cmd, {
      cwd: TARGET_DIR,
      stdio: opts.silent ? "pipe" : "inherit",
      shell: true,
      ...opts,
    });
    return true;
  } catch (e) {
    // Provide detailed error information
    const errorMsg = opts.silent && e.stderr
      ? e.stderr.toString().trim()
      : e.message;

    if (!opts.silent) {
      log.error(`Command failed: ${cmd}`);
      if (errorMsg) {
        log.error(`Error: ${errorMsg}`);
      }
      if (e.status) {
        log.error(`Exit code: ${e.status}`);
      }
    }

    return false;
  }
}

/** Check if a CLI tool is available in PATH */
function hasCmd(cmd) {
  const check = IS_WINDOWS ? `where ${cmd}` : `command -v ${cmd}`;
  try {
    execSync(check, { stdio: "pipe", shell: true });
    return true;
  } catch {
    return false;
  }
}

/** Write file only if it doesn't exist (or DRY_RUN) */
function writeIfMissing(filePath, content, description) {
  // Normalize path separators for cross-platform compatibility
  const normalizedPath = filePath.split(/[/\\]+/).join(sep);

  // Resolve full path
  const full = resolve(TARGET_DIR, normalizedPath);

  // SECURITY: Verify resolved path stays within TARGET_DIR
  const normalizedTarget = resolve(TARGET_DIR);
  if (!full.startsWith(normalizedTarget + sep) && full !== normalizedTarget) {
    log.error(`Security: Path traversal detected in "${filePath}"`);
    log.error(`Attempted to write outside target directory`);
    process.exit(1);
  }

  if (existsSync(full)) {
    log.skip(`${filePath} already exists`);
    return;
  }

  if (DRY_RUN) {
    log.info(`[DRY RUN] Would create: ${filePath}`);
    return;
  }

  // Use dirname instead of string manipulation
  const parentDir = dirname(full);
  try {
    mkdirSync(parentDir, { recursive: true });
  } catch (err) {
    log.error(`Failed to create directory ${parentDir}: ${err.message}`);
    process.exit(1);
  }

  try {
    writeFileSync(full, content, "utf8");
    log.ok(`Created ${filePath}${description ? ` — ${description}` : ""}`);
  } catch (err) {
    log.error(`Failed to write ${filePath}: ${err.message}`);
    process.exit(1);
  }
}

/** Append to .gitignore if entry is missing */
function gitignoreAdd(entry, comment) {
  const gitignorePath = join(TARGET_DIR, ".gitignore");
  if (!existsSync(gitignorePath)) {
    if (!DRY_RUN) writeFileSync(gitignorePath, "", "utf8");
  }
  const content = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  if (content.includes(entry)) return;
  if (DRY_RUN) {
    log.info(`[DRY RUN] Would add to .gitignore: ${entry}`);
    return;
  }
  appendFileSync(gitignorePath, `\n# ${comment}\n${entry}\n`, "utf8");
  log.info(`  .gitignore ← ${entry}`);
}

// ─── Banner ───────────────────────────────────────────────────────────────────
console.log(`
${c.bold}╔══════════════════════════════════════════╗
║    OpenSpec Stack Init  v1.0             ║
║  OpenSpec + Beads + claude-mem + skills  ║
╚══════════════════════════════════════════╝${c.reset}
  Project : ${c.cyan}${PROJECT_NAME}${c.reset}
  Path    : ${c.cyan}${TARGET_DIR}${c.reset}
  Mode    : ${DRY_RUN ? c.yellow + "DRY RUN (no changes)" + c.reset : c.green + "LIVE" + c.reset}
`);

if (!existsSync(TARGET_DIR)) {
  log.error(`Directory not found: ${TARGET_DIR}`);
  process.exit(1);
}

// Validate it's actually a directory
try {
  const stats = statSync(TARGET_DIR);
  if (!stats.isDirectory()) {
    log.error(`Target path is not a directory: ${TARGET_DIR}`);
    process.exit(1);
  }
} catch (err) {
  log.error(`Failed to access target directory: ${err.message}`);
  process.exit(1);
}

// Test write permissions
const testFile = join(TARGET_DIR, `.openspec-test-${Date.now()}`);
try {
  writeFileSync(testFile, '');
  unlinkSync(testFile);
} catch (permErr) {
  log.error(`No write permission for directory: ${TARGET_DIR}`);
  log.error(`Error: ${permErr.message}`);
  process.exit(1);
}

// ─── 1. Dependency check ──────────────────────────────────────────────────────
log.step("Checking required tools");

const deps = [
  { cmd: "openspec", install: "npm install -g @fission-ai/openspec@latest" },
  { cmd: "bd",       install: "brew install beads  OR  go install github.com/steveyegge/beads/cmd/bd@latest" },
  { cmd: "claude",   install: "npm install -g @anthropic-ai/claude-code" },
  { cmd: "npx",      install: "Node.js  (https://nodejs.org)" },
];

let missing = false;
for (const { cmd, install } of deps) {
  if (hasCmd(cmd)) {
    log.ok(cmd);
  } else {
    log.warn(`${cmd} not found — install: ${install}`);
    missing = true;
  }
}

if (missing && !DRY_RUN) {
  console.log();
  log.warn("Some tools are missing. Continuing anyway — affected steps will be skipped.");
}

// ─── 2. OpenSpec init ─────────────────────────────────────────────────────────
log.step("OpenSpec — init");

if (existsSync(join(TARGET_DIR, "openspec"))) {
  log.skip("openspec/ already exists");
} else if (hasCmd("openspec")) {
  // --tools claude : select Claude Code without interactive prompt
  // --profile core : valid profile for init (expanded is set separately after)
  // --force        : skip all remaining prompts, auto-cleanup legacy files
  const ok = run("openspec init --tools claude --profile core --force");
  if (ok) {
    log.ok("OpenSpec initialized (core profile, Claude tools)");

    // Remove default config.yaml so custom template can be written in Step 3
    const defaultConfig = join(TARGET_DIR, "openspec", "config.yaml");
    if (existsSync(defaultConfig)) {
      unlinkSync(defaultConfig);
    }

    // Switch to expanded profile to unlock: new, ff, verify, sync, bulk-archive, onboard
    // openspec config profile sets the global default, openspec update regenerates skill files
    const expanded = run("openspec config profile expanded", { silent: true }) &&
                     run("openspec update --tools claude --force", { silent: true });
    if (expanded) {
      log.ok("OpenSpec profile upgraded to expanded");
    } else {
      log.warn("Could not auto-upgrade to expanded profile.");
      log.warn("Run manually: openspec config profile  →  then select expanded  →  openspec update");
    }
  } else {
    log.warn("OpenSpec init failed — run manually: openspec init --tools claude --profile core --force");
  }
} else {
  log.warn("openspec not found — skipping");
}

// ─── 3. OpenSpec config.yaml ──────────────────────────────────────────────────
log.step("OpenSpec — config.yaml");

writeIfMissing(
  "openspec/config.yaml",
  `# OpenSpec Project Config — ${PROJECT_NAME}
# This context is injected into every artifact (proposal, specs, design, tasks)

schema: spec-driven

context: |
  Project: ${PROJECT_NAME}

  # TODO: fill in your actual stack and conventions
  # Tech stack: e.g. TypeScript, React, Node.js / Unity, C# / Python, Django
  # Architecture: e.g. MVC, HMVC, ECS, Redux, MVVM, microservices
  # Testing: e.g. Jest, NUnit, pytest
  # Key constraints: e.g. legacy codebase, must support IE11, no breaking API changes

rules:
  proposal:
    - Always include a rollback plan for legacy code changes
    - List all affected modules
    - Always include an "## Alternatives Considered" section listing at least 2 alternative approaches with their pros, cons, and reason for rejection. Format each as: "### Option: <name> / Pros: ... / Cons: ... / Why rejected: ..."
  specs:
    - Use Given/When/Then format for scenarios
  design:
    - Respect existing legacy constraints
  tasks:
    - Keep tasks atomic (max 2-3 files per task)
    - After all tasks complete, run /opsx:verify
`,
  "fill in 'context' with your project details"
);

// ─── 4. Beads init ────────────────────────────────────────────────────────────
log.step("Beads — init");

const beadsInitialized =
  existsSync(join(TARGET_DIR, ".beads")) ||
  existsSync(join(TARGET_DIR, "beads.jsonl")) ||
  existsSync(join(TARGET_DIR, "issues.jsonl"));

if (beadsInitialized) {
  log.skip("Beads already initialized");
} else if (hasCmd("bd")) {
  // --quiet: non-interactive mode
  // echo N: answers "Contributing to someone else's repo? [y/N]" automatically
  const bdCmd = "echo N | bd init --quiet";
  const ok = run(bdCmd);
  if (ok) log.ok("Beads initialized (quiet mode)");
  else log.warn("bd init failed — run manually: echo N | bd init --quiet");
} else {
  log.warn("bd not found — skipping Beads init");
}

// bd setup claude: installs SessionStart + PreCompact hooks for Claude Code
// This is idempotent — safe to run even if already set up
log.step("Beads — Claude Code integration");

if (hasCmd("bd")) {
  const ok = run("bd setup claude");
  if (ok) log.ok("Beads hooks installed for Claude Code (SessionStart + PreCompact)");
  else log.warn("bd setup claude failed — run manually: bd setup claude");
} else {
  log.warn("bd not found — skipping Claude Code integration");
}

// ─── 5. claude-mem plugin ─────────────────────────────────────────────────────
log.step("claude-mem — plugin install");

// claude plugin marketplace add / install are native CLI commands in Claude Code 2.x
// They work without entering the REPL (confirmed in official docs)
if (hasCmd("claude")) {
  log.info("Adding marketplace: thedotmack/claude-mem");
  // marketplace add is idempotent — if already added, it updates
  run("claude plugin marketplace add thedotmack/claude-mem", { silent: true });

  log.info("Installing plugin: claude-mem");
  const ok = run("claude plugin install claude-mem", { silent: true });

  if (ok) {
    log.ok("claude-mem installed via native claude plugin CLI");
  } else {
    log.warn("claude plugin CLI failed. Install manually inside Claude Code:");
    log.warn("  /plugin marketplace add thedotmack/claude-mem");
    log.warn("  /plugin install claude-mem");
  }
} else {
  log.warn("claude not found — install claude-mem manually:");
  log.warn("  /plugin marketplace add thedotmack/claude-mem");
  log.warn("  /plugin install claude-mem");
}

// ─── 6. Skill: openspec-to-beads ─────────────────────────────────────────────
log.step("Skill — openspec-to-beads");

// npx @smithery/cli skill add is non-interactive
const smitheryOk = run(
  "npx @smithery/cli@latest skill add lucastamoios/openspec-to-beads --agent claude-code"
);
if (smitheryOk) {
  log.ok("Skill openspec-to-beads installed");
} else {
  log.warn("Skill install failed — run manually:");
  log.warn("  npx @smithery/cli@latest skill add lucastamoios/openspec-to-beads --agent claude-code");
}

// ─── 7. Skill: migrate-to-openspec ───────────────────────────────────────────
log.step("Skill — /migrate-to-openspec (brownfield migration)");

// The skill files are bundled alongside this script in ../skills/
import { fileURLToPath } from "url";
import { cpSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const skillSrc = join(__dirname, "..", "skills", "migrate-to-openspec");
const skillDst = join(TARGET_DIR, ".claude", "skills", "migrate-to-openspec");

if (existsSync(skillDst)) {
  log.skip(".claude/skills/migrate-to-openspec/ already exists");
} else if (existsSync(skillSrc)) {
  if (!DRY_RUN) {
    try {
      mkdirSync(join(TARGET_DIR, ".claude", "skills"), { recursive: true });
      cpSync(skillSrc, skillDst, { recursive: true });
      log.ok("Skill /migrate-to-openspec installed → .claude/skills/migrate-to-openspec/");
    } catch (err) {
      log.error(`Failed to install skill: ${err.message}`);
      log.warn("Continuing without skill installation...");
      // Don't exit - skill is optional enhancement
    }
  } else {
    log.info("[DRY RUN] Would install: .claude/skills/migrate-to-openspec/");
  }
} else {
  log.warn("Skill source not found — skipping migrate-to-openspec");
}

log.info("  Usage: run /migrate-to-openspec in Claude Code on a brownfield project");
log.info("  This skill uses 4 parallel scout agents + writes all OpenSpec files automatically");

// ─── 8. .gitignore ────────────────────────────────────────────────────────────
log.step("Updating .gitignore");

// NOTE: beads.jsonl and issues.jsonl are intentionally committed to git (that's the feature)
// Only ignore local SQLite cache and claude-mem local data
gitignoreAdd(".beads-cache/",  "Beads local SQLite cache (not needed in git)");
gitignoreAdd(".claude-mem/",   "claude-mem local session data");

log.ok(".gitignore updated");

// ─── 9. Summary ───────────────────────────────────────────────────────────────
console.log(`
${c.bold}${c.green}╔══════════════════════════════════════════╗
║          Setup Complete!                 ║
╚══════════════════════════════════════════╝${c.reset}

${c.bold}What was done:${c.reset}
  ${c.green}✓${c.reset} OpenSpec           → openspec/ + expanded profile + Claude tools
  ${c.green}✓${c.reset} openspec/config.yaml → auto-filled by /migrate-to-openspec
  ${c.green}✓${c.reset} Beads              → initialized (--quiet) + Claude Code hooks
  ${c.green}✓${c.reset} claude-mem         → plugin installed via native claude CLI
  ${c.green}✓${c.reset} openspec-to-beads  → skill installed via Smithery
  ${c.green}✓${c.reset} /migrate-to-openspec → .claude/skills/migrate-to-openspec/

${c.bold}Next steps — ${c.cyan}BROWNFIELD${c.reset} project:${c.reset}
  1. Restart Claude Code
  2. ${c.cyan}/migrate-to-openspec${c.reset} — scans project + fills all OpenSpec files automatically
  3. Review ${c.cyan}openspec/MIGRATION_REPORT.md${c.reset}
  4. ${c.cyan}bd ready${c.reset} — see task list in Beads

${c.bold}Next steps — ${c.cyan}GREENFIELD${c.reset} project:${c.reset}
  1. Edit ${c.cyan}openspec/config.yaml${c.reset} — describe your planned stack
  2. Restart Claude Code
  3. ${c.cyan}/opsx:propose <feature>${c.reset} — start first feature

${c.bold}Key commands:${c.reset}
  ${c.cyan}bd ready${c.reset}              unblocked tasks right now
  ${c.cyan}bd create "..."${c.reset}       create a Beads issue
  ${c.cyan}openspec list${c.reset}         active OpenSpec changes
  ${c.cyan}/opsx:explore${c.reset}         explore codebase
  ${c.cyan}/opsx:new <name>${c.reset}      new change
  ${c.cyan}/opsx:ff${c.reset}              generate all artifacts at once
  ${c.cyan}/opsx:apply${c.reset}           implement tasks
  ${c.cyan}/opsx:verify${c.reset}          verify implementation vs specs
  ${c.cyan}/opsx:archive${c.reset}         archive change → specs/
`);
