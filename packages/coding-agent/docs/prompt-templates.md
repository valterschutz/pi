# Prompt Templates

Prompt templates turn Markdown files into named, reusable text snippets invoked with `/name`. Use one when you want to reuse the same prompt without adding executable behavior or a larger set of supporting instructions.

A template can accept arguments and appear in command completion. Pi can load templates from personal configuration, project configuration, an explicit path, or a Pi package. Project configuration loads only after project trust is granted.

## Create a template

Create `~/.pi/agent/prompts/review.md`:

```markdown
---
description: Review staged git changes
argument-hint: "[focus]"
---
Review the staged changes. Focus on ${1:-correctness, security, and error handling}.
```

The filename becomes the template name, so this template is available as `/review`. The `description` appears in command completion. If it is omitted, Pi uses the first non-empty line.

`argument-hint` is optional. Use `<angle brackets>` for required arguments and `[square brackets]` for optional arguments.

Run `/reload` after adding or changing a template in an active session.

<a id="invoke-a-template"></a>

## Use a template

Invoke a template alone or within surrounding text:

```text
/review
/review concurrency
Please /review, then summarize the risks.
Compare /review(concurrency) with /review("API compatibility").
```

Each original invocation is replaced in place. Surrounding text is preserved, and repeated invocations each expand. Expansion is single-pass: template content and supplied arguments do not invoke more templates or skills.

A bare inline `/review` has no arguments. Use `/review(one "two words")` for explicit inline arguments. Parentheses must balance; parentheses inside single or double quotes do not affect balancing. `(/review)` wraps an argument-free invocation; `/review(focus)` supplies an argument. An unclosed parenthesis or quote leaves that invocation literal, without removing the remaining text.

The legacy `/review concurrency` form consumes the entire remainder as arguments **only when one known, expandable invocation starts the prompt**. If another template invocation occurs, neither bare invocation captures surrounding prose:

```text
/review concurrency then /review
```

Both `/review` occurrences above expand without arguments; `concurrency then` remains between them. Unknown names, escaped invocations, code, and protected skill blocks do not count toward this rule. Prefer explicit parentheses when mixing instructions and arguments.

### Literal text and completion

- Backtick spans and fenced code blocks (backticks or tildes) stay literal.
- Paths and URLs such as `src/review`, `/review/file.md`, `/review.md`, and `https://host/review` stay literal.
- Unknown template names stay literal. Names are case-sensitive.
- Escape an invocation with `\/review` to send literal `/review`; the escape backslash is removed in surrounding prompt text, not in code, protected skill blocks, or explicit arguments. `/review("\/path")` passes the backslash literally as an argument; argument values are not invocation sources.
- Ordinary quoted prose still expands: `Say "/review"` inserts the template inside the quotes.
- Adjacent punctuation works: `(/review)` and `/review,` preserve their punctuation.

Template completion works inline and across editor lines. Action commands such as `/quit` and executable extension commands remain leading-only; inline suggestions never execute them. Existing leading command and skill completion and configurable completion keys are unchanged. Extensions can still wrap the completion provider; a wrapper that offers skills first can take precedence over template suggestions.

### Expansion order and interfaces

Pi expands templates before the resulting text enters the agent, including CLI print/JSON, RPC, SDK `prompt()`, steering, and follow-ups. Extensions receive raw input first through the `input` event unless a leading extension command handles it. Built-in interactive actions and leading extension commands retain their existing dispatch priority over same-named templates.

For a leading `/skill:name`, templates expand in its user-supplied tail, not its loaded instructions. Generated `<skill ...>...</skill>` blocks (including blocks prepended by input extensions) are protected; templates in the remaining text still expand. Legacy remainder capture does not apply to a skill's tail or consume a skill block. Other input-event transformations retain their existing expansion behavior.

Extension `sendUserMessage()` still defaults to no expansion. Pass `{ expandPromptTemplates: true }` to opt in; SDK `prompt()` can pass `{ expandPromptTemplates: false }` to opt out.

Templates support these substitutions:

| Syntax | Result |
|---|---|
| `$1`, `$2`, … | One positional argument |
| `$@` or `$ARGUMENTS` | All arguments joined with spaces |
| `${1:-default}` | First argument, or a default value |
| `${@:-default}` | All arguments, or a default value |
| `${@:N}` | Arguments starting at position `N` |
| `${@:N:L}` | `L` arguments starting at position `N` |

Arguments follow shell-like quoting, so `/review("API compatibility")` supplies one argument containing a space. Single and double quotes group arguments; this is parsing only, not shell execution.

<a id="choose-where-it-loads"></a>

## Add it to Pi

Place the template in your user or project prompt directory. Conventional prompt directories load direct `.md` children only.

Settings and packages can select nested Markdown files; a package manifest can narrow discovery with explicit paths and globs. See [Settings](settings.md#resources) and [Pi Packages](packages.md) for these options.

Project templates become available in the editor after trust is granted. Review their content before trusting an unfamiliar project. See [Security](security.md#understand-project-trust).
