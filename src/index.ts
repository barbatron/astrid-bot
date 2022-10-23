import { Probot } from "probot";

const labelsByRepo = new Map<string, Map<string, object>>();

type PullEventNames =
  | "pull_request.opened"
  | "pull_request.reopened"
  | "pull_request.synchronize";

export default (app: Probot) => {
  app.on("issues.opened", async (context) => {
    console.log("Issue opened :D");
    const issueComment = context.issue({
      body: "Thanks for opening this issue!",
    });
    console.log("Creating comment");
    await context.octokit.issues.createComment(issueComment);
    console.log("Done");
  });

  const pullEventNames: PullEventNames[] = [
    "pull_request.opened",
    "pull_request.reopened",
    "pull_request.synchronize",
  ];

  pullEventNames.forEach((eventName: PullEventNames) =>
    app.on(eventName, async (context) => {
      console.log("*", context.name);
      const pr = context.pullRequest();
      const issue = context.issue();
      console.log("Issue info", issue);

    const issue = context.issue();
    console.log("Issue info", issue);

    // App labels
    const files = await context.octokit.pulls.listFiles(pr);
    const appLabels = Array.from(
      new Set(
        files.data
          // Only files matching /app/xyz/something
          .filter((f) => /^app\/(.*?)\/.*$/.test(f.filename))
          // Split on slash, extract 2nd = app name
          .map((f) => f.filename.split("/")[1])
      ).values()
    ).map((l) => `app:${l}`);

    const allLabels = [...appLabels];
    if (!allLabels.length) return;

    // Get/cache repo labels
    const repoLabels = await (async () => {
      const key = `${pr.owner}/${pr.repo}`;
      if (labelsByRepo.has(key)) return labelsByRepo.get(key);
      const labels = await context.octokit.request(
        "GET /repos/{owner}/{repo}/labels",
        {
          owner: pr.owner,
          repo: pr.repo,
        }
      );
      const labelsByName = new Map<string, typeof labels.data[0]>(
        labels.data.map((label) => [label.name, label])
      );
      labelsByRepo.set(key, labelsByName);
      return labelsByName;
    })();

    const labelsToCreate = allLabels.filter((l) => !repoLabels?.has(l));
    console.log("Labels to create:", labelsToCreate);

    for (const labelToCreate of labelsToCreate) {
      const name = `app:${labelToCreate}`;
      console.log("Creating label:", name);
      await context.octokit.request("POST /repos/{owner}/{repo}/labels", {
        owner: pr.owner,
        repo: pr.repo,
        name,
        description: `Files under app/${labelToCreate}`,
      });
    }

    // TODO: Check first if PR has labels already, only set missings

    console.log("Setting PR labels", allLabels);
    await context.octokit.issues.setLabels({
      owner: pr.owner,
      repo: pr.repo,
      issue_number: pr.pull_number,
      labels: allLabels,
    });

    // console.log("Writing comment");
    // await context.octokit.issues.createComment({
    //   ...issue,
    //   body,
    // });
  });
};
