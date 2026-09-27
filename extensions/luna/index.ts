/**
 * Luna Pie: orchestrator mode for Pi.
 *
 * Luna, running the strongest reasoning model you have, evaluates each task,
 * plans it, and waits for your approval. She then delegates to a planet-named
 * team through pi-subagents: Venus scouts, Mercury researches, Moon
 * implements, Jupiter tests, and Mars reviews. Finally she verifies the results
 * and reports back for review. Luna can't edit files herself.
 *
 *   /luna            toggle Luna Pie mode
 *   /luna <task>     enable Luna Pie mode and hand Luna a task
 *   /luna-team       show the team and their models
 *   pi --luna        start in Luna Pie mode
 *
 * Luna's model, tools, protocol, and per-mission budget live in
 * ../../orchestrator.md, and the team lives in ../../agents/*.md. pi-subagents
 * discovers the team through the package manifest; this file reads it only to
 * brief Luna and enforce the rules.
 *
 * A mission runs from the task the user gives Luna to her report. Everything it
 * spends (Luna's turns plus every agent run) counts against the budget.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentMessage, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Model, TextContent } from "@earendil-works/pi-ai";
import { type ExtensionAPI, type ExtensionContext, parseFrontmatter } from "@earendil-works/pi-coding-agent";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ORCHESTRATOR_FILE = path.join(PACKAGE_ROOT, "orchestrator.md");
const TEAM_DIR = path.join(PACKAGE_ROOT, "agents");
const DEFAULT_ORCHESTRATOR_TOOLS = ["read", "grep", "find", "ls", "bash", "subagent", "subagent_supervisor"];
const THINKING_LEVELS: readonly ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const STATE_ENTRY = "luna-pie-mode";
const INSTALL_SUBAGENTS = "pi install npm:pi-subagents@0.71.0";

/** Luna ends every plan with this line. It closes the approval gate and prompts the user. */
const APPROVAL_MARKER = "⏸ Awaiting your approval";
/** A typed reply that approves the pending plan. */
const APPROVAL_REPLY = /^\s*(go|go ahead|approved?|yes|yep|y|lgtm|ship it|proceed|do it)\b/i;
/** Luna's report heading. It ends the mission, so the next task starts a fresh budget. */
const REPORT_MARKER = "☾ Luna Pie report";

/** Agents with any of these tools can change files, so they wait for plan approval. */
const WRITE_TOOLS = ["edit", "write"];

/**
 * Luna may inspect the working tree with read-only git and must delegate
 * everything else. No shell metacharacters, and no --output (which makes git
 * write a file).
 */
const ORCHESTRATOR_BASH_ALLOWED = /^\s*git\s+(status|diff|log|show)\b(?![^\n]*--output)[^;&|<>`$\n]*$/;

/** `agent: "moon"` inside a workflowScript, with the key optionally quoted. */
const AGENT_LITERAL = /["']?\bagent["']?\s*:\s*["'`]([^"'`\s]+)["'`]/g;
const AGENT_KEY = /["']?\bagent["']?\s*:/g;

interface OrchestratorConfig {
	model?: string;
	tools: string[];
	protocol: string;
	/** Per-mission spending cap in USD, or undefined for no cap. */
	budget?: number;
}

interface TeamMember {
	name: string;
	description: string;
	/** "provider/model-id:thinking", as pi-subagents will resolve it. */
	model?: string;
	tools: string[];
	writer: boolean;
}

interface ModelSpec {
	provider?: string;
	id: string;
	thinking?: ThinkingLevel;
}

interface LunaState {
	enabled: boolean;
	/** Whether the user approved Luna's current plan. Writers stay locked until then. */
	approved: boolean;
	/** What to restore when Luna Pie mode is turned off. */
	restore?: { model?: string; thinking: ThinkingLevel; tools: string[] };
	/** The current (or last) mission's spend in USD; `open` until Luna reports. */
	mission?: { open: boolean; spent: number };
}

function formatUsd(amount: number): string {
	return `$${amount.toFixed(2)}`;
}

function listValue(value: unknown): string[] | undefined {
	const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : undefined;
	return raw
		?.filter((v): v is string => typeof v === "string")
		.map((v) => v.trim())
		.filter(Boolean);
}

function loadOrchestratorConfig(): OrchestratorConfig {
	const content = fs.readFileSync(ORCHESTRATOR_FILE, "utf-8");
	const { frontmatter, body } = parseFrontmatter<{ model?: unknown; tools?: unknown; budget?: unknown }>(content);
	const tools = listValue(frontmatter.tools) ?? [...DEFAULT_ORCHESTRATOR_TOOLS];
	if (!tools.includes("subagent")) tools.push("subagent");
	const budget = Number(frontmatter.budget);
	return {
		model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
		tools,
		protocol: body.trim(),
		budget: Number.isFinite(budget) && budget > 0 ? budget : undefined,
	};
}

function loadTeam(): TeamMember[] {
	let files: string[];
	try {
		files = fs.readdirSync(TEAM_DIR).filter((f) => f.endsWith(".md"));
	} catch {
		return [];
	}
	const team: TeamMember[] = [];
	for (const file of files) {
		const { frontmatter } = parseFrontmatter<Record<string, unknown>>(
			fs.readFileSync(path.join(TEAM_DIR, file), "utf-8"),
		);
		if (typeof frontmatter.name !== "string") continue;
		const tools = listValue(frontmatter.tools) ?? [];
		const model = typeof frontmatter.model === "string" ? frontmatter.model : undefined;
		const thinking = typeof frontmatter.thinking === "string" ? frontmatter.thinking : undefined;
		team.push({
			name: frontmatter.name,
			description: typeof frontmatter.description === "string" ? frontmatter.description : "",
			model: model && thinking ? `${model}:${thinking}` : model,
			tools,
			writer: tools.some((t) => WRITE_TOOLS.includes(t)),
		});
	}
	return team;
}

function renderRoster(team: TeamMember[]): string {
	if (team.length === 0) return "(no agents found; check the agents/ directory)";
	const rows = team.map(
		(m) =>
			`| ${m.name} | ${m.model ?? "(default)"} | ${m.tools.join(", ")} | ${m.writer ? "yes" : "no"} | ${m.description} |`,
	);
	return ["| agent | model | tools | changes files | role |", "|---|---|---|---|---|", ...rows].join("\n");
}

/** Parse "provider/model-id:thinking" (provider and thinking are optional). */
function parseModelSpec(spec: string): ModelSpec {
	let rest = spec.trim();
	let thinking: ThinkingLevel | undefined;
	const colon = rest.lastIndexOf(":");
	if (colon > 0) {
		const suffix = rest.slice(colon + 1) as ThinkingLevel;
		if (THINKING_LEVELS.includes(suffix)) {
			thinking = suffix;
			rest = rest.slice(0, colon);
		}
	}
	const slash = rest.indexOf("/");
	return slash > 0 ? { provider: rest.slice(0, slash), id: rest.slice(slash + 1), thinking } : { id: rest, thinking };
}

function findModel(ctx: ExtensionContext, spec: ModelSpec): Model<any> | undefined {
	if (spec.provider) return ctx.modelRegistry.find(spec.provider, spec.id);
	return ctx.modelRegistry.getAll().find((m) => m.id === spec.id);
}

function formatModelRef(model: Model<any> | undefined): string | undefined {
	return model ? `${model.provider}/${model.id}` : undefined;
}

/** The agents a `subagent` call would launch, or `opaque` if they can't be determined. */
function delegatedAgents(input: Record<string, unknown>): { agents: string[]; opaque: boolean } {
	const agents: string[] = [];
	let opaque = false;
	// With an `action`, `agent` names a management target rather than a launch.
	if (typeof input.agent === "string" && input.action === undefined) agents.push(input.agent);
	if (typeof input.workflowScript === "string") {
		const literals = [...input.workflowScript.matchAll(AGENT_LITERAL)].map((m) => m[1]);
		agents.push(...literals);
		if ((input.workflowScript.match(AGENT_KEY) ?? []).length > literals.length) opaque = true;
	}
	if (input.workflowScriptPath !== undefined || input.workflow !== undefined) opaque = true;
	return { agents, opaque };
}

function isAssistant(message: AgentMessage): message is AssistantMessage {
	return message.role === "assistant" && Array.isArray(message.content);
}

function textOf(message: AssistantMessage): string {
	return message.content
		.filter((c): c is TextContent => c.type === "text")
		.map((c) => c.text)
		.join("\n");
}

export default function lunaPie(pi: ExtensionAPI) {
	let state: LunaState = { enabled: false, approved: false };

	pi.registerFlag("luna", {
		description: "Start in Luna Pie orchestrator mode",
		type: "boolean",
		default: false,
	});

	function persist() {
		pi.appendEntry<LunaState>(STATE_ENTRY, state);
	}

	function updateStatus(ctx: ExtensionContext) {
		if (!state.enabled) {
			ctx.ui.setStatus("luna-pie", undefined);
			return;
		}
		const model = ctx.model ? ctx.model.id : "?";
		const gate = state.approved ? " · ✓ plan approved" : "";
		const budget = currentBudget();
		const spend = state.mission
			? ` · ${formatUsd(state.mission.spent)}${budget ? ` / ${formatUsd(budget)}` : ""}`
			: budget
				? ` · budget ${formatUsd(budget)}`
				: "";
		ctx.ui.setStatus(
			"luna-pie",
			ctx.ui.theme.fg("accent", `☾ Luna Pie · ${model} · ${pi.getThinkingLevel()}${spend}${gate}`),
		);
	}

	function currentBudget(): number | undefined {
		try {
			return loadOrchestratorConfig().budget;
		} catch {
			return undefined;
		}
	}

	/** A new task from the user starts a new mission with a fresh budget. */
	function startMission(ctx: ExtensionContext) {
		state.mission = { open: true, spent: 0 };
		state.approved = false;
		persist();
		updateStatus(ctx);
	}

	function addSpend(cost: number | undefined, ctx: ExtensionContext) {
		if (!state.mission?.open || !cost) return;
		state.mission.spent += cost;
		updateStatus(ctx);
	}

	function setApproved(approved: boolean, ctx?: ExtensionContext) {
		if (state.approved === approved) return;
		state.approved = approved;
		persist();
		if (ctx) updateStatus(ctx);
	}

	async function enable(ctx: ExtensionContext): Promise<boolean> {
		if (state.enabled) return true;

		if (!pi.getAllTools().some((t) => t.name === "subagent")) {
			ctx.ui.notify(`Luna Pie needs pi-subagents. Install it with: ${INSTALL_SUBAGENTS}`, "error");
			return false;
		}

		let config: OrchestratorConfig;
		try {
			config = loadOrchestratorConfig();
		} catch (err) {
			ctx.ui.notify(`Luna Pie: could not read ${ORCHESTRATOR_FILE}: ${(err as Error).message}`, "error");
			return false;
		}

		const restore = {
			model: formatModelRef(ctx.model),
			thinking: pi.getThinkingLevel(),
			tools: pi.getActiveTools(),
		};

		if (config.model) {
			const spec = parseModelSpec(config.model);
			const model = findModel(ctx, spec);
			if (!model) {
				ctx.ui.notify(`Luna Pie: Luna's model "${config.model}" not found. Fix orchestrator.md.`, "error");
				return false;
			}
			if (!(await pi.setModel(model))) {
				ctx.ui.notify(`Luna Pie: no credentials for ${model.provider}. Run /login first.`, "error");
				return false;
			}
			if (spec.thinking) pi.setThinkingLevel(spec.thinking);
		}

		pi.setActiveTools(config.tools);
		state = { enabled: true, approved: false, restore };
		persist();
		updateStatus(ctx);
		ctx.ui.notify("Luna Pie mode on. Give Luna a task.", "info");
		return true;
	}

	async function disable(ctx: ExtensionContext) {
		if (!state.enabled) return;
		const { restore } = state;
		if (restore) {
			if (restore.model) {
				const model = findModel(ctx, parseModelSpec(restore.model));
				if (model) await pi.setModel(model);
			}
			pi.setThinkingLevel(restore.thinking);
			pi.setActiveTools(restore.tools);
		}
		state = { enabled: false, approved: false };
		persist();
		updateStatus(ctx);
		ctx.ui.notify("Luna Pie mode off. Previous model and tools restored.", "info");
	}

	/** Why Luna may not make this `subagent` call, or undefined if she may. */
	function delegationViolation(input: Record<string, unknown>): string | undefined {
		if (input.share === true) return "sharing transcripts is disabled. Remove `share`.";
		if (input.action === "schedule.create") return "scheduling runs is outside Luna Pie's workflow. Ask the user.";

		const { agents, opaque } = delegatedAgents(input);
		if (opaque) {
			return "use an inline workflowScript with agent names as string literals (no workflowScriptPath, named workflows, or computed names) so the team rules can be checked.";
		}
		const team = new Map(loadTeam().map((m) => [m.name, m]));
		const outsiders = agents.filter((a) => !team.has(a));
		if (outsiders.length > 0) {
			return `only the Luna Pie team can take work (${[...team.keys()].join(", ")}). Not on the team: ${outsiders.join(", ")}.`;
		}
		const writers = [...new Set(agents.filter((a) => team.get(a)?.writer))];
		if (writers.length > 0 && !state.approved) {
			return `${writers.join(" and ")} can change files, and the user hasn't approved a plan yet. Present your plan, end with "${APPROVAL_MARKER}", and wait.`;
		}
		const budget = currentBudget();
		if (agents.length > 0 && budget && state.mission && state.mission.spent >= budget) {
			return `this mission's budget is used up (${formatUsd(state.mission.spent)} of ${formatUsd(budget)}). Don't delegate any more. Write your report now, with the outcome marked ⚠️ Partial (budget reached), and say what's left to do.`;
		}
		return undefined;
	}

	pi.registerCommand("luna", {
		description: "Toggle Luna Pie orchestrator mode, or give Luna a task: /luna <task>",
		handler: async (args, ctx) => {
			const task = args.trim();
			if (!task) {
				if (state.enabled) await disable(ctx);
				else await enable(ctx);
				return;
			}
			if (!(await enable(ctx))) return;
			await ctx.waitForIdle();
			startMission(ctx);
			pi.sendUserMessage(task);
		},
	});

	pi.registerCommand("luna-team", {
		description: "Show the Luna Pie team: agents, models, and tools",
		handler: async (_args, ctx) => {
			let luna = "(orchestrator.md unreadable)";
			try {
				luna = loadOrchestratorConfig().model ?? "(current session model)";
			} catch {
				/* reported by enable() when it matters */
			}
			const budget = currentBudget();
			const lines = [
				`☾ luna (orchestrator): ${luna}`,
				...loadTeam().map((m) => `${m.name}: ${m.model ?? "(default)"}${m.writer ? " · changes files" : ""}`),
				`budget per mission: ${budget ? formatUsd(budget) : "none"}`,
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	pi.on("before_agent_start", async (event) => {
		if (!state.enabled) return;
		// Re-read on every run so edits to orchestrator.md and agents/ apply without /reload.
		const { protocol, budget } = loadOrchestratorConfig();
		const spent = state.mission?.open ? state.mission.spent : 0;
		const budgetLine = budget
			? `\n\n## Mission budget\n\nThis mission may spend ${formatUsd(budget)} in total, counting your own turns and every agent run. ${formatUsd(spent)} is spent so far. Once it's used up, delegation is blocked and you write your report.`
			: "";
		event.systemPromptOptions.sections.luna_pie =
			protocol.replace("{{agents}}", renderRoster(loadTeam())) + budgetLine;
	});

	// A typed reply to a plan either approves it or asks for changes, which need approval again.
	// With no mission open, the message is a new task and starts a new mission.
	pi.on("input", async (event, ctx) => {
		if (!state.enabled || event.source === "extension") return;
		const text = event.text.trim();
		if (!text || text.startsWith("/")) return;
		if (!state.mission?.open) startMission(ctx);
		else setApproved(APPROVAL_REPLY.test(text), ctx);
	});

	// Count Luna's own turns and every agent run against the mission budget.
	pi.on("message_end", async (event, ctx) => {
		if (!state.enabled || !isAssistant(event.message)) return;
		addSpend(event.message.usage?.cost?.total, ctx);
	});

	pi.on("tool_result", async (event, ctx) => {
		if (!state.enabled || event.toolName !== "subagent") return;
		addSpend(event.usage?.cost?.total, ctx);
	});

	pi.on("tool_call", async (event) => {
		if (!state.enabled) return;

		if (event.toolName === "bash") {
			const command = String(event.input.command ?? "");
			if (!ORCHESTRATOR_BASH_ALLOWED.test(command)) {
				return {
					block: true,
					reason: `Luna Pie: Luna's bash is limited to read-only git (status, diff, log, show). Delegate this to the team.\nCommand: ${command}`,
				};
			}
			return;
		}

		if (event.toolName !== "subagent") return;
		const violation = delegationViolation(event.input);
		if (violation) return { block: true, reason: `Luna Pie: ${violation}` };

		if (delegatedAgents(event.input).agents.length === 0) return;
		// Luna has to see results to verify them, so every launch runs in the foreground.
		event.input.async = false;
		// Inside one workflow, pi-subagents stops launching new agents once the rest of the budget is spent.
		const budget = currentBudget();
		if (budget && state.mission && event.input.workflowScript !== undefined && event.input.usageBudget === undefined) {
			event.input.usageBudget = { costUsd: { hard: Math.max(budget - state.mission.spent, 0.01) } };
		}
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!state.enabled) return;
		const last = [...event.messages].reverse().find(isAssistant);
		const text = last ? textOf(last) : "";

		// Luna's report ends the mission; the next task gets a fresh budget.
		if (text.includes(REPORT_MARKER) && state.mission?.open) {
			state.mission.open = false;
			persist();
			updateStatus(ctx);
			return;
		}

		// When Luna presents a plan, close the gate and ask the user to approve it.
		if (!text.includes(APPROVAL_MARKER)) return;

		setApproved(false, ctx);
		if (!ctx.hasUI) return;

		const choice = await ctx.ui.select("☾ Luna's plan is ready", [
			"Approve: start the work",
			"Revise: tell Luna what to change",
			"Hold: I'll reply later",
		]);
		if (choice?.startsWith("Approve")) {
			setApproved(true, ctx);
			pi.sendUserMessage("Approved. Go ahead with the plan.", { deliverAs: "followUp" });
		} else if (choice?.startsWith("Revise")) {
			const notes = await ctx.ui.editor("What should Luna change?", "");
			if (notes?.trim()) pi.sendUserMessage(notes.trim(), { deliverAs: "followUp" });
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		const saved = ctx.sessionManager
			.getEntries()
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === STATE_ENTRY)
			.pop() as { data?: LunaState } | undefined;

		if (saved?.data?.enabled) {
			// Resumed session: Pi restores the model itself; re-apply the tool restriction.
			state = saved.data;
			try {
				pi.setActiveTools(loadOrchestratorConfig().tools);
			} catch {
				/* orchestrator.md unreadable; leave tools as they are */
			}
			updateStatus(ctx);
		} else if (pi.getFlag("luna") === true) {
			await enable(ctx);
		}
	});
}
