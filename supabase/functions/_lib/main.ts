import dotenv from "dotenv";
import GitHubClient from "./clients/GitHubClient.ts";
import HuggingFaceClient from "./clients/HuggingFaceClient.ts";

// Load environment variables from .env file
dotenv.config();

function getCommitsLast24Hours(commits: any[]): any[] {
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  return commits.filter((commit) => {
    const commitDate = new Date(commit.commit.author.date);
    return commitDate > oneDayAgo;
  });
}

function concatenateCommitMessages(commits: any[]): string {
  return commits.map((commit) => commit.commit.message).join("\n");
}

function generateLLMPrompt(
  repoName: string,
  commitMessages: string,
  commitMetadata: string
): string {
  return `
    You are a helpful assistant tasked with summarizing the work done in a GitHub repository.

    **Repository Name:** ${repoName}

    **Recent Commit Messages (last 24 hours):**
    ${commitMessages}

    **Commit Metadata:**
    ${commitMetadata}

    Please provide a summary of the changes made in this repository in simple terms.
  `;
}

async function main() {
  const githubUsername = process.env.GITHUB_USERNAME;
  const repoName = process.env.GITHUB_REPO;
  const llmModel = process.env.LLM_MODEL;

  if (!githubUsername) {
    console.error("Error: GITHUB_USERNAME is not set in the .env file.");
    return;
  }

  if (!repoName) {
    console.error("Error: GITHUB_REPO is not set in the .env file.");
    return;
  }

  if (!llmModel) {
    console.error("Error: LLM_MODEL is not set in the .env file.");
    return;
  }

  // Initialize clients
  const githubClient = new GitHubClient();
  const hfClient = new HuggingFaceClient();

  try {
    // Step 1: Get repositories with recent activity
    console.log(`Fetching repositories with recent activity for user '${githubUsername}'...`);
    const recentRepos = await githubClient.getRecentActivityRepos(githubUsername);

    if (recentRepos.length === 0) {
      console.log(`No repositories with recent activity found for '${githubUsername}'. Exiting.`);
      return;
    }

    console.log(`Found ${recentRepos.length} repositories with recent activity:`);
    recentRepos.forEach((repo) => console.log(`- ${repo}`));

    // Step 2: Process each repository with recent activity
    let allRecentCommits: any[] = [];
    for (const repoFullName of recentRepos) {
      console.log(`\nFetching commits for repository '${repoFullName}'...`);
      const commits = await githubClient.listRepositoryCommits(repoFullName);
      const recentCommits = getCommitsLast24Hours(commits);
      allRecentCommits = allRecentCommits.concat(recentCommits);
    }

    if (allRecentCommits.length === 0) {
      console.log("No commits found in the last 24 hours. Exiting.");
      return;
    }

    console.log(`\nFound a total of ${allRecentCommits.length} recent commits across all repositories.`);

    // Step 3: Concatenate commit messages
    const commitMessages = concatenateCommitMessages(allRecentCommits);

    // Step 4: Collect additional commit metadata
    const commitMetadata = allRecentCommits
      .map(
        (commit) =>
          `SHA: ${commit.sha} | Author: ${commit.commit.author.name} | Date: ${commit.commit.author.date}`
      )
      .join("\n");

    // Step 5: Generate prompt for the LLM
    const prompt = generateLLMPrompt(repoName, commitMessages, commitMetadata);
    console.log("\nGenerated Prompt for LLM:\n", prompt);

    // Step 6: Call the Hugging Face LLM to generate the summary
    console.log("\nGenerating LLM summary...");
    const messages = [
      {
        role: "system",
        content: "You are a helpful assistant tasked with summarizing the work done in a GitHub repository.",
      },
      { role: "user", content: prompt },
    ];

    // Fetch the full response directly
    const response = await hfClient.chatCompletion(
      llmModel,
      messages, // The array of system and user messages
      300 // maxTokens value
    );

    // Print the LLM-generated summary
    console.log("\nLLM Summary of Work Done:");
    console.log(response.choices[0].message.content);
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the main function
main();
