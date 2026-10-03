# ☾ Luna Pie

An orchestration layer for [Pi](https://pi.dev). Your main Pi session becomes
**Luna**, an orchestrator on the strongest reasoning model you have. Luna
evaluates your task, plans it, and waits for **your approval**. Then she hands
the work to a team named after the planets, checks what they produce, and
gives you a mission debrief to review.

```
you ──task──▶ ☾ Luna (Opus 5.5 · xhigh)
               1. Evaluate  ──▶ Venus (scout) · Mercury (web research)    read-only
               2. Plan      goal · findings · steps · done-when
               ⏸ you approve, revise, or hold
               3. Delegate  ──▶ Moon (implements)
                            ──▶ Jupiter (tests) + Mars (reviews, GPT)    in parallel
               4. Verify    reads the diff, loops fixes back to Moon (max 2 cycles)
               5. Report ──────────────────────────────────────────▶ you review
```

**How it's built:** Luna Pie is the management layer: the roles, the
protocol, the approval gate, and the rules. [pi-subagents](https://github.com/nicobailon/pi-subagents)
is the engine that runs the agents. [pi-web-access](https://github.com/nicobailon/pi-web-access)
gives Mercury web search. Both are pinned to tested versions.

## Setup

This installs Luna Pie globally, so it's available in every project you open
with Pi. Requires Node.js 22.19+.

1. **Install Pi globally:**
   ```bash
   npm install -g --ignore-scripts @earendil-works/pi-coding-agent
   ```
2. **Log in:** start `pi` and run `/login` twice.
   - **Anthropic**, for Luna, Venus, Mercury, Moon, and Jupiter.
   - **OpenAI (ChatGPT Plus/Pro)**, for Mars. A browser opens to ChatGPT, where
     you can sign in with Google as usual.
3. **Install the engine and Luna Pie for your user:**
   ```bash
   pi install npm:pi-subagents@0.71.0
   pi install npm:pi-web-access@0.31.0
   pi install ~/Sites/luna-pie
   ```
   `pi install` without flags is a personal install. It's recorded in
   `~/.pi/agent/settings.json` and loads in every project.
4. **Optional:** add an alias that starts Pi in Luna Pie mode:
   ```bash
   echo "alias luna='pi --luna'" >> ~/.zshrc
   ```

Run `/role-call` in any project to confirm everyone's there.

**Which GPT models your ChatGPT plan allows:** `/model` lists every model Pi
knows about, not what your plan allows. GPT-6 Sol and GPT-5.6 Sol appear
there but are rejected on a ChatGPT Plus-style login. Mars defaults to
`openai-codex/gpt-5.6-terra`, which works; `gpt-6-luna` also works. To test a
model before switching Mars to it:

```bash
pi --no-session --no-tools -p --model openai-codex/<model-id> "Reply with exactly: OK"
```

**Good to know about the local install:**
- Pi loads Luna Pie straight from `~/Sites/luna-pie` rather than copying it.
  Edits you make there apply to every project on Luna's next turn.
- If you move or rename the folder, run `pi remove` with the old path, then
  `pi install` with the new one.

**Project-only install (alternative):** to enable Luna Pie in one repository
instead of everywhere, run the install from inside that repo with `-l`, as in
`pi install -l ~/Sites/luna-pie`. That writes to the repo's
`.pi/settings.json`, and Pi loads it only after you trust the project.

## Use

| Command | What it does |
|---|---|
| `/luna <task>` | Switch to Luna Pie mode and give Luna a task |
| `/luna` | Toggle Luna Pie mode. Turning it off restores your previous model, thinking level, and tools. |
| `/role-call` | Role call: the team, their symbols, and their models |
| `pi --luna` | Start a session already in Luna Pie mode |
| `/subagents-fleet` | Watch agents live, read their transcripts, or stop one (from pi-subagents) |
| `/subagents-doctor` | Diagnose the engine if something seems off (from pi-subagents) |
| `/subagent-cost` | Cost breakdown: Luna plus each agent run (from pi-subagents) |

Every task is a mission. Luna opens with a **mission brief**: Brief, Mission
Type, Intel, Battle Plans, Success Criteria, and Mission Risks & Unknowns. It
ends with "⏸ Awaiting your command", and a dialog asks you to **Approve**,
**Revise** (you type what to change), or **Hold**. You can also just type a
reply: "go", "approved", "yes", or "lgtm" approves it. Anything else counts as
feedback, and Luna revises the plan and asks again. When the work is done, she
closes with a **Mission Debrief**: what was accomplished, the proof, and the
squad roster.

## The team

| | Role | Model | Changes files | Why this model |
|---|---|---|---|---|
| ☾ **Luna** | Orchestrator | Claude Opus 5.5 · xhigh | no | Does all the judgement and very little typing, so it's worth the best reasoning |
| ♀ **Venus** | Scout | Claude Haiku 4.5 · low | no | Like the morning star, she goes first. Fast, cheap codebase recon. |
| ☿ **Mercury** | Researcher | Claude Haiku 4.5 · medium | no | The messenger, bringing back docs and web facts with sources |
| ☽ **Moon** | Implementer | Claude Sonnet 5 · high | **yes** | Strong coding model with room to think through edge cases |
| ♃ **Jupiter** | Tester | Claude Sonnet 5 · medium | tests only | Writes and runs tests, and diagnoses failures |
| ♂ **Mars** | Reviewer | GPT-5.6 Terra · high | no | A different model family catches blind spots Claude shares with itself |

## Rules Luna Pie enforces

These aren't just instructions in a prompt. The extension blocks the tool call
if Luna tries to break one.

- **Nothing changes before you approve.** Moon and Jupiter, the agents that can
  edit files, are locked until you approve a plan. Asking for changes locks
  them again.
- **Only the team works.** pi-subagents' built-in agents (`worker`,
  `reviewer`, and so on) are blocked in Luna Pie mode.
- **Luna can't do the work herself.** She has no edit or write tools. Her
  bash is limited to `git status/diff/log/show`, with no pipes, redirects, or
  chaining.
- **Luna always waits for results.** Every launch runs in the foreground, so
  she can verify what came back.
- **Nothing is published.** Transcript sharing (`share`) and scheduled runs
  are blocked. Luna never commits, pushes, or deploys. Changes stay in your
  working tree for review.
- **Agents can't spawn agents.** pi-subagents enforces this for every child.
- **Every mission has a budget.** A mission runs from the task you give Luna
  to her mission debrief, and everything it spends counts: Luna's own turns plus every
  agent run. The status line shows it live (`☾ Luna Pie · … · $1.84 / $5.00`).
  Once the budget is used up, Luna can't delegate any more and writes her
  debrief, marked ⚠️ Partial. Inside a single workflow, pi-subagents also stops
  launching agents when the rest of the budget runs out.

  What it can't do: stop an agent that's already running, or stop Luna
  mid-thought, so a mission can finish a little over budget. The hard limit
  is still the monthly extra-usage cap on your provider account (for
  Anthropic, claude.ai/settings/usage).

## Customize

Everything is Markdown with YAML frontmatter. Edits apply on Luna's next turn,
with no reload needed.

- **Change a model:** edit `model:` and `thinking:` in `agents/<planet>.md`, or
  `model:` in `orchestrator.md` (format `provider/model-id:thinking`). Run
  `pi --list-models` to see what's available.
- **Change the budget:** edit `budget:` in `orchestrator.md` (USD per
  mission, default `5.00`). Remove the line for no cap.
- **Change the workflow:** edit the body of `orchestrator.md`. The `{{agents}}`
  placeholder is filled with the live team roster.
- **Add a teammate:** drop a new file into `agents/`, such as `saturn.md` for
  docs writing. pi-subagents and Luna both pick it up. Any agent with `edit`
  or `write` in its tools automatically waits for plan approval.

## Upgrading the engine

The engine packages are pinned because pi-subagents changes quickly. It
removed chains and the planner agent in recent releases. Upgrade on purpose,
not by accident:

```bash
pi install npm:pi-subagents@<new-version>
```

Then run `/subagents-doctor` and a small `/luna` task before relying on it.

## Layout

```
luna-pie/
├── package.json            Pi package manifest: the extension, plus the team for pi-subagents
├── orchestrator.md         Luna: model, tools, and protocol
├── agents/                 the team, one file per planet
│   ├── venus.md  mercury.md  moon.md  jupiter.md  mars.md
└── extensions/
    ├── luna/index.ts       Luna Pie mode: /luna, --luna, approval gate, team rules
    └── web-access.ts       loads pi-web-access into Mercury's session only
```
