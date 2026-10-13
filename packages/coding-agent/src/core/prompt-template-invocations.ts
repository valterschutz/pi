export interface PromptTemplateInvocation {
	start: number;
	end: number;
	name: string;
	args?: string;
}

interface LiteralRange {
	start: number;
	end: number;
}

/** Code and generated skill instructions are never invocation sources. */
function findLiteralRanges(text: string): LiteralRange[] {
	const ranges: LiteralRange[] = [];
	let fence: { character: string; length: number } | undefined;
	let start = 0;
	let offset = 0;
	for (const line of text.split("\n")) {
		const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
		if (marker) {
			// Backtick fence info strings cannot contain backticks.
			if (!fence && (marker[1][0] !== "`" || !marker[2].includes("`"))) {
				fence = { character: marker[1][0], length: marker[1].length };
				start = offset;
			} else if (
				fence &&
				marker[1][0] === fence.character &&
				marker[1].length >= fence.length &&
				marker[2].trim() === ""
			) {
				ranges.push({ start, end: offset + line.length });
				fence = undefined;
			}
		}
		offset += line.length + 1;
	}
	if (fence) ranges.push({ start, end: text.length });
	for (const match of text.matchAll(/<skill\b[^>]*>[\s\S]*?(?:<\/skill>|$)/g)) {
		ranges.push({ start: match.index, end: match.index + match[0].length });
	}
	ranges.sort((a, b) => a.start - b.start);
	return ranges;
}

function isInvocationStart(text: string, index: number, previousInvocationEnd: number): boolean {
	if (index === 0) return true;
	if (!/[\s([{"',;!?]/.test(text[index - 1])) return false;
	// A recognized invocation's slash is not a path prefix for a later invocation.
	const precedingToken = text.slice(previousInvocationEnd, index).match(/[^\s"']*$/)?.[0] ?? "";
	return !precedingToken.includes("/") && !precedingToken.includes("\\");
}

function findArgumentEnd(text: string, start: number): number | undefined {
	let depth = 1;
	let quote: string | undefined;
	for (let i = start + 1; i < text.length; i++) {
		const character = text[i];
		if (quote) {
			if (character === quote) quote = undefined;
		} else if (character === '"' || character === "'") {
			quote = character;
		} else if (character === "(") {
			depth++;
		} else if (character === ")" && --depth === 0) {
			return i + 1;
		}
	}
	return undefined;
}

/** Scan only original text. Explicit argument groups are opaque to further invocation scanning. */
export function findPromptTemplateInvocations(
	text: string,
	names: ReadonlySet<string>,
): { invocations: PromptTemplateInvocation[]; escapedSlashes: number[]; incompleteArgumentStart?: number } {
	const invocations: PromptTemplateInvocation[] = [];
	let incompleteArgumentStart: number | undefined;
	const escapedSlashes: number[] = [];
	const literalRanges = findLiteralRanges(text);
	let rangeIndex = 0;
	for (let i = 0; i < text.length; i++) {
		while (literalRanges[rangeIndex]?.end <= i) rangeIndex++;
		const range = literalRanges[rangeIndex];
		if (range && range.start <= i) {
			i = range.end - 1;
			continue;
		}
		if (text[i] === "`") {
			const run = text.slice(i).match(/^`+/)![0];
			let end = i + run.length;
			while (end < text.length) {
				if (text[end] !== "`") {
					end++;
					continue;
				}
				const closingRun = text.slice(end).match(/^`+/)![0];
				end += closingRun.length;
				if (closingRun.length === run.length) break;
			}
			i = end - 1;
			continue;
		}
		const escaped = text[i] === "\\" && text[i + 1] === "/";
		const slash = escaped ? i + 1 : i;
		if (text[slash] !== "/" || !isInvocationStart(text, i, invocations.at(-1)?.end ?? 0)) continue;
		const token = text.slice(slash + 1).match(/^[^\s/\\`()[\]{},;!?"'<>]+/)?.[0] ?? "";
		const name = token.replace(/[.:]+$/, "");
		const end = slash + 1 + name.length;
		// A separator after the name belongs to a path, not an invocation.
		if (!name || text[end] === "/" || text[end] === "\\") continue;
		if (escaped) {
			escapedSlashes.push(i);
			i = (text[end] === "(" ? (findArgumentEnd(text, end) ?? end) : end) - 1;
			continue;
		}
		if (text[end] === "(") {
			const argumentEnd = findArgumentEnd(text, end);
			if (argumentEnd === undefined) {
				incompleteArgumentStart ??= i;
				continue;
			}
			if (names.has(name) && text[argumentEnd] !== "/" && text[argumentEnd] !== "\\") {
				invocations.push({ start: i, end: argumentEnd, name, args: text.slice(end + 1, argumentEnd - 1) });
			}
			i = argumentEnd - 1;
		} else if (names.has(name)) {
			invocations.push({ start: i, end, name });
			i = end - 1;
		}
	}
	return { invocations, escapedSlashes, incompleteArgumentStart };
}

/** Return an unfinished bare invocation at the cursor, respecting the same literal regions as expansion. */
export function getPromptTemplateCompletionPrefix(
	textBeforeCursor: string,
	names: ReadonlySet<string>,
): string | undefined {
	const match = textBeforeCursor.match(/\/[^\s/\\`()[\]{},;!?"'<>]*$/);
	if (!match) return undefined;
	const prefix = match[0];
	const { invocations, incompleteArgumentStart } = findPromptTemplateInvocations(
		`${textBeforeCursor}completion`,
		new Set([...names, `${prefix.slice(1)}completion`]),
	);
	return incompleteArgumentStart === undefined && invocations.some((invocation) => invocation.start === match.index)
		? prefix
		: undefined;
}
