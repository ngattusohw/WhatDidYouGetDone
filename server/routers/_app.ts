import { createTRPCRouter } from "../trpc";
import { integrationsRouter } from "./integrations";
import { summariesRouter } from "./summaries";
import { oauthRouter } from "./oauth";
import { repositoriesRouter } from "./repositories";

export const appRouter = createTRPCRouter({
  integrations: integrationsRouter,
  summaries: summariesRouter,
  oauth: oauthRouter,
  repositories: repositoriesRouter,
});

export type AppRouter = typeof appRouter;
