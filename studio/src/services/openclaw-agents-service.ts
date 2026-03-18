import {
  OpenClawGatewayClient
} from "../infra/openclaw-gateway-client";
import type {
  OpenClawAgentsListResult,
  OpenClawRequestFrame
} from "../types/openclaw";

/**
 * Defines the business capability used to read OpenClaw agents.
 */
export interface OpenClawAgentsService {
  /**
   * Fetches the current OpenClaw agent list.
   *
   * @returns The OpenClaw `AgentsListResult` payload.
   */
  listAgents(): Promise<OpenClawAgentsListResult>;
}

/**
 * Creates the OpenClaw `agents.list` request.
 *
 * @param requestId The frame correlation id.
 * @returns A serialized OpenClaw request frame.
 */
export function createAgentsListRequest(
  requestId: string
): OpenClawRequestFrame {
  return {
    type: "req",
    id: requestId,
    method: "agents.list",
    params: {}
  };
}

/**
 * Implements the OpenClaw agents use case on top of the shared gateway client.
 */
export class DefaultOpenClawAgentsService implements OpenClawAgentsService {
  /**
   * Creates the agents service.
   *
   * @param gatewayClient The shared OpenClaw gateway client.
   */
  public constructor(private readonly gatewayClient: OpenClawGatewayClient) {}

  /**
   * Queries `agents.list` over the shared OpenClaw gateway connection.
   *
   * @returns The OpenClaw `AgentsListResult` payload.
   */
  public async listAgents(): Promise<OpenClawAgentsListResult> {
    return this.gatewayClient.invoke(
      createAgentsListRequest,
      (frame) => frame.payload as OpenClawAgentsListResult
    );
  }
}
