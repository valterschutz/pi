import { type AutocompleteProvider, setKeybindings, TuiMainScreen } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it } from "vitest";
import { defaultEditorTheme } from "../../tui/test/test-themes.ts";
import { VirtualTerminal } from "../../tui/test/virtual-terminal.ts";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import { CustomEditor } from "../src/modes/interactive/components/custom-editor.ts";

afterEach(() => {
	setKeybindings(new KeybindingsManager());
});

async function flushAutocomplete(): Promise<void> {
	await Promise.resolve();
	await new Promise((resolve) => setImmediate(resolve));
}

describe("CustomEditor prompt history keybindings", () => {
	it("gives an explicit history binding precedence over model cycling", () => {
		const keybindings = new KeybindingsManager({
			"tui.editor.historyPrevious": "ctrl+p",
			"tui.editor.historyNext": "ctrl+n",
		});
		setKeybindings(keybindings);
		const editor = new CustomEditor(new TuiMainScreen(new VirtualTerminal()), defaultEditorTheme, keybindings);
		let modelCycles = 0;
		editor.onAction("app.model.cycleForward", () => {
			modelCycles++;
		});
		editor.addToHistory("previous prompt");
		editor.setText("draft");

		editor.handleInput("\x10"); // Ctrl+P
		expect(editor.getText()).toBe("previous prompt");
		expect(modelCycles).toBe(0);

		editor.handleInput("\x0e"); // Ctrl+N
		expect(editor.getText()).toBe("draft");
	});

	it("uses Tab for completion while the autocomplete menu is open", async () => {
		const keybindings = new KeybindingsManager({
			"app.model.cycleForward": "tab",
		});
		setKeybindings(keybindings);
		const editor = new CustomEditor(new TuiMainScreen(new VirtualTerminal()), defaultEditorTheme, keybindings);
		let modelCycles = 0;
		editor.onAction("app.model.cycleForward", () => {
			modelCycles++;
		});
		const provider: AutocompleteProvider = {
			triggerCharacters: ["#"],
			getSuggestions: async () => ({
				items: [{ value: "#skill:python", label: "#skill:python" }],
				prefix: "#",
			}),
			applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
				const line = lines[cursorLine] ?? "";
				const before = line.slice(0, cursorCol - prefix.length);
				const after = line.slice(cursorCol);
				const completedLines = [...lines];
				completedLines[cursorLine] = before + item.value + after;
				return {
					lines: completedLines,
					cursorLine,
					cursorCol: before.length + item.value.length,
				};
			},
		};
		editor.setAutocompleteProvider(provider);
		editor.setText("Refactor this ");
		editor.handleInput("#");
		await new Promise((resolve) => setTimeout(resolve, 50));
		await flushAutocomplete();

		editor.handleInput("\t");
		expect(editor.getText()).toBe("Refactor this #skill:python");
		expect(modelCycles).toBe(0);

		editor.handleInput("\t");
		expect(modelCycles).toBe(1);
	});
});
