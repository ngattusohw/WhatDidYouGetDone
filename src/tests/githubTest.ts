import GitHubClient from "../clients/GitHubClient";
import * as dotenv from "dotenv";

dotenv.config();

(async () => {
  const client = new GitHubClient();

  try {
    const username = process.env.GITHUB_USERNAME!;
    if (!username) {
      throw new Error("GITHUB_USERNAME is not set in the .env file.");
    }

    // Step 1: List all repositories
    console.log(`Fetching all repositories for user: ${username}`);
    const allRepos = await client.listUserRepositories(username, false);
    console.log(`All Repositories (${allRepos.length}):`, allRepos);

    // Step 2: List repositories with recent activity
    console.log(`\nFetching repositories with recent activity for user: ${username}`);
    const recentDays = parseInt(process.env.RECENT_DAYS || "3", 10);
    const recentRepos = await client.getRecentActivityRepos(username, recentDays);
    console.log(`Recent activity repositories (${recentDays} days):`, recentRepos);
  } catch (error) {
    console.error("Error:", error);
  }
})();
