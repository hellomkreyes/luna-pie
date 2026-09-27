# Luna Pie backlog

## Up next
- [ ] Planet symbols in the `/luna-team` roster, matching Luna's ☾: ♀ Venus, ☿ Mercury, ☽ Moon, ♃ Jupiter, ♂ Mars. Put each symbol in the agent's frontmatter so the roster, Luna's team table, and the README all use the same one
- [ ] Rename `/luna-team` to `/role-call` (in `extensions/luna/index.ts` and the README)

## Cost
- [ ] Optional per-task spending cap. Add a `budget` setting to `orchestrator.md` (e.g. `budget: 5.00` in USD) that Luna Pie applies to every delegation through pi-subagents' `usageBudget` (`costUsd` soft and hard limits). Known limits to document:
  - It stops *new* agents from starting once reported spend passes the cap. It doesn't stop agents already running.
  - It doesn't count Luna's own usage. To cover that, the extension could total Luna's spend from the session and block further delegations once the overall cap is hit.
  - Show spend against the cap in the `☾ Luna Pie` status line (e.g. `$1.84 / $5.00`), and have Luna say in her report when a cap stopped work
  - The real hard limit stays at the source: the monthly extra-usage limit at claude.ai/settings/usage

## Personality
- [ ] Magical-girl mission briefs: tell every build as a mission, and lean all the way into the storytelling. Rename Luna's plan sections in `orchestrator.md`:
  - Goal → **Brief**
  - Type → **Mission Type**
  - What we found → **Intel**
  - Plan → **Battle Plans**
  - Done when → **Success Criteria**
  - Risks and open questions → **Mission Risks & Unknowns**

  Ideas to carry the story through the rest of the flow: the final report becomes a mission debrief, the team log becomes a squad roster with each planet's symbol, and fix cycles become rematches. Keep the content under each heading plain and precise; the theme lives in the headings and voice, not the facts. If the approval line changes (e.g. to something like "✨ Awaiting your command"), update `APPROVAL_MARKER` in `extensions/luna/index.ts` in the same change, or the approval dialog stops appearing
- [ ] A cuter, magical-girl start screen. Pi supports all of these from the extension, shown only in Luna Pie mode (or with `--luna`):
  - **Header:** replace Pi's startup header with ASCII art (a crescent moon, sparkles, the planets in orbit) via `ctx.ui.setHeader()`. Pi's `examples/extensions/custom-header.ts` shows how
  - **Theme:** a pastel "Luna" colour theme (lilac, pink, moonlight gold) shipped as a Pi theme in the package
  - **While working:** a sparkle spinner and themed working messages (e.g. "Luna is consulting the stars…") via Pi's working-indicator and working-message hooks
  - **Status line:** a little moon-phase flourish in the `☾ Luna Pie` footer status
