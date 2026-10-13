import { CombinedAutocompleteProvider, Editor, TuiMainScreen } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { defaultEditorTheme } from "../../tui/test/test-themes.ts";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import type { PromptTemplate } from "../src/core/prompt-templates.ts";
import { createSyntheticSourceInfo } from "../src/core/source-info.ts";
import { PromptTemplateAutocompleteProvider } from "../src/modes/interactive/prompt-template-autocomplete.ts";

const templates: PromptTemplate[] = [
	{
		name: "ship",
		description: "Ship the changes",
		argumentHint: "[hint]",
		content: "Ship",
		filePath: "/virtual/ship.md",
		sourceInfo: createSyntheticSourceInfo("/virtual/ship.md", { source: "local" }),
	},
];
const base = new CombinedAutocompleteProvider(
	[{ name: "quit" }, { name: "ship" }, { name: "testcmd" }, { name: "skill:deep-research" }],
	"/nonexistent",
);
const provider = new PromptTemplateAutocompleteProvider(base, templates);
const options = { signal: new AbortController().signal };

describe("PromptTemplateAutocompleteProvider", () => {
	it.each([
		"Please /sh",
		"Please (/sh",
		'Say "/sh',
		"Please /sh and /sh",
		"Please (/ship),(/sh",
		"/ship,/sh",
		"Please /ship(one),/sh",
		"```/ship``` then /sh",
	])("completes an inline template in %s", async (text) => {
		const result = await provider.getSuggestions([text], 0, text.length, options);
		expect(result?.prefix).toBe("/sh");
		expect(result?.items).toEqual([{ value: "/ship", label: "ship", description: "[hint] — Ship the changes" }]);
		const applied = provider.applyCompletion([text], 0, text.length, result!.items[0], result!.prefix);
		expect(applied.lines).toEqual([`${text.slice(0, -3)}/ship `]);
		expect(applied.cursorCol).toBe(applied.lines[0].length);
		expect(provider.shouldTriggerFileCompletion([text], 0, text.length)).toBe(true);
	});

	it("completes on later lines without suggesting actions and preserves the suffix", async () => {
		const lines = ["Please implement this", "then (/sh), and summarize"];
		const col = lines[1].indexOf(")");
		const result = await provider.getSuggestions(lines, 1, col, options);
		expect(result?.items.map((item) => item.value)).toEqual(["/ship"]);
		const applied = provider.applyCompletion(lines, 1, col, result!.items[0], result!.prefix);
		expect(applied.lines).toEqual([lines[0], "then (/ship), and summarize"]);
		expect(applied.cursorLine).toBe(1);
		expect(applied.cursorCol).toBe("then (/ship".length);
		const later = await provider.getSuggestions(["Please", "/"], 1, 1, options);
		expect(later?.items.map((item) => item.value)).toEqual(["/ship", "skill:deep-research"]);
	});

	it.each([
		"Please /qu",
		"Please /testc",
		"Please \\/sh",
		"Please `/sh",
		"Please src/sh",
		"Please https://host?/sh",
		"Please https://host(/sh",
		"Please https://host?(/ship),(/sh",
		"Please /ship,https://host?/sh",
		"Please /ship,https://host(/sh",
		"Please /ship,src/(/sh",
		"Please /ship(arg /sh",
	])("does not offer templates or actions in literal/argument context %s", async (text) => {
		expect(await provider.getSuggestions([text], 0, text.length, options)).toBeNull();
	});

	it.each([
		["```", "/sh"],
		["~~~text", "/sh"],
		["```", "/ship", "```", "Please /sh"],
	])("respects fences across lines %s", async (...lines) => {
		const line = lines.length - 1;
		const result = await provider.getSuggestions(lines, line, lines[line].length, options);
		expect(result?.items.map((item) => item.value) ?? []).toEqual(lines.length > 2 ? ["/ship"] : []);
	});

	it("retains leading action and skill completion, including indentation", async () => {
		for (const text of ["/qu", "  /qu", "/idea", "/skill:deep"]) {
			const result = await provider.getSuggestions([text], 0, text.length, options);
			expect(result?.items[0].value).toBe(text.includes("qu") ? "quit" : "skill:deep-research");
		}
		const later = await provider.getSuggestions(["Please", "/idea"], 1, 5, options);
		expect(later?.items[0].value).toBe("skill:deep-research");
	});

	it("returns inline template suggestions for forced completion but keeps unrelated paths unchanged", async () => {
		expect(provider.triggerCharacters).toEqual(["/"]);
		expect((await provider.getSuggestions(["Please /sh"], 0, 10, { ...options, force: true }))?.items[0].value).toBe(
			"/ship",
		);
		for (const text of ["Please src/sh", "Please \\/sh", "Please `/sh", "Please https://host/sh"]) {
			expect(await provider.getSuggestions([text], 0, text.length, { ...options, force: true })).toEqual(
				await base.getSuggestions([text], 0, text.length, { ...options, force: true }),
			);
		}
	});

	it("reopens canceled inline completion on Tab and does not submit when completing", async () => {
		const editor = new Editor(new TuiMainScreen(new VirtualTerminal()), defaultEditorTheme);
		const submissions: string[] = [];
		editor.onSubmit = (text) => {
			submissions.push(text);
		};
		editor.setAutocompleteProvider(provider);
		editor.setText("Please /s");
		editor.handleInput("h");
		await new Promise((resolve) => setImmediate(resolve));
		expect(editor.isShowingAutocomplete()).toBe(true);
		editor.handleInput("\x1b");
		expect(editor.isShowingAutocomplete()).toBe(false);
		editor.handleInput("\t");
		await new Promise((resolve) => setImmediate(resolve));
		expect(editor.getText()).toBe("Please /ship ");
		expect(submissions).toEqual([]);
		editor.handleInput("\r");
		expect(submissions).toEqual(["Please /ship"]);
	});

	it("confirms a natural inline suggestion on Enter without submitting the prompt", async () => {
		const editor = new Editor(new TuiMainScreen(new VirtualTerminal()), defaultEditorTheme);
		const submissions: string[] = [];
		editor.onSubmit = (text) => {
			submissions.push(text);
		};
		editor.setAutocompleteProvider(provider);
		editor.setText("Please /s");
		editor.handleInput("h");
		await new Promise((resolve) => setImmediate(resolve));
		editor.handleInput("\r");
		expect(editor.getText()).toBe("Please /ship ");
		expect(submissions).toEqual([]);
		editor.handleInput("\r");
		expect(submissions).toEqual(["Please /ship"]);
	});
});
