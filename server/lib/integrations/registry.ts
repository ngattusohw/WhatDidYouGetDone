import { IntegrationPlugin, ScheduleType } from "./types";

class IntegrationRegistry {
  private plugins: Map<string, IntegrationPlugin> = new Map();

  register(plugin: IntegrationPlugin): void {
    if (this.plugins.has(plugin.slug)) {
      throw new Error(
        `Integration plugin "${plugin.slug}" is already registered`
      );
    }
    this.plugins.set(plugin.slug, plugin);
    console.log(`[Registry] Registered plugin: ${plugin.slug}`);
  }

  get(slug: string): IntegrationPlugin | undefined {
    return this.plugins.get(slug);
  }

  getAll(): IntegrationPlugin[] {
    return Array.from(this.plugins.values());
  }

  getAllByCategory(category: string): IntegrationPlugin[] {
    return this.getAll().filter((plugin) => plugin.category === category);
  }

  getByScheduleType(type: ScheduleType): IntegrationPlugin[] {
    return this.getAll().filter(
      (plugin) => plugin.getScheduleConfig().type === type
    );
  }

  has(slug: string): boolean {
    return this.plugins.has(slug);
  }

  getSlugs(): string[] {
    return Array.from(this.plugins.keys());
  }
}

export const integrationRegistry = new IntegrationRegistry();

// Register all plugins
import { GitHubPlugin } from "./github/plugin";
import { LinearPlugin } from "./linear/plugin";
import { TwitterPlugin } from "./twitter/plugin";

integrationRegistry.register(new GitHubPlugin());
integrationRegistry.register(new LinearPlugin());
integrationRegistry.register(new TwitterPlugin());

console.log(
  `[Registry] Registered ${integrationRegistry.getSlugs().length} plugins: ${integrationRegistry
    .getSlugs()
    .join(", ")}`
);
