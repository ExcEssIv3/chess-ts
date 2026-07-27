// Dev-time-only step for the Engine Competition feature (src/competition/):
// builds a SECOND, independently-loadable WASM engine from an arbitrary git
// ref so it can play against the current build in the browser. This can't
// happen client-side — the browser has no compiler — so this script checks
// the ref out into a disposable git worktree, runs `dotnet publish` there,
// and copies the result into public/dotnet-engine-compare/, parallel to how
// `build:engine-cs` (package.json) produces public/dotnet-engine/ for the
// current build.
//
// Run with: npm run build:compare-engine -- <git-ref>

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const WORKTREE_DIR = join(REPO_ROOT, ".git-worktrees/compare-engine");
const OUTPUT_DIR = join(REPO_ROOT, "public/dotnet-engine-compare");

function git(args: string[], cwd = REPO_ROOT): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

function main() {
  const ref = process.argv[2];
  if (!ref) {
    console.error("Usage: npm run build:compare-engine -- <git-ref>");
    process.exit(1);
  }

  const resolvedCommit = git(["rev-parse", ref]);
  console.log(`Building comparison engine from ${ref} (${resolvedCommit})...`);

  // Always drop and re-add so the worktree reflects exactly the requested
  // ref, even if a previous run left one checked out at something else.
  if (existsSync(WORKTREE_DIR)) {
    git(["worktree", "remove", "--force", WORKTREE_DIR]);
  }
  mkdirSync(join(REPO_ROOT, ".git-worktrees"), { recursive: true });
  git(["worktree", "add", "--detach", WORKTREE_DIR, resolvedCommit]);

  try {
    const engineCsDir = join(WORKTREE_DIR, "engine-cs");
    if (!existsSync(engineCsDir)) {
      console.error(
        `engine-cs/ doesn't exist at ${ref} — this ref predates the C# port ` +
          `and can't be built as a comparison engine.`
      );
      process.exit(1);
    }

    execFileSync("dotnet", ["publish", engineCsDir, "-c", "Release"], {
      stdio: "inherit",
    });

    const publishedFramework = join(
      WORKTREE_DIR,
      "engine-cs/bin/Release/net9.0/publish/wwwroot/_framework"
    );
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
    mkdirSync(OUTPUT_DIR, { recursive: true });
    execFileSync("cp", ["-r", publishedFramework, join(OUTPUT_DIR, "_framework")]);

    const manifest = {
      ref,
      resolvedCommit,
      builtAt: new Date().toISOString(),
    };
    writeFileSync(join(OUTPUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

    console.log(`Comparison engine built: ${JSON.stringify(manifest)}`);
  } finally {
    git(["worktree", "remove", "--force", WORKTREE_DIR]);
  }
}

main();
