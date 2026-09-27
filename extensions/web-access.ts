/**
 * Web search for Mercury.
 *
 * pi-subagents runs foreground agents without the parent session's extensions,
 * so Mercury loads this file through `subagentOnlyExtensions`. It forwards to
 * the pi-web-access package installed with `pi install npm:pi-web-access`,
 * which registers web_search, fetch_content, and get_search_content.
 *
 * Not listed in package.json, so it never loads in the main session.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";

const PACKAGE_DIR = path.join(getAgentDir(), "npm", "node_modules", "pi-web-access");

function resolveEntry(): string {
	const manifest = JSON.parse(fs.readFileSync(path.join(PACKAGE_DIR, "package.json"), "utf-8"));
	const declared: string = manifest.pi?.extensions?.[0] ?? "./index.ts";
	const target = path.resolve(PACKAGE_DIR, declared);
	if (!fs.statSync(target).isDirectory()) return target;
	for (const name of ["index.js", "index.ts"]) {
		if (fs.existsSync(path.join(target, name))) return path.join(target, name);
	}
	throw new Error(`no index.js or index.ts in ${target}`);
}

export default async function webAccess(pi: ExtensionAPI) {
	if (!fs.existsSync(PACKAGE_DIR)) {
		throw new Error(`Mercury needs pi-web-access. Install it with: pi install npm:pi-web-access@0.31.0`);
	}
	const mod = await import(resolveEntry());
	await mod.default(pi);
}
