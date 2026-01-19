import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import {
  IntegrationPlugin,
  FetchResult,
  ScheduleConfig,
  MetricDefinition,
} from "../../server/lib/integrations/types";

// Create a fresh registry for testing (don't use the singleton)
class TestIntegrationRegistry {
  private plugins: Map<string, IntegrationPlugin> = new Map();

  register(plugin: IntegrationPlugin): void {
    if (this.plugins.has(plugin.slug)) {
      throw new Error(`Integration plugin "${plugin.slug}" is already registered`);
    }
    this.plugins.set(plugin.slug, plugin);
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

  has(slug: string): boolean {
    return this.plugins.has(slug);
  }

  clear(): void {
    this.plugins.clear();
  }
}

// Mock plugin for testing
class MockPlugin implements IntegrationPlugin {
  slug = "mock";
  name = "Mock Plugin";
  description = "A mock plugin for testing";
  category = "DEVELOPMENT" as const;
  requiresOAuth = false;
  supportsBackfill = false;
  configSchema = z.object({});
  metricSchema: MetricDefinition[] = [];

  getScheduleConfig(): ScheduleConfig {
    return { type: "interval", interval: 300 };
  }

  getScheduleConstraints() {
    return {
      minFrequencySeconds: 60,
      maxFrequencySeconds: 3600,
      defaultFrequencySeconds: 300,
      allowCron: false,
    };
  }

  async fetchData(): Promise<FetchResult> {
    return { dataPoints: [] };
  }

  async validateConfig(): Promise<boolean> {
    return true;
  }
}

describe("Integration Registry", () => {
  let registry: TestIntegrationRegistry;

  beforeEach(() => {
    registry = new TestIntegrationRegistry();
  });

  describe("register", () => {
    it("should register a plugin", () => {
      const plugin = new MockPlugin();
      registry.register(plugin);

      expect(registry.has("mock")).toBe(true);
    });

    it("should throw error when registering duplicate plugin", () => {
      const plugin1 = new MockPlugin();
      const plugin2 = new MockPlugin();

      registry.register(plugin1);
      expect(() => registry.register(plugin2)).toThrow(
        'Integration plugin "mock" is already registered'
      );
    });
  });

  describe("get", () => {
    it("should return registered plugin", () => {
      const plugin = new MockPlugin();
      registry.register(plugin);

      const retrieved = registry.get("mock");
      expect(retrieved).toBe(plugin);
    });

    it("should return undefined for unregistered plugin", () => {
      const retrieved = registry.get("nonexistent");
      expect(retrieved).toBeUndefined();
    });
  });

  describe("getAll", () => {
    it("should return all registered plugins", () => {
      const plugin1 = new MockPlugin();
      plugin1.slug = "plugin1";
      const plugin2 = new MockPlugin();
      plugin2.slug = "plugin2";

      registry.register(plugin1);
      registry.register(plugin2);

      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContain(plugin1);
      expect(all).toContain(plugin2);
    });

    it("should return empty array when no plugins registered", () => {
      const all = registry.getAll();
      expect(all).toHaveLength(0);
    });
  });

  describe("getAllByCategory", () => {
    it("should filter plugins by category", () => {
      const devPlugin = new MockPlugin();
      devPlugin.slug = "dev1";
      devPlugin.category = "DEVELOPMENT";

      const socialPlugin = new MockPlugin();
      socialPlugin.slug = "social1";
      socialPlugin.category = "SOCIAL";

      registry.register(devPlugin);
      registry.register(socialPlugin);

      const devPlugins = registry.getAllByCategory("DEVELOPMENT");
      expect(devPlugins).toHaveLength(1);
      expect(devPlugins[0].slug).toBe("dev1");

      const socialPlugins = registry.getAllByCategory("SOCIAL");
      expect(socialPlugins).toHaveLength(1);
      expect(socialPlugins[0].slug).toBe("social1");
    });
  });

  describe("has", () => {
    it("should return true for registered plugin", () => {
      registry.register(new MockPlugin());
      expect(registry.has("mock")).toBe(true);
    });

    it("should return false for unregistered plugin", () => {
      expect(registry.has("mock")).toBe(false);
    });
  });
});
