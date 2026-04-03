# friday-skills

A collection of AI coding agent skills. Install individual skills or all at once.

## Installation

```bash
# Install a specific skill
npx skills add SurajAdsul/friday-skills --skill inline-review

# Install all skills
npx skills add SurajAdsul/friday-skills
```

## Available Skills

### inline-review

Review git diffs in the browser with inline annotations. Comments flow back as structured prompts for your AI coding agent.

https://github.com/user-attachments/assets/69358592-f885-411f-b83f-1bb724042e91

**Use when:**
- Reviewing changes made by your coding agent before committing
- You want line-specific feedback without copy-pasting diffs
- You prefer a visual diff review over reading terminal output

**Features:**
- Split (side-by-side) and unified diff views
- Per-side commenting in split view (left/right independently)
- Syntax highlighting via Prism.js
- Dark/light theme with GitHub Primer design tokens
- Keyboard shortcuts (j/k files, n/p hunks, c comment)
- File tree sidebar with lazy loading
- Zero npm dependencies — pure Node.js

**How it works:**

1. Run `/inline-review` in your agent
2. A local HTTP server starts and opens your browser
3. Browse changed files, click lines, and leave comments
4. Click **Submit Feedback** — annotations are formatted as markdown and returned to the agent

**Invocation:** By default, user-invocable only (`/inline-review`). To allow the agent to invoke it automatically, remove `disable-model-invocation: true` from the skill's `SKILL.md`.

**CLI flags:**
- `--staged` — staged changes only
- `--unstaged` — unstaged changes only
- `--port <n>` — specific port (default: random)

**Requirements:** Node.js v18+, Git, a browser

## License

MIT
