type LearnMessage = { role: "user" | "assistant"; text: string }

const SKILL_STANDARD = `Create exactly one reusable Grok Build skill.

Skill rules:
- Save project skills under .grok/skills/<lowercase-hyphenated-name>/SKILL.md.
- Use YAML frontmatter with name and a one-sentence description.
- The description must state when the skill should trigger.
- Keep instructions concrete, concise, and grounded in sources you actually inspect.
- Never invent commands, flags, paths, APIs, or behavior.
- Put non-trivial scripts in scripts/, references in references/, and templates in templates/ beside SKILL.md.
- Include: When to Use, Prerequisites, Procedure, Pitfalls, and Verification when applicable.
- Frame all execution through tools Grok Build really has. Do not describe fictional tools.
- Do not create a router, index, or placeholder skill.
- Do not modify unrelated workspace files.
- Before finishing, re-read the generated skill and verify its paths and commands.`

export function buildLearnPrompt(request: string, conversation: LearnMessage[]): string {
  const trimmed = request.trim()
  const source = trimmed || "the workflow we just completed in this conversation"
  const transcript = conversation
    .slice(-12)
    .map((message) => `${message.role === "user" ? "User" : "Grok"}: ${message.text}`)
    .join("\n\n")
    .slice(-12_000)

  return `[/learn] Distill a reusable skill from the user's request and save it in this workspace.

## What to learn
${source}

${transcript ? `## Recent conversation context\n${transcript}\n\n` : ""}Treat every URL, file path, pasted note, focus area, exclusion, and constraint in the request as load-bearing. Inspect all named sources with your normal Grok Build tools. If no explicit source was supplied, infer the repeatable workflow from the recent conversation context above. Make a reasonable scoped choice instead of stalling on minor ambiguity.

${SKILL_STANDARD}

When finished, report the skill name, its saved path, what it learned, and how you verified it.`
}
