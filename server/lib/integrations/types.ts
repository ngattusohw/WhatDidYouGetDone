import { z } from "zod";

// ============================================
// Integration Categories
// ============================================

export type IntegrationCategory =
  | "DEVELOPMENT"
  | "SOCIAL"
  | "COMMUNICATION"
  | "PRODUCTIVITY"
  | "CUSTOM";

// ============================================
// Scheduling
// ============================================

export type ScheduleType = "cron" | "interval" | "manual";

export interface ScheduleConfig {
  type: ScheduleType;
  cron?: string;
  interval?: number; // seconds
}

export interface ScheduleConstraints {
  minFrequencySeconds: number;
  maxFrequencySeconds?: number;
  defaultFrequencySeconds: number;
  allowCron: boolean;
}

// ============================================
// Data Fetching
// ============================================

export interface FetchContext {
  startDate?: Date;
  endDate?: Date;
  lastState?: Record<string, unknown>;
  isBackfill?: boolean;
}

export interface FetchResult {
  dataPoints: MetricDataPoint[];
  newState?: Record<string, unknown>;
  deduplicationKey?: (point: MetricDataPoint) => string;
}

export interface MetricDataPoint {
  metricKey: string;
  value: unknown;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// ============================================
// Metrics Definition
// ============================================

export interface MetricDefinition {
  key: string;
  name: string;
  type: "number" | "string" | "boolean" | "object";
  unit?: string;
  description?: string;
}

// ============================================
// OAuth
// ============================================

export interface OAuthCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  tokenData?: Record<string, unknown>;
}

export interface CredentialsFormProps {
  onCredentialsChange: (credentials: Record<string, unknown> | null) => void;
  onValidate?: (isValid: boolean) => void;
}

// ============================================
// Backfill
// ============================================

export interface BackfillConfig {
  daysBack: number;
  chunkSizeDays?: number;
}

// ============================================
// Integration Plugin Interface
// ============================================

export interface IntegrationPlugin<TConfig = Record<string, unknown>> {
  // Metadata
  slug: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  icon?: string;

  // OAuth
  requiresOAuth: boolean;
  oauthProvider?: string;

  // Schemas - use ZodType with any to allow defaults
  configSchema: z.ZodType<TConfig, z.ZodTypeDef, any>;
  metricSchema: MetricDefinition[];

  // Scheduling
  getScheduleConfig(): ScheduleConfig;
  getScheduleConstraints(): ScheduleConstraints;

  // Backfill support
  supportsBackfill: boolean;
  getBackfillConfig?(): BackfillConfig;

  // Core data fetching
  fetchData(
    config: TConfig,
    credentials?: OAuthCredential,
    context?: FetchContext,
    integrationId?: string
  ): Promise<FetchResult>;

  // OAuth handling (if requiresOAuth is true)
  getOAuthUrl?(config: TConfig, state: string, redirectUri: string): string;
  handleOAuthCallback?(
    code: string,
    state: string,
    redirectUri: string
  ): Promise<OAuthCredential>;
  refreshToken?(credential: OAuthCredential): Promise<OAuthCredential>;

  // Validation
  validateConfig(config: TConfig): Promise<boolean>;
}

// ============================================
// Runner Types
// ============================================

export interface RunIntegrationResult {
  status: "fetched" | "skipped" | "error";
  reason?: string;
  metricsInserted?: number;
}

export interface RunIntegrationOptions {
  force?: boolean;
}

// ============================================
// Type Helpers
// ============================================

export type IntegrationPluginConstructor = new () => IntegrationPlugin;
