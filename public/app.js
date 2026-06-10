const state = {
  view: "overview",
  tasks: [],
  submissions: [],
  selectedTaskId: null,
  taskSearch: "",
  taskSkill: "",
  submissionSearch: "",
  submissionTask: "",
  leaderboardTask: ""
};

const view = document.querySelector("#view");
const dialog = document.querySelector("#tryDialog");
const tryTitle = document.querySelector("#tryTitle");
const trySubtitle = document.querySelector("#trySubtitle");
const tryContent = document.querySelector("#tryContent");

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return response.json();
}

async function boot() {
  try {
    const [taskIndex, submissionIndex] = await Promise.all([
      loadJson("data/tasks.json"),
      loadJson("data/submissions.json")
    ]);
    state.tasks = taskIndex.tasks || [];
    state.submissions = submissionIndex.submissions || [];
    state.selectedTaskId = state.tasks[0]?.task_id || null;
    bindTabs();
    render();
  } catch (error) {
    view.innerHTML = `<div class="empty">Could not load dashboard data. Run <code>npm run build:index</code> and serve <code>public/</code>. ${escapeHtml(error.message)}</div>`;
  }
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      setView(button.dataset.view);
    });
  });
}

function setView(nextView) {
  state.view = nextView;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === nextView));
  render();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function uniqueSkills() {
  return [
    ...new Set(
      state.tasks.flatMap((task) => (task.skills || []).map((skill) => skill.name || skill.skill_id))
    )
  ].sort();
}

function selectedTask() {
  return state.tasks.find((task) => task.task_id === state.selectedTaskId) || state.tasks[0];
}

function filteredTasks() {
  const query = state.taskSearch.toLowerCase();
  return state.tasks.filter((task) => {
    const haystack = `${task.task_id} ${task.title} ${(task.tags || []).join(" ")} ${(task.skills || [])
      .map((skill) => `${skill.name} ${skill.skill_id}`)
      .join(" ")}`.toLowerCase();
    const skillOk = !state.taskSkill || (task.skills || []).some((skill) => (skill.name || skill.skill_id) === state.taskSkill);
    return haystack.includes(query) && skillOk;
  });
}

function render() {
  if (state.view === "submissions") renderSubmissions();
  else if (state.view === "leaderboard") renderLeaderboard();
  else if (state.view === "overview") renderOverview();
  else renderTasks();
}

function metricTotal(selector) {
  return state.submissions.reduce((sum, submission) => sum + Number(selector(submission) || 0), 0);
}

function renderOverview() {
  const taskCount = state.tasks.length;
  const submissionCount = state.submissions.length;
  const skills = uniqueSkills();
  const toolCalls = metricTotal((submission) => submission.metrics?.tool_calls?.total);
  const tokens = metricTotal((submission) => submission.metrics?.tokens?.total);
  const firstTask = state.tasks[0];
  view.innerHTML = `
    <section class="product-page">
      <div class="product-hero">
        <div class="hero-copy">
          <div class="eyebrow">Prompting skill, measured inside real agent sessions</div>
          <h2>Measure how well people steer agents through tasks.</h2>
          <p>Locked challenges capture the human side of agent work: prompt quality, re-prompts, tool choices, artifacts, time, tokens, dollars, and security hygiene.</p>
          <div class="hero-actions">
            <button id="startArena" class="primary">Browse challenges</button>
            <button id="openBoard" class="secondary dark">View leaderboard</button>
          </div>
          <div class="hero-metrics">
            <span><strong>${taskCount}</strong> tasks</span>
            <span><strong>${skills.length}</strong> skills</span>
            <span><strong>${submissionCount}</strong> submissions</span>
          </div>
        </div>
        <div class="hero-visual" aria-label="Arena product preview">
          <div class="visual-top">
            <span></span><span></span><span></span>
            <strong>operator-attempt.v0</strong>
          </div>
          <div class="visual-grid">
            <div class="score-dial">
              <span>${submissionCount ? "LIVE" : "V0"}</span>
              <strong>${submissionCount ? Math.min(99, 70 + submissionCount) : 92}</strong>
              <small>task completion score</small>
            </div>
            <div class="signal-list">
              <div><span>prompting</span><strong>rubric scored</strong></div>
              <div><span>tokens</span><strong>${tokens || "bucketed"}</strong></div>
              <div><span>tool calls</span><strong>${toolCalls || "counted"}</strong></div>
              <div><span>submit</span><strong>GitHub PR</strong></div>
            </div>
          </div>
          <div class="visual-command">/arena:start ${escapeHtml(firstTask?.task_id || "task-id")}</div>
        </div>
      </div>

      <div class="product-band">
        <article>
          <span class="feature-kicker">Task Bank</span>
          <h3>Locked prompts, expected outputs, artifact contracts.</h3>
          <p>Every challenge is structured JSON with skills, rubric, allowed interviewer answers, and required artifacts.</p>
        </article>
        <article>
          <span class="feature-kicker">Plugin Run</span>
          <h3>Codex and Claude are the interview rooms.</h3>
          <p>The plugin captures the operator attempt: session id, redacted transcript snippets, model, wall time, prompts, tools, tokens, and system metrics.</p>
        </article>
        <article>
          <span class="feature-kicker">PR Eval</span>
          <h3>Secretless evaluation on every submission PR.</h3>
          <p>GitHub Actions validates schemas, checks artifacts, scans redactions, computes scores, and rebuilds dashboard indexes.</p>
        </article>
      </div>

      <div class="disclosure-panel">
        <span class="feature-kicker">Data Sharing</span>
        <strong>Submissions are public when this repo is public.</strong>
        <p>PRs can include metrics, artifact paths, hashes, notes, and redacted transcript snippets. Redaction is best-effort. Review every PR diff before publishing sensitive work.</p>
      </div>

      <div class="challenge-strip">
        <div>
          <h3>Starter Challenges</h3>
          <p>Small tasks now. Harder task banks later.</p>
        </div>
        <div class="challenge-cards">
          ${state.tasks.map((task) => `
            <button class="challenge-card" data-open-task="${escapeHtml(task.task_id)}">
              <span>D${escapeHtml(task.difficulty)}</span>
              <strong>${escapeHtml(task.title)}</strong>
              <small>${(task.skills || []).slice(0, 2).map((skill) => escapeHtml(skill.name || skill.skill_id)).join(" · ")}</small>
            </button>
          `).join("")}
        </div>
      </div>
    </section>
  `;
  document.querySelector("#startArena").addEventListener("click", () => setView("tasks"));
  document.querySelector("#openBoard").addEventListener("click", () => setView("leaderboard"));
  document.querySelectorAll("[data-open-task]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTaskId = button.dataset.openTask;
      setView("tasks");
    });
  });
}

function renderTasks() {
  const task = selectedTask();
  if (!task) {
    view.innerHTML = `<div class="empty">No tasks yet.</div>`;
    return;
  }
  const skills = uniqueSkills();
  view.innerHTML = `
    <section class="task-layout">
      <aside class="sidebar">
        <div class="filters">
          <input id="taskSearch" type="search" placeholder="Search tasks" value="${escapeHtml(state.taskSearch)}" />
          <select id="taskSkill">
            <option value="">All skills</option>
            ${skills.map((skill) => `<option value="${escapeHtml(skill)}" ${skill === state.taskSkill ? "selected" : ""}>${escapeHtml(skill)}</option>`).join("")}
          </select>
        </div>
        <div class="task-list">
          ${filteredTasks().map(renderTaskRow).join("") || `<div class="empty">No matching tasks.</div>`}
        </div>
      </aside>
      ${renderTaskDetail(task)}
      ${renderInterviewer(task)}
    </section>
  `;
  document.querySelector("#taskSearch").addEventListener("input", (event) => {
    state.taskSearch = event.target.value;
    renderTasks();
  });
  document.querySelector("#taskSkill").addEventListener("change", (event) => {
    state.taskSkill = event.target.value;
    renderTasks();
  });
  document.querySelectorAll("[data-task-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTaskId = button.dataset.taskId;
      renderTasks();
    });
  });
  document.querySelector("#tryTask").addEventListener("click", () => openTryDialog(task));
  bindChat(task);
}

function renderTaskRow(task) {
  return `
    <button class="task-row ${task.task_id === state.selectedTaskId ? "is-selected" : ""}" data-task-id="${escapeHtml(task.task_id)}">
      <span class="row-title">${escapeHtml(task.title)}</span>
      <span class="row-meta">${escapeHtml(task.task_id)} · Difficulty ${escapeHtml(task.difficulty)}</span>
      <span class="tags">${(task.tags || []).slice(0, 4).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</span>
    </button>
  `;
}

function renderTaskDetail(task) {
  return `
    <article class="detail">
      <div class="detail-head">
        <div class="muted">${escapeHtml(task.task_id)} · Difficulty ${escapeHtml(task.difficulty)}</div>
        <h2>${escapeHtml(task.title)}</h2>
        <div class="skills">${(task.skills || []).map((skill) => `<span class="pill">${escapeHtml(skill.name || skill.skill_id)}</span>`).join("")}</div>
        <div class="detail-actions">
          <button id="tryTask" class="primary">Try this challenge</button>
          <button class="secondary" data-copy="/arena:start ${escapeHtml(task.task_id)}">Copy start command</button>
        </div>
      </div>
      <section class="section">
        <h3>Locked Task</h3>
        <div class="locked">${escapeHtml(task.prompt)}</div>
      </section>
      <section class="section">
        <h3>Expected Output</h3>
        <p>${escapeHtml(task.expected_output?.description || "")}</p>
        <ul>${(task.expected_output?.must_include || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>
      <section class="section">
        <h3>Artifacts</h3>
        <table class="artifact-table">
          <thead><tr><th>Path</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
          <tbody>
            ${(task.artifacts || []).map((artifact) => `
              <tr>
                <td><code>${escapeHtml(artifact.path)}</code></td>
                <td>${escapeHtml(artifact.type)}</td>
                <td>${artifact.required ? "Yes" : "No"}</td>
                <td>${escapeHtml(artifact.description)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
      <section class="section">
        <h3>Evaluation</h3>
        <div class="skills">
          ${Object.entries(task.evaluation?.weights || {}).map(([key, value]) => `<span class="pill">${escapeHtml(key)} ${Math.round(Number(value) * 100)}%</span>`).join("")}
        </div>
        <ul>${(task.evaluation?.rubric || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>
    </article>
  `;
}

function renderInterviewer(task) {
  return `
    <aside class="interviewer">
      <div class="interviewer-head">
        <h2>Interviewer</h2>
        <p class="muted">Answers only from this task definition.</p>
      </div>
      <div id="chatLog" class="chat-log">
        <div class="message bot">Ask one of the allowed task questions.</div>
      </div>
      <div class="chat-box">
        <select id="allowedQuestion">
          <option value="">Choose allowed question</option>
          ${(task.interviewer?.allowed_questions || []).map((question) => `<option value="${escapeHtml(question)}">${escapeHtml(question)}</option>`).join("")}
        </select>
        <textarea id="chatInput" rows="3" placeholder="Ask interviewer"></textarea>
        <button id="askQuestion" class="primary">Ask</button>
      </div>
    </aside>
  `;
}

function bindChat(task) {
  const input = document.querySelector("#chatInput");
  const select = document.querySelector("#allowedQuestion");
  const log = document.querySelector("#chatLog");
  select.addEventListener("change", () => {
    input.value = select.value;
  });
  document.querySelector("#askQuestion").addEventListener("click", () => {
    const question = input.value.trim();
    if (!question) return;
    const answer = task.interviewer?.answers?.[question] || "I can only answer specific questions from the task description.";
    log.insertAdjacentHTML("beforeend", `<div class="message user">${escapeHtml(question)}</div>`);
    log.insertAdjacentHTML("beforeend", `<div class="message bot">${escapeHtml(answer)}</div>`);
    input.value = "";
    log.scrollTop = log.scrollHeight;
  });
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = "Copied";
      setTimeout(() => (button.textContent = "Copy start command"), 900);
    });
  });
}

function openTryDialog(task) {
  const start = `/arena:start ${task.task_id}`;
  const pluginRoot = "agent-interview-arena/plugin";
  const codexInstall = `cd /path/to/agent-interview-arena\ncodex plugin marketplace add "$(pwd)"\ncodex plugin add arena@agent-interview-arena\n${start}`;
  const claudeInstall = `cd /path/to/agent-interview-arena\nclaude plugin validate plugin\nclaude --plugin-dir "$(pwd)/plugin"\n${start}`;
  const cliFallback = `cd /path/to/agent-interview-arena\npython3 plugin/scripts/arena.py start ${task.task_id}\npython3 plugin/scripts/arena.py submit --artifact <path> --notes "Done"`;
  tryTitle.textContent = "Try challenge";
  trySubtitle.textContent = task.title;
  tryContent.innerHTML = `
    <div class="detail-actions">
      <a class="primary" href="codex://">Open in Codex</a>
      <a class="secondary" href="claude://">Open in Claude</a>
      <button class="copy-button" data-copy="${escapeHtml(start)}">Copy /arena command</button>
    </div>
    <div class="command-block">
      <strong>Codex plugin install</strong>
      <pre><code>${escapeHtml(codexInstall)}</code></pre>
      <button class="secondary" data-copy="${escapeHtml(codexInstall)}">Copy Codex commands</button>
    </div>
    <div class="command-block">
      <strong>Claude plugin install</strong>
      <pre><code>${escapeHtml(claudeInstall)}</code></pre>
      <button class="secondary" data-copy="${escapeHtml(claudeInstall)}">Copy Claude commands</button>
    </div>
    <div class="command-block">
      <strong>CLI fallback</strong>
      <pre><code>${escapeHtml(cliFallback)}</code></pre>
      <button class="secondary" data-copy="${escapeHtml(cliFallback)}">Copy CLI commands</button>
    </div>
    <div class="try-disclosure">
      <strong>Data sharing note</strong>
      <p>Submission PRs can publish metrics, notes, artifact paths, hashes, and redacted transcript snippets. Review the PR diff before sharing anything sensitive.</p>
    </div>
    <p class="muted">Plugin root: <code>${escapeHtml(pluginRoot)}</code>. Submissions open GitHub PRs with one JSON file.</p>
  `;
  tryContent.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      await navigator.clipboard.writeText(button.dataset.copy);
      const old = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => (button.textContent = old), 900);
    });
  });
  dialog.showModal();
}

function filteredSubmissions() {
  const query = state.submissionSearch.toLowerCase();
  return state.submissions.filter((submission) => {
    const haystack = `${submission.submission_id} ${submission.task_id} ${submission.agent?.model || ""} ${submission.agent?.host || ""}`.toLowerCase();
    const taskOk = !state.submissionTask || submission.task_id === state.submissionTask;
    return taskOk && haystack.includes(query);
  });
}

function renderSubmissions() {
  const tasks = state.tasks.map((task) => task.task_id);
  view.innerHTML = `
    <section class="submissions-view">
      <h2>Submissions</h2>
      <div class="toolbar">
        <input id="submissionSearch" type="search" placeholder="Search submissions" value="${escapeHtml(state.submissionSearch)}" />
        <select id="submissionTask">
          <option value="">All tasks</option>
          ${tasks.map((taskId) => `<option value="${escapeHtml(taskId)}" ${taskId === state.submissionTask ? "selected" : ""}>${escapeHtml(taskId)}</option>`).join("")}
        </select>
      </div>
      <div class="table-wrap">
        <table class="submission-table">
          <thead><tr><th>Submission</th><th>Task</th><th>Model</th><th>Score</th><th>Time</th><th>Tokens</th><th>Cost</th><th>Security</th></tr></thead>
          <tbody>
            ${filteredSubmissions().map(renderSubmissionRow).join("") || `<tr><td colspan="8">No submissions yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
  document.querySelector("#submissionSearch").addEventListener("input", (event) => {
    state.submissionSearch = event.target.value;
    renderSubmissions();
  });
  document.querySelector("#submissionTask").addEventListener("change", (event) => {
    state.submissionTask = event.target.value;
    renderSubmissions();
  });
}

function renderSubmissionRow(submission) {
  const score = submission.evaluation_result?.deterministic_score ?? "n/a";
  const tokens = submission.metrics?.tokens?.total ?? 0;
  const findings = submission.security?.findings?.length ?? 0;
  return `
    <tr>
      <td><code>${escapeHtml(submission.submission_id)}</code><div class="muted">${escapeHtml(submission.created_at)}</div></td>
      <td>${escapeHtml(submission.task_id)}</td>
      <td>${escapeHtml(submission.agent?.model || "unknown")}</td>
      <td>${escapeHtml(score)}</td>
      <td>${escapeHtml(submission.metrics?.wall_time_seconds ?? 0)}s</td>
      <td>${escapeHtml(tokens)}</td>
      <td>$${Number(submission.metrics?.cost_usd_estimate || 0).toFixed(4)}</td>
      <td><span class="pill ${findings ? "bad" : "good"}">${findings ? `${findings} flags` : "clean"}</span></td>
    </tr>
  `;
}

function renderLeaderboard() {
  const rows = [...state.submissions]
    .filter((submission) => !state.leaderboardTask || submission.task_id === state.leaderboardTask)
    .sort((a, b) => (b.evaluation_result?.deterministic_score || 0) - (a.evaluation_result?.deterministic_score || 0));
  const best = rows[0];
  const avgScore = rows.length
    ? Math.round(rows.reduce((sum, submission) => sum + Number(submission.evaluation_result?.deterministic_score || 0), 0) / rows.length)
    : 0;
  const totalCost = rows.reduce((sum, submission) => sum + Number(submission.metrics?.cost_usd_estimate || 0), 0);
  const totalTokens = rows.reduce((sum, submission) => sum + Number(submission.metrics?.tokens?.total || 0), 0);
  view.innerHTML = `
    <section class="leaderboard-view">
      <div class="leaderboard-hero">
        <div>
          <div class="eyebrow">Cost-aware ranking</div>
          <h2>Leaderboard</h2>
          <p>Compare how well each operator steered the agent: completion score, output quality, re-prompts, tokens, dollars, time, tool use, and security posture.</p>
        </div>
        <div class="leaderboard-filter">
          <label for="leaderboardTask">Task</label>
          <select id="leaderboardTask">
            <option value="">All tasks</option>
            ${state.tasks.map((task) => `<option value="${escapeHtml(task.task_id)}" ${task.task_id === state.leaderboardTask ? "selected" : ""}>${escapeHtml(task.task_id)}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="leader-stats">
        <article><span>Submissions</span><strong>${rows.length}</strong></article>
        <article><span>Avg score</span><strong>${avgScore || "--"}</strong></article>
        <article><span>Total tokens</span><strong>${totalTokens || "--"}</strong></article>
        <article><span>Total cost</span><strong>$${totalCost.toFixed(4)}</strong></article>
      </div>

      <div class="podium">
        <div class="podium-card">
          <span class="rank-badge">#1</span>
          <h3>${best ? escapeHtml(best.submission_id) : "Waiting for first run"}</h3>
          <p>${best ? escapeHtml(best.task_id) : "Submit from Codex or Claude to claim the board."}</p>
          <strong>${best ? escapeHtml(best.evaluation_result?.deterministic_score ?? "n/a") : "--"}</strong>
        </div>
        <div class="podium-copy">
          <h3>Rank by output and efficiency.</h3>
          <p>Strong operators should clarify intent, prompt cleanly, recover from bad outputs, produce required artifacts, spend fewer tokens, use tools intentionally, and avoid leaking secrets.</p>
        </div>
      </div>

      ${rows.length ? `
        <div class="table-wrap leaderboard-table-wrap">
          <table class="leader-table">
            <thead><tr><th>Rank</th><th>Submission</th><th>Task</th><th>Score</th><th>Model</th><th>Tokens</th><th>Cost</th><th>Tool Calls</th></tr></thead>
            <tbody>
              ${rows.map((submission, index) => `
                <tr>
                  <td><span class="table-rank">${index + 1}</span></td>
                  <td><code>${escapeHtml(submission.submission_id)}</code></td>
                  <td>${escapeHtml(submission.task_id)}</td>
                  <td><strong>${escapeHtml(submission.evaluation_result?.deterministic_score ?? "n/a")}</strong></td>
                  <td>${escapeHtml(submission.agent?.model || "unknown")}</td>
                  <td>${escapeHtml(submission.metrics?.tokens?.total ?? 0)}</td>
                  <td>$${Number(submission.metrics?.cost_usd_estimate || 0).toFixed(4)}</td>
                  <td>${escapeHtml(submission.metrics?.tool_calls?.total ?? 0)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="empty-board">
          <h3>No submissions yet</h3>
          <p>Run a challenge from Codex or Claude. The first PR submission will populate this leaderboard.</p>
          <button id="leaderStart" class="primary">Start a challenge</button>
        </div>
      `}
    </section>
  `;
  document.querySelector("#leaderboardTask").addEventListener("change", (event) => {
    state.leaderboardTask = event.target.value;
    renderLeaderboard();
  });
  document.querySelector("#leaderStart")?.addEventListener("click", () => setView("tasks"));
}

boot();
