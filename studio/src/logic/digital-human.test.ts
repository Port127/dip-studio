import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "../errors/http-error";

/**
 * Mutable fake home for `node:os` `homedir` (see hoisted mock below).
 */
let fakeHomeForOsMock = "/tmp";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: (): string => fakeHomeForOsMock
  };
});

import {
  DefaultDigitalHumanLogic,
  filterAgentSkillEntries,
  getSkillEntryDescription,
  getSkillEntryName,
  mapAvailableSkillEntries,
  resolveDefaultWorkspace
} from "./digital-human";

describe("DefaultDigitalHumanLogic", () => {
  it("fetches agents and enriches list with IDENTITY.md creature", async () => {
    const openClawAgentsAdapter = {
      listAgents: vi.fn().mockResolvedValue({
        defaultId: "main",
        mainKey: "sender",
        scope: "per-sender",
        agents: [
          {
            id: "main",
            name: "Main Agent",
            identity: {
              avatarUrl: "https://example.com/main.png"
            }
          }
        ]
      }),
      getAgentFile: vi.fn().mockResolvedValue({
        file: {
          content: "# IDENTITY.md\n\n- Name: From File\n- Creature: Engineer\n"
        }
      })
    };
    const logic = new DefaultDigitalHumanLogic({
      openClawAgentsAdapter: openClawAgentsAdapter as never,
      skillStorePath: "/tmp/skills"
    });

    await expect(logic.listDigitalHumans()).resolves.toEqual([
      {
        id: "main",
        name: "From File",
        creature: "Engineer"
      }
    ]);
    expect(openClawAgentsAdapter.listAgents).toHaveBeenCalledOnce();
    expect(openClawAgentsAdapter.getAgentFile).toHaveBeenCalledWith({
      agentId: "main",
      name: "IDENTITY.md"
    });
  });

  it("list falls back when IDENTITY fetch fails", async () => {
    const openClawAgentsAdapter = {
      listAgents: vi.fn().mockResolvedValue({
        defaultId: "main",
        mainKey: "sender",
        scope: "per-sender",
        agents: [
          {
            id: "a1",
            name: "Listed Name"
          }
        ]
      }),
      getAgentFile: vi.fn().mockRejectedValue(new Error("network"))
    };
    const logic = new DefaultDigitalHumanLogic({
      openClawAgentsAdapter: openClawAgentsAdapter as never,
      skillStorePath: "/tmp/skills"
    });

    await expect(logic.listDigitalHumans()).resolves.toEqual([
      {
        id: "a1",
        name: "Listed Name",
        creature: undefined
      }
    ]);
  });

  it("listEnabledSkills returns only globally enabled skills", async () => {
    const logic = new DefaultDigitalHumanLogic({
      openClawAgentsAdapter: {
        listAgents: vi.fn(),
        createAgent: vi.fn(),
        deleteAgent: vi.fn(),
        getAgentFile: vi.fn(),
        setAgentFile: vi.fn(),
        getConfig: vi.fn(),
        patchConfig: vi.fn(),
        getSkillStatuses: vi.fn().mockResolvedValue([
          { skillKey: "planner", description: "plan tasks", enabled: true },
          { skillKey: "writer", enabled: false },
          { skillKey: "coder", description: "write code", enabled: true }
        ])
      } as never,
      skillStorePath: "/tmp/skills"
    });

    await expect(logic.listEnabledSkills()).resolves.toEqual([
      { name: "planner", description: "plan tasks" },
      { name: "coder", description: "write code" }
    ]);
  });

  it("listDigitalHumanSkills filters available skills by agent config", async () => {
    const getSkillStatuses = vi.fn().mockResolvedValue([
      { skillKey: "planner", description: "plan tasks", enabled: true },
      { skillKey: "writer", description: "write docs", enabled: undefined },
      { skillKey: "coder", description: "write code", enabled: false }
    ]);
    const agentSkillsLogic = {
      getAgentSkills: vi.fn().mockResolvedValue({
        agentId: "agent-1",
        skills: ["writer", "coder"]
      })
    };
    const logic = new DefaultDigitalHumanLogic({
      openClawAgentsAdapter: {
        listAgents: vi.fn(),
        createAgent: vi.fn(),
        deleteAgent: vi.fn(),
        getAgentFile: vi.fn(),
        setAgentFile: vi.fn(),
        getConfig: vi.fn(),
        patchConfig: vi.fn(),
        getSkillStatuses
      } as never,
      skillStorePath: "/tmp/skills",
      agentSkillsLogic: agentSkillsLogic as never
    });

    await expect(logic.listDigitalHumanSkills("agent-1")).resolves.toEqual([
      {
        name: "writer",
        description: "write docs"
      }
    ]);
    expect(getSkillStatuses).toHaveBeenCalledOnce();
    expect(agentSkillsLogic.getAgentSkills).toHaveBeenCalledWith("agent-1");
  });
});

describe("resolveDefaultWorkspace", () => {
  it("places workspace under ~/.openclaw/<uuid>", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(resolveDefaultWorkspace(id)).toBe(join(fakeHomeForOsMock, ".openclaw", id));
  });
});

describe("skill status helpers", () => {
  it("getSkillEntryName prefers name and trims whitespace", () => {
    expect(getSkillEntryName({ skillKey: "planner", name: " planner " })).toBe("planner");
    expect(getSkillEntryName({ skillKey: "writer" })).toBe("writer");
  });

  it("getSkillEntryDescription trims whitespace", () => {
    expect(
      getSkillEntryDescription({
        skillKey: "planner",
        description: " plan tasks "
      })
    ).toBe("plan tasks");
  });

  it("mapAvailableSkillEntries keeps non-disabled skills in order", () => {
    expect(
      mapAvailableSkillEntries([
        { skillKey: "planner", enabled: true },
        { skillKey: "planner", enabled: undefined },
        { skillKey: "writer", enabled: undefined },
        { skillKey: "coder", enabled: false },
        { skillKey: "coder", name: " coder ", enabled: true }
      ])
    ).toEqual([
      { skillKey: "planner", enabled: true },
      { skillKey: "writer", enabled: undefined },
      { skillKey: "coder", name: " coder ", enabled: true }
    ]);
  });

  it("filterAgentSkillEntries keeps only configured available skills", () => {
    expect(
      filterAgentSkillEntries(
        [
          { skillKey: "planner", description: "plan tasks", enabled: true },
          { skillKey: "writer", description: "write docs", enabled: undefined },
          { skillKey: "coder", description: "write code", enabled: true }
        ],
        ["writer", "coder", "missing"]
      )
    ).toEqual([
      {
        name: "writer",
        description: "write docs"
      },
      {
        name: "coder",
        description: "write code"
      }
    ]);
  });
});

describe("DefaultDigitalHumanLogic lifecycle (filesystem + adapter)", () => {
  let fakeHome: string;

  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), "dip-dh-"));
    fakeHomeForOsMock = fakeHome;
  });

  afterEach(() => {
    fakeHomeForOsMock = "/tmp";
    try {
      rmSync(fakeHome, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("getDigitalHuman reads template fields and skills", async () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const ws = resolveDefaultWorkspace(id);
    mkdirSync(join(ws, "skills", "s1"), { recursive: true });
    writeFileSync(
      join(ws, "IDENTITY.md"),
      "- Name: Alice\n- Creature: QA\n",
      "utf8"
    );
    writeFileSync(join(ws, "SOUL.md"), "Soul text\n", "utf8");

    const adapter = {
      listAgents: vi.fn(),
      createAgent: vi.fn(),
      deleteAgent: vi.fn(),
      getAgentFile: vi.fn().mockImplementation(async ({ name }: { name: string }) => ({
        file: { content: readFileSync(join(ws, name), "utf8") }
      })),
      setAgentFile: vi.fn(),
      getConfig: vi.fn(),
      patchConfig: vi.fn()
    };

    const logic = new DefaultDigitalHumanLogic({
      openClawAgentsAdapter: adapter as never,
      skillStorePath: join(fakeHome, "skills-store")
    });

    await expect(logic.getDigitalHuman(id)).resolves.toMatchObject({
      id,
      name: "Alice",
      creature: "QA",
      soul: "Soul text\n",
      skills: ["s1"]
    });
  });

  it("getDigitalHuman includes channel when OpenClaw config binds feishu", async () => {
    const id = "b1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const ws = resolveDefaultWorkspace(id);
    mkdirSync(ws, { recursive: true });
    writeFileSync(
      join(ws, "IDENTITY.md"),
      "- Name: Alice\n- Creature: QA\n",
      "utf8"
    );
    writeFileSync(join(ws, "SOUL.md"), "Soul text\n", "utf8");

    const configPath = join(fakeHome, "openclaw.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        bindings: [{ agentId: id, match: { channel: "feishu" } }],
        channels: {
          feishu: {
            enabled: true,
            appId: "app-1",
            appSecret: "secret-1"
          }
        }
      }),
      "utf8"
    );
    const prev = process.env.OPENCLAW_CONFIG_PATH;
    process.env.OPENCLAW_CONFIG_PATH = configPath;

    try {
      const adapter = {
        listAgents: vi.fn(),
        createAgent: vi.fn(),
        deleteAgent: vi.fn(),
        getAgentFile: vi.fn().mockImplementation(async ({ name }: { name: string }) => ({
          file: { content: readFileSync(join(ws, name), "utf8") }
        })),
        setAgentFile: vi.fn(),
        getConfig: vi.fn(),
        patchConfig: vi.fn()
      };

      const logic = new DefaultDigitalHumanLogic({
        openClawAgentsAdapter: adapter as never,
        skillStorePath: join(fakeHome, "skills-store")
      });

      await expect(logic.getDigitalHuman(id)).resolves.toMatchObject({
        id,
        channel: { type: "feishu", appId: "app-1", appSecret: "secret-1" }
      });
    } finally {
      if (prev === undefined) {
        delete process.env.OPENCLAW_CONFIG_PATH;
      } else {
        process.env.OPENCLAW_CONFIG_PATH = prev;
      }
    }
  });

  it("getDigitalHuman omits channel when config JSON is invalid", async () => {
    const id = "c1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const ws = resolveDefaultWorkspace(id);
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, "IDENTITY.md"), "- Name: A\n", "utf8");
    writeFileSync(join(ws, "SOUL.md"), "x\n", "utf8");

    const configPath = join(fakeHome, "bad.json");
    writeFileSync(configPath, "{ not json", "utf8");
    const prev = process.env.OPENCLAW_CONFIG_PATH;
    process.env.OPENCLAW_CONFIG_PATH = configPath;

    try {
      const adapter = {
        listAgents: vi.fn(),
        createAgent: vi.fn(),
        deleteAgent: vi.fn(),
        getAgentFile: vi.fn().mockImplementation(async ({ name }: { name: string }) => ({
          file: { content: readFileSync(join(ws, name), "utf8") }
        })),
        setAgentFile: vi.fn(),
        getConfig: vi.fn(),
        patchConfig: vi.fn()
      };
      const logic = new DefaultDigitalHumanLogic({
        openClawAgentsAdapter: adapter as never,
        skillStorePath: join(fakeHome, "skills-store")
      });
      const detail = await logic.getDigitalHuman(id);
      expect(detail.channel).toBeUndefined();
    } finally {
      if (prev === undefined) {
        delete process.env.OPENCLAW_CONFIG_PATH;
      } else {
        process.env.OPENCLAW_CONFIG_PATH = prev;
      }
    }
  });

  it("getDigitalHuman omits channel when binding channel key is unsupported", async () => {
    const id = "a0b2c3d4-e5f6-7890-abcd-ef1234567890";
    const ws = resolveDefaultWorkspace(id);
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, "IDENTITY.md"), "- Name: A\n", "utf8");
    writeFileSync(join(ws, "SOUL.md"), "x\n", "utf8");

    const configPath = join(fakeHome, "oc-unknown-ch.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        bindings: [{ agentId: id, match: { channel: "slack" } }],
        channels: { slack: { appId: "a", appSecret: "b" } }
      }),
      "utf8"
    );
    const prev = process.env.OPENCLAW_CONFIG_PATH;
    process.env.OPENCLAW_CONFIG_PATH = configPath;

    try {
      const adapter = {
        listAgents: vi.fn(),
        createAgent: vi.fn(),
        deleteAgent: vi.fn(),
        getAgentFile: vi.fn().mockImplementation(async ({ name }: { name: string }) => ({
          file: { content: readFileSync(join(ws, name), "utf8") }
        })),
        setAgentFile: vi.fn(),
        getConfig: vi.fn(),
        patchConfig: vi.fn()
      };
      const logic = new DefaultDigitalHumanLogic({
        openClawAgentsAdapter: adapter as never,
        skillStorePath: join(fakeHome, "skills-store")
      });
      const detail = await logic.getDigitalHuman(id);
      expect(detail.channel).toBeUndefined();
    } finally {
      if (prev === undefined) {
        delete process.env.OPENCLAW_CONFIG_PATH;
      } else {
        process.env.OPENCLAW_CONFIG_PATH = prev;
      }
    }
  });

  it("getDigitalHuman omits channel when binding is for another agent", async () => {
    const id = "d1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const ws = resolveDefaultWorkspace(id);
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, "IDENTITY.md"), "- Name: A\n", "utf8");
    writeFileSync(join(ws, "SOUL.md"), "x\n", "utf8");

    const configPath = join(fakeHome, "oc2.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        bindings: [{ agentId: "other-id", match: { channel: "feishu" } }],
        channels: { feishu: { appId: "a", appSecret: "b" } }
      }),
      "utf8"
    );
    const prev = process.env.OPENCLAW_CONFIG_PATH;
    process.env.OPENCLAW_CONFIG_PATH = configPath;

    try {
      const adapter = {
        listAgents: vi.fn(),
        createAgent: vi.fn(),
        deleteAgent: vi.fn(),
        getAgentFile: vi.fn().mockImplementation(async ({ name }: { name: string }) => ({
          file: { content: readFileSync(join(ws, name), "utf8") }
        })),
        setAgentFile: vi.fn(),
        getConfig: vi.fn(),
        patchConfig: vi.fn()
      };
      const logic = new DefaultDigitalHumanLogic({
        openClawAgentsAdapter: adapter as never,
        skillStorePath: join(fakeHome, "skills-store")
      });
      const detail = await logic.getDigitalHuman(id);
      expect(detail.channel).toBeUndefined();
    } finally {
      if (prev === undefined) {
        delete process.env.OPENCLAW_CONFIG_PATH;
      } else {
        process.env.OPENCLAW_CONFIG_PATH = prev;
      }
    }
  });

  it("getDigitalHuman omits channel when feishu credentials are incomplete", async () => {
    const id = "e1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const ws = resolveDefaultWorkspace(id);
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, "IDENTITY.md"), "- Name: A\n", "utf8");
    writeFileSync(join(ws, "SOUL.md"), "x\n", "utf8");

    const configPath = join(fakeHome, "oc3.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        bindings: [{ agentId: id, match: { channel: "feishu" } }],
        channels: { feishu: { appId: "", appSecret: "only-secret" } }
      }),
      "utf8"
    );
    const prev = process.env.OPENCLAW_CONFIG_PATH;
    process.env.OPENCLAW_CONFIG_PATH = configPath;

    try {
      const adapter = {
        listAgents: vi.fn(),
        createAgent: vi.fn(),
        deleteAgent: vi.fn(),
        getAgentFile: vi.fn().mockImplementation(async ({ name }: { name: string }) => ({
          file: { content: readFileSync(join(ws, name), "utf8") }
        })),
        setAgentFile: vi.fn(),
        getConfig: vi.fn(),
        patchConfig: vi.fn()
      };
      const logic = new DefaultDigitalHumanLogic({
        openClawAgentsAdapter: adapter as never,
        skillStorePath: join(fakeHome, "skills-store")
      });
      const detail = await logic.getDigitalHuman(id);
      expect(detail.channel).toBeUndefined();
    } finally {
      if (prev === undefined) {
        delete process.env.OPENCLAW_CONFIG_PATH;
      } else {
        process.env.OPENCLAW_CONFIG_PATH = prev;
      }
    }
  });

  it("getDigitalHuman maps unknown agent errors to 404", async () => {
    const adapter = {
      listAgents: vi.fn(),
      createAgent: vi.fn(),
      deleteAgent: vi.fn(),
      getAgentFile: vi.fn().mockRejectedValue(new Error("unknown agent id")),
      setAgentFile: vi.fn(),
      getConfig: vi.fn(),
      patchConfig: vi.fn()
    };
    const logic = new DefaultDigitalHumanLogic({
      openClawAgentsAdapter: adapter as never,
      skillStorePath: "/tmp/x"
    });

    await expect(logic.getDigitalHuman("missing")).rejects.toMatchObject({
      statusCode: 404
    });
  });

  it("getDigitalHuman rethrows HttpError unchanged", async () => {
    const forbidden = new HttpError(403, "forbidden");
    const adapter = {
      listAgents: vi.fn(),
      createAgent: vi.fn(),
      deleteAgent: vi.fn(),
      getAgentFile: vi.fn().mockRejectedValue(forbidden),
      setAgentFile: vi.fn(),
      getConfig: vi.fn(),
      patchConfig: vi.fn()
    };
    const logic = new DefaultDigitalHumanLogic({
      openClawAgentsAdapter: adapter as never,
      skillStorePath: "/tmp/x"
    });

    await expect(logic.getDigitalHuman("x")).rejects.toBe(forbidden);
  });

  it("deleteDigitalHuman delegates to deleteAgent", async () => {
    const deleteAgent = vi.fn().mockResolvedValue({ ok: true });
    const logic = new DefaultDigitalHumanLogic({
      openClawAgentsAdapter: {
        listAgents: vi.fn(),
        createAgent: vi.fn(),
        deleteAgent,
        getAgentFile: vi.fn(),
        setAgentFile: vi.fn(),
        getConfig: vi.fn(),
        patchConfig: vi.fn()
      } as never,
      skillStorePath: "/tmp/skills"
    });

    await logic.deleteDigitalHuman("agent-1", false);

    expect(deleteAgent).toHaveBeenCalledWith({
      agentId: "agent-1",
      deleteFiles: false
    });
  });

  it("createDigitalHuman writes markdown and links skills", async () => {
    const skillStore = join(fakeHome, "skill-store", "sk1");
    mkdirSync(skillStore, { recursive: true });
    writeFileSync(join(skillStore, ".keep"), "", "utf8");

    const createAgent = vi.fn().mockResolvedValue({ ok: true });
    const logic = new DefaultDigitalHumanLogic({
      openClawAgentsAdapter: {
        listAgents: vi.fn(),
        createAgent,
        deleteAgent: vi.fn(),
        getAgentFile: vi.fn(),
        setAgentFile: vi.fn(),
        getConfig: vi.fn(),
        patchConfig: vi.fn()
      } as never,
      skillStorePath: join(fakeHome, "skill-store")
    });

    const result = await logic.createDigitalHuman({
      name: "Bob",
      creature: "Dev",
      soul: "Hi",
      skills: ["sk1"]
    });

    const ws = resolveDefaultWorkspace(result.id);
    expect(readFileSync(join(ws, "IDENTITY.md"), "utf8")).toContain("Bob");
    expect(readFileSync(join(ws, "SOUL.md"), "utf8")).toContain("Hi");
    expect(createAgent).toHaveBeenCalledWith({
      name: result.id,
      workspace: ws
    });
  });

  it("updateDigitalHuman merges patch and writes files", async () => {
    const id = "f1e2d3c4-b5a6-7890-abcd-ef1234567890";
    const ws = resolveDefaultWorkspace(id);
    mkdirSync(ws, { recursive: true });
    writeFileSync(
      join(ws, "IDENTITY.md"),
      "- Name: Old\n- Creature: X\n",
      "utf8"
    );
    writeFileSync(join(ws, "SOUL.md"), "Old soul\n", "utf8");

    const adapter = {
      listAgents: vi.fn(),
      createAgent: vi.fn(),
      deleteAgent: vi.fn(),
      getAgentFile: vi.fn().mockImplementation(async ({ name }: { name: string }) => ({
        file: { content: readFileSync(join(ws, name), "utf8") }
      })),
      setAgentFile: vi.fn(),
      getConfig: vi.fn(),
      patchConfig: vi.fn()
    };

    const logic = new DefaultDigitalHumanLogic({
      openClawAgentsAdapter: adapter as never,
      skillStorePath: join(fakeHome, "skill-store")
    });

    await logic.updateDigitalHuman(id, { name: "New", soul: "New soul" });

    expect(readFileSync(join(ws, "IDENTITY.md"), "utf8")).toContain("New");
    expect(readFileSync(join(ws, "SOUL.md"), "utf8")).toContain("New soul");
  });

  it("createDigitalHuman binds channel when config path is writable", async () => {
    const cfg = join(fakeHome, "openclaw.json");
    writeFileSync(cfg, "{}\n", "utf8");
    const prev = process.env.OPENCLAW_CONFIG_PATH;
    const prevState = process.env.OPENCLAW_STATE_DIR;
    delete process.env.OPENCLAW_STATE_DIR;
    process.env.OPENCLAW_CONFIG_PATH = cfg;

    const createAgent = vi.fn().mockResolvedValue({ ok: true });
    const logic = new DefaultDigitalHumanLogic({
      openClawAgentsAdapter: {
        listAgents: vi.fn(),
        createAgent,
        deleteAgent: vi.fn(),
        getAgentFile: vi.fn(),
        setAgentFile: vi.fn(),
        getConfig: vi.fn(),
        patchConfig: vi.fn()
      } as never,
      skillStorePath: join(fakeHome, "skill-store")
    });

    await logic.createDigitalHuman({
      name: "C",
      channel: { appId: "a", appSecret: "b" }
    });

    const parsed = JSON.parse(readFileSync(cfg, "utf8")) as {
      channels: { feishu: { appId: string } };
    };
    expect(parsed.channels.feishu.appId).toBe("a");

    process.env.OPENCLAW_CONFIG_PATH = prev;
    process.env.OPENCLAW_STATE_DIR = prevState;
  });

  it("createDigitalHuman writes channel to OPENCLAW_STATE_DIR when config path unset", async () => {
    const stateDir = join(fakeHome, "state");
    mkdirSync(stateDir, { recursive: true });
    const prevCfg = process.env.OPENCLAW_CONFIG_PATH;
    const prevState = process.env.OPENCLAW_STATE_DIR;
    delete process.env.OPENCLAW_CONFIG_PATH;
    process.env.OPENCLAW_STATE_DIR = stateDir;

    const createAgent = vi.fn().mockResolvedValue({ ok: true });
    const logic = new DefaultDigitalHumanLogic({
      openClawAgentsAdapter: {
        listAgents: vi.fn(),
        createAgent,
        deleteAgent: vi.fn(),
        getAgentFile: vi.fn(),
        setAgentFile: vi.fn(),
        getConfig: vi.fn(),
        patchConfig: vi.fn()
      } as never,
      skillStorePath: join(fakeHome, "skill-store")
    });

    await logic.createDigitalHuman({
      name: "D",
      channel: { appId: "x", appSecret: "y" }
    });

    const cfgPath = join(stateDir, "openclaw.json");
    const parsed = JSON.parse(readFileSync(cfgPath, "utf8")) as {
      channels: { feishu: { appId: string } };
    };
    expect(parsed.channels.feishu.appId).toBe("x");

    process.env.OPENCLAW_CONFIG_PATH = prevCfg;
    process.env.OPENCLAW_STATE_DIR = prevState;
  });

  it("getDigitalHuman includes channel when OpenClaw config binds dingtalk", async () => {
    const id = "f1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const ws = resolveDefaultWorkspace(id);
    mkdirSync(ws, { recursive: true });
    writeFileSync(
      join(ws, "IDENTITY.md"),
      "- Name: Alice\n- Creature: QA\n",
      "utf8"
    );
    writeFileSync(join(ws, "SOUL.md"), "Soul text\n", "utf8");

    const configPath = join(fakeHome, "oc-ding.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        bindings: [{ agentId: id, match: { channel: "dingtalk" } }],
        channels: {
          dingtalk: {
            enabled: true,
            appId: "dt-1",
            appSecret: "dt-sec"
          }
        }
      }),
      "utf8"
    );
    const prev = process.env.OPENCLAW_CONFIG_PATH;
    process.env.OPENCLAW_CONFIG_PATH = configPath;

    try {
      const adapter = {
        listAgents: vi.fn(),
        createAgent: vi.fn(),
        deleteAgent: vi.fn(),
        getAgentFile: vi.fn().mockImplementation(async ({ name }: { name: string }) => ({
          file: { content: readFileSync(join(ws, name), "utf8") }
        })),
        setAgentFile: vi.fn(),
        getConfig: vi.fn(),
        patchConfig: vi.fn()
      };

      const logic = new DefaultDigitalHumanLogic({
        openClawAgentsAdapter: adapter as never,
        skillStorePath: join(fakeHome, "skills-store")
      });

      await expect(logic.getDigitalHuman(id)).resolves.toMatchObject({
        id,
        channel: { type: "dingtalk", appId: "dt-1", appSecret: "dt-sec" }
      });
    } finally {
      if (prev === undefined) {
        delete process.env.OPENCLAW_CONFIG_PATH;
      } else {
        process.env.OPENCLAW_CONFIG_PATH = prev;
      }
    }
  });

  it("createDigitalHuman binds dingtalk channel when type is dingtalk", async () => {
    const cfg = join(fakeHome, "openclaw-ding.json");
    writeFileSync(cfg, "{}\n", "utf8");
    const prev = process.env.OPENCLAW_CONFIG_PATH;
    const prevState = process.env.OPENCLAW_STATE_DIR;
    delete process.env.OPENCLAW_STATE_DIR;
    process.env.OPENCLAW_CONFIG_PATH = cfg;

    const createAgent = vi.fn().mockResolvedValue({ ok: true });
    const logic = new DefaultDigitalHumanLogic({
      openClawAgentsAdapter: {
        listAgents: vi.fn(),
        createAgent,
        deleteAgent: vi.fn(),
        getAgentFile: vi.fn(),
        setAgentFile: vi.fn(),
        getConfig: vi.fn(),
        patchConfig: vi.fn()
      } as never,
      skillStorePath: join(fakeHome, "skill-store")
    });

    const result = await logic.createDigitalHuman({
      name: "E",
      channel: { type: "dingtalk", appId: "dta", appSecret: "dts" }
    });

    const parsed = JSON.parse(readFileSync(cfg, "utf8")) as {
      bindings: Array<{ agentId: string; match: { channel: string } }>;
      channels: { dingtalk: { appId: string } };
    };
    expect(parsed.channels.dingtalk.appId).toBe("dta");
    expect(parsed.bindings.some((b) => b.match.channel === "dingtalk")).toBe(true);
    expect(result.channel).toEqual({
      type: "dingtalk",
      appId: "dta",
      appSecret: "dts"
    });

    process.env.OPENCLAW_CONFIG_PATH = prev;
    process.env.OPENCLAW_STATE_DIR = prevState;
  });
});
