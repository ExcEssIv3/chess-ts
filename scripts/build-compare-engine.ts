// Dev-time-only step for the Engine Competition feature (src/competition/):
// builds an ADDITIONAL, independently-loadable WASM engine from an arbitrary
// git ref so it can play against the current build (or another comparison
// build) in the browser. This can't happen client-side — the browser has no
// compiler — so this script checks the ref out into a disposable git
// worktree, runs `dotnet publish` there, and copies the result into
// public/dotnet-engine-<label>/, parallel to how `build:engine-cs`
// (package.json) produces public/dotnet-engine/ for the current build.
// Multiple labels can coexist (e.g. "compare" and "compare2"), so you can
// compare more than two engine versions at once — see src/competition/match.ts.
//
// Run with: npm run build:compare-engine -- <git-ref> [label]
// `label` defaults to "compare" (writing to public/dotnet-engine-compare/).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();

function git(args: string[], cwd = REPO_ROOT): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

function main() {
  const ref = process.argv[2];
  const label = process.argv[3] || "compare";
  if (!ref) {
    console.error("Usage: npm run build:compare-engine -- <git-ref> [label]");
    process.exit(1);
  }
  if (!/^[\w-]+$/.test(label)) {
    console.error(`Invalid label "${label}" — use only letters, digits, "-", "_".`);
    process.exit(1);
  }

  const worktreeDir = join(REPO_ROOT, `.git-worktrees/${label}`);
  const outputDir = join(REPO_ROOT, `public/dotnet-engine-${label}`);

  const resolvedCommit = git(["rev-parse", ref]);
  console.log(`Building "${label}" engine from ${ref} (${resolvedCommit})...`);

  // Always drop and re-add so the worktree reflects exactly the requested
  // ref, even if a previous run left one checked out at something else.
  if (existsSync(worktreeDir)) {
    git(["worktree", "remove", "--force", worktreeDir]);
  }
  mkdirSync(join(REPO_ROOT, ".git-worktrees"), { recursive: true });
  git(["worktree", "add", "--detach", worktreeDir, resolvedCommit]);

  try {
    const engineCsDir = join(worktreeDir, "engine-cs");
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
      worktreeDir,
      "engine-cs/bin/Release/net9.0/publish/wwwroot/_framework"
    );
    rmSync(outputDir, { recursive: true, force: true });
    mkdirSync(outputDir, { recursive: true });
    execFileSync("cp", ["-r", publishedFramework, join(outputDir, "_framework")]);

    const manifest = {
      label,
      ref,
      resolvedCommit,
      builtAt: new Date().toISOString(),
    };
    writeFileSync(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    console.log(`"${label}" engine built: ${JSON.stringify(manifest)}`);
  } finally {
    git(["worktree", "remove", "--force", worktreeDir]);
  }
}

main();
