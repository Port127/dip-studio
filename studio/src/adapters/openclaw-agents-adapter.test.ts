import { describe, expect, it, vi } from "vitest";

import path from "node:path";

import {
  createAgentsCreateRequest,
  createAgentsDeleteRequest,
  createAgentsFilesGetRequest,
  createAgentsFilesListRequest,
  createAgentsFilesSetRequest,
  createConfigGetRequest,
  createConfigPatchRequest,
  createSkillsStatusRequest,
  normalizeSkillStatusEntries,
  OpenClawAgentsGatewayAdapter,
  createAgentsListRequest
} from "./openclaw-agents-adapter";

describe("createAgentsListRequest", () => {
  it("builds the agents.list JSON RPC frame", () => {
    expect(createAgentsListRequest()).toEqual({
      type: "req",
      method: "agents.list",
      params: {}
    });
  });
});

describe("createAgentsCreateRequest", () => {
  it("builds the agents.create JSON RPC frame", () => {
    expect(
      createAgentsCreateRequest({
        name: "Main Agent",
        workspace: "/path/to/main"
      })
    ).toEqual({
      type: "req",
      method: "agents.create",
      params: {
        name: "Main Agent",
        workspace: "/path/to/main"
      }
    });
  });
});

describe("OpenClawAgentsGatewayAdapter", () => {
  it("delegates agents.list to the gateway port", async () => {
    const gatewayPort = {
      invoke: vi.fn().mockResolvedValue({
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
      })
    };
    const adapter = new OpenClawAgentsGatewayAdapter(gatewayPort);

    await expect(adapter.listAgents()).resolves.toEqual({
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
    });
    expect(gatewayPort.invoke).toHaveBeenCalledOnce();
  });

  it("delegates agents.create to the gateway port", async () => {
    const gatewayPort = {
      invoke: vi.fn().mockResolvedValue({
        ok: true,
        agentId: "main",
        name: "Main Agent",
        workspace: "/path/to/main"
      })
    };
    const adapter = new OpenClawAgentsGatewayAdapter(gatewayPort);

    await expect(
      adapter.createAgent({
        name: "Main Agent",
        workspace: "/path/to/main"
      })
    ).resolves.toEqual({
      ok: true,
      agentId: "main",
      name: "Main Agent",
      workspace: "/path/to/main"
    });

    expect(gatewayPort.invoke).toHaveBeenNthCalledWith(
      1,
      createAgentsCreateRequest({
        name: "Main Agent",
        workspace: "/path/to/main"
      })
    );
  });

  it("delegates agents.delete to the gateway port", async () => {
    const gatewayPort = {
      invoke: vi.fn().mockResolvedValue({ ok: true })
    };
    const adapter = new OpenClawAgentsGatewayAdapter(gatewayPort);

    await adapter.deleteAgent({ agentId: "x", deleteFiles: true });

    expect(gatewayPort.invoke).toHaveBeenCalledWith(
      createAgentsDeleteRequest({
        agentId: "x",
        deleteFiles: true
      })
    );
  });

  it("delegates agents.files.list to the gateway port", async () => {
    const gatewayPort = {
      invoke: vi.fn().mockResolvedValue({
        agentId: "a",
        files: [{ name: "IDENTITY.md" }]
      })
    };
    const adapter = new OpenClawAgentsGatewayAdapter(gatewayPort);

    await adapter.listAgentFiles({ agentId: "a" });

    expect(gatewayPort.invoke).toHaveBeenCalledWith(
      createAgentsFilesListRequest({
        agentId: "a"
      })
    );
  });

  it("delegates agents.files.get to the gateway port", async () => {
    const gatewayPort = {
      invoke: vi.fn().mockResolvedValue({
        file: { name: "IDENTITY.md", content: "x" }
      })
    };
    const adapter = new OpenClawAgentsGatewayAdapter(gatewayPort);

    await adapter.getAgentFile({ agentId: "a", name: "IDENTITY.md" });

    expect(gatewayPort.invoke).toHaveBeenCalledWith(
      createAgentsFilesGetRequest({
        agentId: "a",
        name: "IDENTITY.md"
      })
    );
  });

  it("delegates agents.files.set to the gateway port", async () => {
    const gatewayPort = {
      invoke: vi.fn().mockResolvedValue({ file: { name: "SOUL.md" } })
    };
    const adapter = new OpenClawAgentsGatewayAdapter(gatewayPort);

    await adapter.setAgentFile({
      agentId: "a",
      name: "SOUL.md",
      content: "body"
    });

    expect(gatewayPort.invoke).toHaveBeenCalledWith(
      createAgentsFilesSetRequest({
        agentId: "a",
        name: "SOUL.md",
        content: "body"
      })
    );
  });

  it("delegates skills.status without agentId to the gateway port", async () => {
    const gatewayPort = {
      invoke: vi.fn().mockResolvedValue({
        skills: [
          {
            skillKey: "planner",
            enabled: true
          }
        ]
      })
    };
    const adapter = new OpenClawAgentsGatewayAdapter(gatewayPort);

    await expect(adapter.getSkillStatuses()).resolves.toEqual([
      {
        skillKey: "planner",
        name: "planner",
        description: undefined,
        enabled: true,
        skillOriginType: undefined
      }
    ]);

    expect(gatewayPort.invoke).toHaveBeenCalledWith(
      createSkillsStatusRequest({})
    );
  });

  it("includes skillPath when gateway provides it", async () => {
    const gatewayPort = {
      invoke: vi.fn().mockResolvedValue({
        skills: [
          {
            skillKey: "ws-skill",
            path: "/Users/h/agent-workspace/skills/ws-skill",
            enabled: true
          }
        ]
      })
    };
    const adapter = new OpenClawAgentsGatewayAdapter(gatewayPort);

    await expect(adapter.getSkillStatuses()).resolves.toEqual([
      {
        skillKey: "ws-skill",
        name: "ws-skill",
        description: undefined,
        enabled: true,
        skillPath: "/Users/h/agent-workspace/skills/ws-skill",
        skillOriginType: undefined
      }
    ]);
  });

  it("preserves upstream skillOriginType when inference yields unknown", async () => {
    const gatewayPort = {
      invoke: vi.fn().mockResolvedValue({
        skills: [
          {
            skillKey: "managed-skill",
            enabled: true,
            skillOriginType: "managed"
          }
        ]
      })
    };
    const adapter = new OpenClawAgentsGatewayAdapter(gatewayPort);

    await expect(adapter.getSkillStatuses()).resolves.toEqual([
      {
        skillKey: "managed-skill",
        name: "managed-skill",
        description: undefined,
        enabled: true,
        skillOriginType: "managed"
      }
    ]);
  });

  it("delegates skills.status with agentId to the gateway port", async () => {
    const gatewayPort = {
      invoke: vi.fn().mockResolvedValue({
        skills: [
          {
            skillKey: "planner",
            enabled: true
          }
        ]
      })
    };
    const adapter = new OpenClawAgentsGatewayAdapter(gatewayPort);

    await adapter.getSkillStatuses({ agentId: "a1" });

    expect(gatewayPort.invoke).toHaveBeenCalledWith(
      createSkillsStatusRequest({ agentId: "a1" })
    );
  });

  it("delegates config.get to the gateway port", async () => {
    const gatewayPort = {
      invoke: vi.fn().mockResolvedValue({ config: {}, hash: "h" })
    };
    const adapter = new OpenClawAgentsGatewayAdapter(gatewayPort);

    await adapter.getConfig();

    expect(gatewayPort.invoke).toHaveBeenCalledWith(
      createConfigGetRequest()
    );
  });

  it("delegates config.patch to the gateway port", async () => {
    const gatewayPort = {
      invoke: vi.fn().mockResolvedValue({ ok: true })
    };
    const adapter = new OpenClawAgentsGatewayAdapter(gatewayPort);

    await adapter.patchConfig({ raw: "{}", baseHash: "h" });

    expect(gatewayPort.invoke).toHaveBeenCalledWith(
      createConfigPatchRequest({
        raw: "{}",
        baseHash: "h"
      })
    );
  });
});

describe("createSkillsStatusRequest", () => {
  it("builds the skills.status JSON RPC frame", () => {
    expect(createSkillsStatusRequest({ agentId: "a1" })).toEqual({
      type: "req",
      method: "skills.status",
      params: {
        agentId: "a1"
      }
    });
  });

  it("supports querying global skills without agentId", () => {
    expect(createSkillsStatusRequest()).toEqual({
      type: "req",
      method: "skills.status",
      params: {}
    });
  });
});

describe("normalizeSkillStatusEntries", () => {
  it("joins top-level installRoot with skillKey when entry has no path", () => {
    expect(
      normalizeSkillStatusEntries({
        installRoot: "/data/openclaw/skills-root",
        skills: [{ skillKey: "weather", enabled: true }]
      })
    ).toEqual([
      {
        skillKey: "weather",
        name: "weather",
        description: undefined,
        enabled: true,
        skillPath: path.join("/data/openclaw/skills-root", "weather")
      }
    ]);
  });

  it("retains upstream skillOriginType when provided by the gateway", () => {
    expect(
      normalizeSkillStatusEntries([
        {
          skillKey: "planner",
          skillOriginType: "workspace"
        }
      ])
    ).toEqual([
      {
        skillKey: "planner",
        name: "planner",
        description: undefined,
        enabled: undefined,
        skillOriginType: "workspace"
      }
    ]);
  });

  it("parses baseDir and filePath fields from the gateway payload", () => {
    expect(
      normalizeSkillStatusEntries({
        workspaceDir: "/Users/test/.openclaw/workspace",
        managedSkillsDir: "/Users/test/.openclaw/skills",
        skills: [
          {
            skillKey: "feishu-doc",
            baseDir: "/repo/extensions/feishu/skills/feishu-doc",
            filePath: "/repo/extensions/feishu/skills/feishu-doc/SKILL.md"
          }
        ]
      })
    ).toEqual([
      {
        skillKey: "feishu-doc",
        name: "feishu-doc",
        description: undefined,
        enabled: undefined,
        skillPath: "/repo/extensions/feishu/skills/feishu-doc"
      }
    ]);
  });

  it("reads nested meta.path for skill directory", () => {
    expect(
      normalizeSkillStatusEntries({
        skills: [
          {
            skillKey: "k",
            enabled: true,
            meta: { path: "/repo/skills/k" }
          }
        ]
      })
    ).toEqual([
      {
        skillKey: "k",
        name: "k",
        description: undefined,
        enabled: true,
        skillPath: "/repo/skills/k"
      }
    ]);
  });

  it("ignores envelope-only keys when falling back to keyed map", () => {
    expect(
      normalizeSkillStatusEntries({
        installRoot: "/r",
        bins: [{ name: "b", path: "/bin" }],
        diagnostics: []
      })
    ).toEqual([]);
  });

  it("uses first bins[].path as install root when installRoot is absent", () => {
    expect(
      normalizeSkillStatusEntries({
        bins: [{ name: "default", path: "/gw/store" }],
        skills: [{ skillKey: "weather", enabled: true }]
      })
    ).toEqual([
      {
        skillKey: "weather",
        name: "weather",
        description: undefined,
        enabled: true,
        skillPath: path.join("/gw/store", "weather")
      }
    ]);
  });

  it("captures filesystem paths from gateway payloads", () => {
    expect(
      normalizeSkillStatusEntries([
        {
          skillKey: "a",
          path: "/tmp/skills/a",
          enabled: true
        }
      ])
    ).toEqual([
      {
        skillKey: "a",
        name: "a",
        description: undefined,
        enabled: true,
        skillPath: "/tmp/skills/a"
      }
    ]);
  });

  it("normalizes array payloads", () => {
    expect(
      normalizeSkillStatusEntries([
        {
          skillKey: "planner",
          name: "planner",
          description: undefined,
          enabled: true
        },
        {
          key: "writer",
          desc: "writer skill",
          disabled: false
        }
      ])
    ).toEqual([
      {
        skillKey: "planner",
        name: "planner",
        description: undefined,
        enabled: true
      },
      {
        skillKey: "writer",
        name: "writer",
        description: "writer skill",
        enabled: true
      }
    ]);
  });

  it("normalizes keyed object payloads", () => {
    expect(
      normalizeSkillStatusEntries({
        planner: {
          enabled: true
        },
        writer: false
      })
    ).toEqual([
      {
        skillKey: "planner",
        name: "planner",
        description: undefined,
        enabled: true
      },
      {
        skillKey: "writer",
        name: "writer",
        description: undefined,
        enabled: false
      }
    ]);
  });
});
