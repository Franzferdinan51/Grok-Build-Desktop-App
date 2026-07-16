import assert from "node:assert/strict"
import test from "node:test"
import { buildAutoLearnPrompt, buildLearnPrompt } from "./learn-prompt.ts"

test("learn prompt preserves explicit sources and requirements", () => {
  const prompt = buildLearnPrompt("https://example.com/docs focus on auth", [])
  assert.match(prompt, /https:\/\/example\.com\/docs focus on auth/)
  assert.match(prompt, /\.grok\/skills\//)
  assert.match(prompt, /Inspect all named sources/)
})

test("bare learn prompt uses recent conversation", () => {
  const prompt = buildLearnPrompt("", [
    { role: "user", text: "Deploy this with the release script" },
    { role: "assistant", text: "Deployment verified" },
  ])
  assert.match(prompt, /workflow we just completed/)
  assert.match(prompt, /User: Deploy this with the release script/)
  assert.match(prompt, /Grok: Deployment verified/)
})

test("auto learn is scoped to project skills", () => {
  const prompt = buildAutoLearnPrompt([{ role: "user", text: "That fix worked" }])
  assert.match(prompt, /Modify only \.grok\/skills\/\*\*/)
  assert.match(prompt, /make no changes/)
  assert.match(prompt, /User: That fix worked/)
})
