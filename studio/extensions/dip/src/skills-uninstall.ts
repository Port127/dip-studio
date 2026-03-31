import fs from "node:fs";
import path from "node:path";

/**
 * Lists skill ids under a directory (same rules as `skills-discovery` `listSkillNamesFromDir`).
 * Implemented locally so this module does not import `skills-discovery` (which pulls `openclaw/plugin-sdk`).
 *
 * @param skillsDir Skills root path.
 * @returns Sorted unique ids are not required; only membership checks use this.
 */
function listSkillNamesFromDirLocal(skillsDir: string): string[] {
  if (!fs.existsSync(skillsDir)) {
    return [];
  }
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter(
      (dirent) => dirent.isDirectory() || dirent.name.endsWith(".skill")
    )
    .map((dirent) => dirent.name.replace(/\.skill$/, ""))
    .filter((name) => !name.startsWith("."));
}

/**
 * Error codes returned by {@link uninstallSkillFromRepo} for HTTP mapping.
 */
export type SkillUninstallErrorCode = "INVALID_NAME" | "NOT_FOUND" | "BUNDLED";

/**
 * Thrown when a skill cannot be removed from the repository `skills/` tree.
 */
export class SkillUninstallError extends Error {
  /**
   * Creates a structured uninstall error.
   *
   * @param code Machine-readable error code.
   * @param message Human-readable detail.
   */
  public constructor(
    public readonly code: SkillUninstallErrorCode,
    message: string
  ) {
    super(message);
    this.name = "SkillUninstallError";
  }
}

/** Same rule as `skills-install` directory names. */
const SKILL_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * Ensures {@link resolved} is contained under {@link repoSkillsDir}.
 *
 * @param resolved Absolute or normalized path to candidate.
 * @param repoSkillsDir Repository `skills` root.
 * @returns Whether the path stays inside the repo skills directory.
 */
function isPathUnderRepoSkills(
  resolved: string,
  repoSkillsDir: string
): boolean {
  const root = path.resolve(repoSkillsDir);
  const target = path.resolve(resolved);
  return target === root || target.startsWith(root + path.sep);
}

/**
 * Removes `repoSkillsDir/<name>/` (or a `*.skill` entry) if present.
 * Does not remove plugin-bundled skills when they exist only under `bundledSkillsDir`.
 *
 * @param name Skill id (slug).
 * @param repoSkillsDir Absolute path to `{repoRoot}/skills`.
 * @param bundledSkillsDir Absolute path to bundled `extensions/dip/skills` (or equivalent).
 * @returns Confirmation payload.
 */
export function uninstallSkillFromRepo(
  name: string,
  repoSkillsDir: string,
  bundledSkillsDir: string
): { name: string } {
  const trimmed = name.trim();
  if (trimmed.length === 0 || !SKILL_NAME_RE.test(trimmed)) {
    throw new SkillUninstallError(
      "INVALID_NAME",
      `Invalid skill name "${name}"`
    );
  }

  const repoTarget = path.join(repoSkillsDir, trimmed);
  if (!isPathUnderRepoSkills(repoTarget, repoSkillsDir)) {
    throw new SkillUninstallError("INVALID_NAME", "Invalid skill path");
  }

  if (fs.existsSync(repoTarget)) {
    fs.rmSync(repoTarget, { recursive: true, force: true });
    return { name: trimmed };
  }

  const bundledNames = new Set(listSkillNamesFromDirLocal(bundledSkillsDir));
  if (bundledNames.has(trimmed)) {
    throw new SkillUninstallError(
      "BUNDLED",
      `Skill "${trimmed}" is bundled with the plugin; it is not installed under repository skills/`
    );
  }

  throw new SkillUninstallError(
    "NOT_FOUND",
    `Skill "${trimmed}" is not installed under skills/`
  );
}

/**
 * Maps a {@link SkillUninstallError} code to an HTTP status code.
 *
 * @param code Error code from {@link SkillUninstallError}.
 * @returns Suggested HTTP status.
 */
export function skillUninstallErrorHttpStatus(
  code: SkillUninstallErrorCode
): number {
  switch (code) {
    case "BUNDLED":
      return 403;
    case "NOT_FOUND":
      return 404;
    default:
      return 400;
  }
}
