import { Probot } from "probot";

const labelsByRepo = new Map<string, Map<string, object>>();

export = (app: Probot) => {
  app.on("issues.opened", async (context) => {
    console.log("Issue opened :D");
    const issueComment = context.issue({
      body: "Thanks for opening this issue!",
    });
    console.log("Creating comment");
    await context.octokit.issues.createComment(issueComment);
    console.log("Done");
  });

  app.on("pull_request.synchronize", async (context) => {
    console.log("pull_request.opened");

    const pr = context.pullRequest();
    console.log("Pull request opened!", pr);

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