import { Probot } from "probot";

export = (app: Probot) => {
  app.on("pull_request.opened", async (context) => {
    const pr = context.pullRequest();
    const issue = context.issue();

    const files = await context.octokit.pulls.listFiles(pr);
    console.log("Got files", files);

    const commits = await context.octokit.pulls.listCommits(pr);
    console.log("Got commits", commits);
    const commit_id = commits.data.pop()?.sha;
    if (!commit_id) {
      console.warn("No commits - need commit id to comment");
      return;
    }

    const body = files.data.map((f) => f.filename).join("\n");
    await context.octokit.issues.createComment({
      ...pr,
      issue_number: issue.issue_number,
      body,
    });
  });
  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
