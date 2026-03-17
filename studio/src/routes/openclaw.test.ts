import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { createOpenClawRouter } from "./openclaw";

/**
 * Creates a minimal mock response object for router handler tests.
 *
 * @returns A response double with chainable status and json methods.
 */
function createResponseDouble(): Response {
  const response = {
    status: vi.fn(),
    json: vi.fn()
  } as unknown as Response;

  vi.mocked(response.status).mockReturnValue(response);

  return response;
}

describe("createOpenClawRouter", () => {
  it("wires GET /api/openclaw/agents to the shared handler", async () => {
    const client = {
      listAgents: vi.fn().mockResolvedValue({
        defaultId: "main",
        mainKey: "sender",
        scope: "per-sender",
        agents: []
      })
    };
    const router = createOpenClawRouter(client) as {
      stack: Array<{
        route?: {
          path: string;
          stack: Array<{
            handle: (
              request: Request,
              response: Response,
              next: NextFunction
            ) => Promise<void>;
          }>;
        };
      }>;
    };
    const layer = router.stack.find(
      (entry) => entry.route?.path === "/api/openclaw/agents"
    );

    expect(layer).toBeDefined();

    const response = createResponseDouble();
    await layer?.route?.stack[0]?.handle(
      {} as Request,
      response,
      vi.fn<NextFunction>()
    );

    expect(client.listAgents).toHaveBeenCalledOnce();
    expect(response.status).toHaveBeenCalledWith(200);
  });
});
