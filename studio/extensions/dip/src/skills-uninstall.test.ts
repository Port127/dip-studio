import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SkillUninstallError,
  skillUninstallErrorHttpStatus,
  uninstallSkillFromRepo
} from "./skills-uninstall";

describe("skills-uninstall", () => {
  let repoSkillsDir: string;
  let bundledSkillsDir: string;

  beforeEach(() => {
    repoSkillsDir = fs.mkdtempSync(path.join(os.tmpdir(), "dip-uninstall-repo-"));
    bundledSkillsDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "dip-uninstall-bundled-")
    );
  });

  afterEach(() => {
    fs.rmSync(repoSkillsDir, { recursive: true, force: true });
    fs.rmSync(bundledSkillsDir, { recursive: true, force: true });
  });

  it("maps error codes to HTTP status", () => {
    expect(skillUninstallErrorHttpStatus("BUNDLED")).toBe(403);
    expect(skillUninstallErrorHttpStatus("NOT_FOUND")).toBe(404);
    expect(skillUninstallErrorHttpStatus("INVALID_NAME")).toBe(400);
  });

  it("removes a skill directory under repoSkillsDir", () => {
    const dir = path.join(repoSkillsDir, "weather");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), "# x");

    const result = uninstallSkillFromRepo("weather", repoSkillsDir, bundledSkillsDir);

    expect(result).toEqual({ name: "weather" });
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("rejects bundled-only skills", () => {
    const bundled = path.join(bundledSkillsDir, "pack");
    fs.mkdirSync(bundled, { recursive: true });
    fs.writeFileSync(path.join(bundled, "SKILL.md"), "# b");

    expect(() =>
      uninstallSkillFromRepo("pack", repoSkillsDir, bundledSkillsDir)
    ).toThrow(SkillUninstallError);
    try {
      uninstallSkillFromRepo("pack", repoSkillsDir, bundledSkillsDir);
    } catch (e: unknown) {
      expect(e).toMatchObject({ code: "BUNDLED" });
    }
  });

  it("rejects when skill is missing", () => {
    expect(() =>
      uninstallSkillFromRepo("nope", repoSkillsDir, bundledSkillsDir)
    ).toThrow(SkillUninstallError);
    try {
      uninstallSkillFromRepo("nope", repoSkillsDir, bundledSkillsDir);
    } catch (e: unknown) {
      expect(e).toMatchObject({ code: "NOT_FOUND" });
    }
  });

  it("rejects invalid names", () => {
    expect(() =>
      uninstallSkillFromRepo("../x", repoSkillsDir, bundledSkillsDir)
    ).toThrow(SkillUninstallError);
  });
});
