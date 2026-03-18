import { describe, expect, it, vi } from "vitest";

import {
  DefaultOpenClawAgentsService,
  createAgentsListRequest
} from "./openclaw-agents-service";

describe("createAgentsListRequest", () => {
  it("builds the agents.list JSON RPC frame", () => {
    expect(createAgentsListRequest("req-2")).toEqual({
      type: "req",
      id: "req-2",
      method: "agents.list",
      params: {}
    });
  });
});

describe("DefaultOpenClawAgentsService", () => {
  it("delegates agents.list to the shared gateway client", async () => {
    const gatewayClient = {
      invoke: vi.fn().mockResolvedValue({
        defaultId: "main",
        mainKey: "sender",
        scope: "per-sender",
        agents: []
      })
    };
    const service = new DefaultOpenClawAgentsService(gatewayClient as never);

    await expect(service.listAgents()).resolves.toEqual({
      defaultId: "main",
      mainKey: "sender",
      scope: "per-sender",
      agents: []
    });
    expect(gatewayClient.invoke).toHaveBeenCalledOnce();
  });
});
