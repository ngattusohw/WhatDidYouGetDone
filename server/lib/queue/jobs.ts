import { integrationQueue, backfillQueue, summaryQueue } from "./queues";

export interface IntegrationRunOptions {
  force?: boolean;
}

export async function enqueueIntegrationRun(
  integrationId: string,
  options?: IntegrationRunOptions
) {
  return integrationQueue.add("run-integration", {
    integrationId,
    force: options?.force ?? false,
  });
}

export async function enqueueBackfill(integrationId: string) {
  return backfillQueue.add("backfill", { integrationId });
}

export async function enqueueSummaryGeneration(
  userId: string,
  weekStart: string,
  template: string
) {
  return summaryQueue.add("generate-summary", {
    userId,
    weekStart,
    template,
  });
}
