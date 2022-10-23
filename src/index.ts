import { Probot } from "probot";

// Label cache
const labelsByRepo = new Map<string, Map<string, object>>();

const baseBranchLabels: [RegExp, string][] = [
  [/^develop$/, "develop"],
  [/^new-master$/, "production"],
];

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

      // App labels
      const files = await context.octokit.pulls.listFiles(pr);
      const filenames = files.data.map((f) => f.filename);

      const appLabels = Array.from(
        new Set(
          filenames
            // Only files matching /app/xyz/something
            .filter((f) => /^app\/(.*?)\/.*$/.test(f))
            // Split on slash, extract 2nd = app name
            .map((f) => f.split("/")[1])
        ).values()
      ).map((l) => `app: ${l}`);
      console.log("App labels", appLabels);

      // Repo root k8s labels
      const k8sLabels = filenames.some((f) => /^k8s-?.*?\//.test(f))
        ? ["k8s"]
        : [];

      // Base branch labels
      const { data: pullRequest } = await context.octokit.pulls.get(pr);
      const targetLabels = baseBranchLabels
        .filter(([expr]) => expr.test(pullRequest.base.ref))
        .map(([, label]) => label);

      const botLabels = [...appLabels, ...k8sLabels, ...targetLabels];
      if (!botLabels.length) return;

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

      const labelsToCreate = botLabels.filter((l) => !repoLabels?.has(l));
      console.log("Labels to create:", labelsToCreate);

      for (const name of labelsToCreate) {
        console.log("Creating label:", name);
        const description = `Files under app/${name.split(":").pop()}`;
        const label = await context.octokit.request(
          "POST /repos/{owner}/{repo}/labels",
          {
            owner: pr.owner,
            repo: pr.repo,
            name,
            description,
          }
        );
        // Add to cache
        repoLabels?.set(label.data.name, label.data);
      }

      console.log("Fetching existing labels on issue");
      const existingLabels = await context.octokit.issues.listLabelsOnIssue(
        issue
      );
      const existingLabelNames = existingLabels.data.map((label) => label.name);

      // If all (wanted) already exist, bail:
      if (botLabels.every((l) => existingLabelNames.includes(l))) return;

      // Union existing + bot labels
      const issueLabels = Array.from(
        new Set([...existingLabelNames, ...botLabels]).values()
      );

      console.log("Updating PR labels", issueLabels);
      await context.octokit.issues.setLabels({
        owner: pr.owner,
        repo: pr.repo,
        issue_number: pr.pull_number,
        labels: issueLabels,
      });
    })
  );
};
