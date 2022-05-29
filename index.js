const github = require("@actions/github");
const core = require('@actions/core');

async function run() {
  try {
    const token = core.getInput("github-token");
    const octokit = new github.getOctokit(token);
    const payload = github.context.payload;
    const repo = payload.repository.name;
    const owner = payload.repository.owner.login;
    const pullRequestNumber = payload.number;

    if (pullRequestNumber === undefined) {
      core.warning("No pull request number in payload.");
      return;
    }

    const commits = await octokit.rest.pulls.listCommits({
      owner,
      repo,
      pull_number: pullRequestNumber,
    });

    const issueRegExp = new RegExp(core.getInput("commit-regexp"), "g");
    const issues = [];

    // Parse the associated issue numbers for the list of commits in the pull request.
    for (const { commit } of commits.data) {
      if (commit.message.startsWith("Revert")) {
        continue;
      }

      const result = issueRegExp[Symbol.matchAll](commit.message);
      const issueNumbers = Array.from(result, x => x[1]);

      for (const issueNumber of issueNumbers) {
        if (!issues.includes(issueNumber)) {
          issues.push(issueNumber);
        }
      }
    }

    if (!issues.length) {
      core.warning("No issue numbers found in commits.");
      return;
    }

    const pull = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullRequestNumber,
    });

    const section = core.getInput("section");
    const issuesList = issues.map(x => `Fixes #${x}`).join("\r\n");
    let body = pull.data.body;

    // Update the body content of the pull request with the list of issues that is fixed
    // in the pull request.
    if (body == null) {
      body = issuesList;
    } else if (section.length > 0 && body.includes(section)) {
      // Replace the pull request template section that with the list of fixed issues.
      body = body.substring(0, body.indexOf(section));
      body = body.concat("\r\n", section, "\r\n", issuesList);
    } else {
      body = body.concat("\r\n", issuesList);
    }

    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: pullRequestNumber,
      body
    });

    core.notice(`Added issues link to ${issues} in #${pullRequestNumber}.`);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
