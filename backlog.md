# Luna Pie backlog

## Cost
- [ ] Light missions: teach Luna (in `orchestrator.md`, so it persists across sessions) to size each mission and propose **full** or **light** in her plan, for the user to choose.
  - **Light** is for small, low-risk changes: a refactor with no behaviour change, a copy edit, a config tweak. Moon implements and runs one mechanical check herself (e.g. a before/after build diff), and Luna reviews the diff. Jupiter and Mars are skipped unless something looks risky.
  - **Full** is today's flow: Venus/Mercury → Moon → Jupiter + Mars in parallel.
  - Luna says in the plan which she recommends and why. The approval gate works the same for both, because Moon still waits for approval.
  - Idea from the first real run (the content-patterns refactor in chibimuere), where the full flow was heavy for a ~20-line change.
  - **Tried once, by prompt** (the chibimuere console greeting and view-source ASCII art, PR #17): it worked, but cost **$4.26**, more than the full first mission ($2.81). The team was cheap ($0.82). Luna's own turns were the cost: 46 turns, $3.44 (81%), mostly rounds of taste feedback on the ASCII art, each one on Opus at xhigh.
  - So light missions need a second rule for **taste calls** (copy, art, naming): Luna gets 3 options drafted on a cheaper model in one go (e.g. a Sonnet "muse" agent, or Moon), and the user picks from those, instead of Luna redrafting on Opus round by round.

## Personality
- [ ] A cuter, magical-girl start screen. Pi supports all of these from the extension, shown only in Luna Pie mode (or with `--luna`):
  - **Header:** replace Pi's startup header with ASCII art (a crescent moon, sparkles, the planets in orbit) via `ctx.ui.setHeader()`. Pi's `examples/extensions/custom-header.ts` shows how
  - **Theme:** a pastel "Luna" colour theme (lilac, pink, moonlight gold) shipped as a Pi theme in the package
  - **While working:** a sparkle spinner and themed working messages (e.g. "Luna is consulting the stars…") via Pi's working-indicator and working-message hooks
  - **Status line:** a little moon-phase flourish in the `☾ Luna Pie` footer status
