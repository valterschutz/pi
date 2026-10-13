import {
	type AutocompleteItem,
	type AutocompleteProvider,
	type AutocompleteSuggestions,
	fuzzyFilter,
} from "@earendil-works/pi-tui";
import { getPromptTemplateCompletionPrefix } from "../../core/prompt-template-invocations.ts";
import type { PromptTemplate } from "../../core/prompt-templates.ts";

/** Add inline template completion without making action commands available inline. */
export class PromptTemplateAutocompleteProvider implements AutocompleteProvider {
	readonly triggerCharacters = ["/"];
	private base: AutocompleteProvider;
	private templates: readonly PromptTemplate[];
	private templateNames: ReadonlySet<string>;

	constructor(base: AutocompleteProvider, templates: readonly PromptTemplate[]) {
		this.base = base;
		this.templates = templates;
		this.templateNames = new Set(templates.map((template) => template.name));
	}

	async getSuggestions(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
		options: { signal: AbortSignal; force?: boolean },
	): Promise<AutocompleteSuggestions | null> {
		const text = [...lines.slice(0, cursorLine), (lines[cursorLine] ?? "").slice(0, cursorCol)].join("\n");
		const prefix = getPromptTemplateCompletionPrefix(text, this.templateNames);
		if (prefix && text.slice(0, text.length - prefix.length).trim() !== "") {
			const items: AutocompleteItem[] = fuzzyFilter(
				[...this.templates],
				prefix.slice(1),
				(template) => template.name,
			).map((template) => ({
				value: `/${template.name}`,
				label: template.name,
				description: template.argumentHint
					? `${template.argumentHint} — ${template.description}`
					: template.description,
			}));
			const lineStartsWithSlash = (lines[cursorLine] ?? "").trimStart().startsWith("/");
			if (lineStartsWithSlash) {
				const leading = await this.base.getSuggestions(lines, cursorLine, cursorCol, options);
				items.push(...(leading?.items.filter((item) => item.value.startsWith("skill:")) ?? []));
			}
			if (items.length > 0) return { items, prefix };
			if (lineStartsWithSlash) return null;
			return this.base.getSuggestions(lines, cursorLine, cursorCol, options);
		}
		// A later line is still inline input; don't offer action commands there.
		if (
			!options.force &&
			cursorLine > 0 &&
			lines.slice(0, cursorLine).join("\n").trim() &&
			(lines[cursorLine] ?? "").trimStart().startsWith("/")
		) {
			return null;
		}
		return this.base.getSuggestions(lines, cursorLine, cursorCol, options);
	}

	applyCompletion(lines: string[], cursorLine: number, cursorCol: number, item: AutocompleteItem, prefix: string) {
		const text = [...lines.slice(0, cursorLine), (lines[cursorLine] ?? "").slice(0, cursorCol)].join("\n");
		if (
			getPromptTemplateCompletionPrefix(text, this.templateNames) !== prefix ||
			text.slice(0, text.length - prefix.length).trim() === "" ||
			!item.value.startsWith("/") ||
			!this.templates.some((template) => item.value === `/${template.name}`)
		) {
			return this.base.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		}
		const line = lines[cursorLine] ?? "";
		const before = line.slice(0, cursorCol - prefix.length);
		const after = line.slice(cursorCol);
		const suffix = after === "" ? " " : "";
		const completed = [...lines];
		completed[cursorLine] = before + item.value + suffix + after;
		return { lines: completed, cursorLine, cursorCol: before.length + item.value.length + suffix.length };
	}

	shouldTriggerFileCompletion(lines: string[], cursorLine: number, cursorCol: number): boolean {
		const text = [...lines.slice(0, cursorLine), (lines[cursorLine] ?? "").slice(0, cursorCol)].join("\n");
		const prefix = getPromptTemplateCompletionPrefix(text, this.templateNames);
		if (
			prefix &&
			text.slice(0, text.length - prefix.length).trim() !== "" &&
			fuzzyFilter([...this.templates], prefix.slice(1), (template) => template.name).length > 0
		)
			return true;
		return this.base.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
	}
}
