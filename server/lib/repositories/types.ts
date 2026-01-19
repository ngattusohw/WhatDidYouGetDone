import { OwnerType } from "../../../src/generated/prisma";

export interface RepoInfo {
  fullName: string;
  owner: string;
  name: string;
}

export interface RepoMetadata {
  description: string | null;
  language: string | null;
  isPrivate: boolean;
  htmlUrl: string;
  ownerType: OwnerType;
}

export interface ActivityUpdate {
  type: "commit" | "pr" | "issue";
  timestamp: Date;
}

export interface RepoActivityMetrics {
  totalCommits: number;
  totalPRs: number;
  totalIssues: number;
  firstActivityAt: Date | null;
  lastActivityAt: Date | null;
}
