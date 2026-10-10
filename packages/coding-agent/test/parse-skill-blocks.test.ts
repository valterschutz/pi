import { describe, expect, it } from "vitest";
import { parseSkillBlocks } from "../src/core/agent-session.ts";

describe("parseSkillBlocks", () => {
	it("parses consecutive skill blocks and the trailing user message", () => {
		const text =
			'<skill name="a" location="/a/SKILL.md">\nbody a\n</skill>\n\n' +
			'<skill name="b" location="/b/SKILL.md">\nbody b\n</skill>\n\n' +
			"do the thing";
		const parsed = parseSkillBlocks(text);
		expect(parsed?.skillBlocks.map((block) => [block.name, block.content])).toEqual([
			["a", "body a"],
			["b", "body b"],
		]);
		expect(parsed?.userMessage).toBe("do the thing");
	});

	it("parses a single skill block without a user message", () => {
		const parsed = parseSkillBlocks('<skill name="a" location="/a/SKILL.md">\nbody a\n</skill>');
		expect(parsed?.skillBlocks.map((block) => block.name)).toEqual(["a"]);
		expect(parsed?.userMessage).toBeUndefined();
	});

	it("returns null for text without a leading skill block", () => {
		expect(parseSkillBlocks("plain message")).toBeNull();
	});
});
