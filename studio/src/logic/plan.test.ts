import { describe, expect, it, vi } from "vitest";

import { DefaultCronLogic } from "./plan";

describe("DefaultCronLogic", () => {
  it("delegates listCronJobs to the adapter", async () => {
    const logic = new DefaultCronLogic({
      listCronJobs: vi.fn().mockResolvedValue({
        jobs: [],
        total: 0,
        offset: 0,
        limit: 50,
        hasMore: false,
        nextOffset: null
      }),
      listCronRuns: vi.fn()
    });

    await expect(
      logic.listCronJobs({
        includeDisabled: true,
        limit: 50,
        offset: 0,
        enabled: "all",
        sortBy: "nextRunAtMs",
        sortDir: "asc"
      })
    ).resolves.toEqual({
      jobs: [],
      total: 0,
      offset: 0,
      limit: 50,
      hasMore: false,
      nextOffset: null
    });
  });

  it("filters cron jobs by session user id", async () => {
    const listCronJobs = vi.fn().mockResolvedValue({
      jobs: [
        {
          id: "job-1",
          agentId: "dh-1",
          sessionKey: "agent:dh-1:user:user-1:direct:chat-1",
          name: "Job 1",
          enabled: true,
          createdAtMs: 1,
          updatedAtMs: 2,
          schedule: {
            expr: "0 9 * * *",
            tz: "Asia/Shanghai"
          }
        },
        {
          id: "job-2",
          agentId: "dh-1",
          sessionKey: "agent:dh-1:user:user-2:direct:chat-2",
          name: "Job 2",
          enabled: true,
          createdAtMs: 1,
          updatedAtMs: 2,
          schedule: {
            expr: "0 10 * * *",
            tz: "Asia/Shanghai"
          }
        },
        {
          id: "job-3",
          agentId: "dh-2",
          sessionKey: "invalid-session-key",
          name: "Job 3",
          enabled: true,
          createdAtMs: 1,
          updatedAtMs: 2,
          schedule: {
            expr: "0 11 * * *",
            tz: "Asia/Shanghai"
          }
        }
      ],
      total: 3,
      offset: 0,
      limit: 50,
      hasMore: false,
      nextOffset: null
    });
    const logic = new DefaultCronLogic({
      listCronJobs,
      listCronRuns: vi.fn()
    });

    await expect(
      logic.listCronJobs({
        includeDisabled: true,
        limit: 50,
        offset: 0,
        enabled: "all",
        sortBy: "nextRunAtMs",
        sortDir: "asc",
        userId: "user-1"
      })
    ).resolves.toEqual({
      jobs: [
        {
          id: "job-1",
          agentId: "dh-1",
          sessionKey: "agent:dh-1:user:user-1:direct:chat-1",
          name: "Job 1",
          enabled: true,
          createdAtMs: 1,
          updatedAtMs: 2,
          schedule: {
            expr: "0 9 * * *",
            tz: "Asia/Shanghai"
          }
        }
      ],
      total: 1,
      offset: 0,
      limit: 1,
      hasMore: false,
      nextOffset: null
    });
    expect(listCronJobs).toHaveBeenCalledWith({
      includeDisabled: true,
      limit: 50,
      offset: 0,
      enabled: "all",
      sortBy: "nextRunAtMs",
      sortDir: "asc"
    });
  });

  it("delegates listCronRuns to the adapter", async () => {
    const logic = new DefaultCronLogic({
      listCronJobs: vi.fn(),
      listCronRuns: vi.fn().mockResolvedValue({
        entries: [],
        total: 0,
        offset: 0,
        limit: 50,
        hasMore: false,
        nextOffset: null
      })
    });

    await expect(
      logic.listCronRuns({
        id: "job-1",
        limit: 50,
        offset: 0,
        sortDir: "desc"
      })
    ).resolves.toEqual({
      entries: [],
      total: 0,
      offset: 0,
      limit: 50,
      hasMore: false,
      nextOffset: null
    });
  });
});
