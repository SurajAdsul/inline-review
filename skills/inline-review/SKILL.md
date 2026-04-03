---
name: inline-review
description: "Run the inline-review tool to get user feedback on the current changes."
disable-model-invocation: true
---

# inline-review

Review git diffs in the browser with inline annotations. Opens a local server, renders the diff with syntax highlighting, lets the user comment on lines/ranges, then returns the feedback as a structured prompt.

## Usage

When the user invokes this skill (or you need feedback on changes you've made), run the CLI:

```
$COMMAND: node $SKILL_DIR/scripts/diff-review.js
```

The command will:
1. Run `git diff HEAD` to capture all uncommitted changes
2. Start a local HTTP server and open the browser
3. Block until the user submits feedback or closes the browser
4. Print the formatted feedback to stdout (captured as prompt)
5. Exit

### Flags

- `--staged` — show staged changes only (`git diff --cached`)
- `--unstaged` — show unstaged changes only (`git diff`)
- `--port <n>` — use a specific port (default: random)

### When to use

- After making code changes, to get user review before committing
- When the user asks to review the current diff
- When you want structured, line-specific feedback on your changes

### What you receive

The output is markdown with an instruction prefix and per-file annotations:

```markdown
The user has reviewed your changes and left the following feedback...

## Diff Review Feedback

### src/utils.ts (line 42)
\`\`\`diff
-  const result = input.split(',')
+  const result = input.split(/[,;]/)
\`\`\`
> Why are we also splitting on semicolons?
```

Address each comment by making the requested changes. If a comment is a question, answer it and ask if a code change is needed.

If the user submits with no comments, the output says the changes look good — proceed with committing or the next step.

## Requirements

- Node.js (v18+)
- Git
- A browser
