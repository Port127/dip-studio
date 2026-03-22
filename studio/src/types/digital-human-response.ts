/**
 * Describes the request body accepted by the digital human response endpoint.
 */
export interface DigitalHumanResponseRequest {
  /**
   * Free-form Open Response style payload forwarded to OpenClaw.
   */
  [key: string]: unknown;
}

/**
 * Describes the request headers accepted by the digital human response endpoint.
 */
export interface DigitalHumanResponseRequestHeaders {
  /**
   * Authenticated user identifier injected by the auth middleware.
   */
  "x-user-id"?: string;

  /**
   * Optional OpenClaw session key passed through to the upstream gateway.
   */
  "x-openclaw-session-key"?: string;
}

/**
 * Describes the payload forwarded to OpenClaw `/v1/responses`.
 */
export interface OpenClawResponsesRequest extends DigitalHumanResponseRequest {
  /**
   * The target OpenClaw agent model identifier.
   */
  model: string;

  /**
   * Forces OpenClaw to return an event stream.
   */
  stream: true;
}
