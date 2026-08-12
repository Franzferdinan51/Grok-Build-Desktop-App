import assert from "node:assert/strict"
import test from "node:test"
import { WORKFLOWS, frameWorkflowPrompt, parseWorkflowName } from "./workflow-presets.ts"

test("parseWorkflowName accepts Duck-Agent workflow ids", () => {
  assert.equal(parseWorkflowName("plan inspect auth"), "plan")
  assert.equal(parseWorkflowName("CODE"), "code")
  assert.equal(parseWorkflowName("unknown"), undefined)
})

test("frameWorkflowPrompt keeps the goal and refuses fake verification", () => {
  const prompt = frameWorkflowPrompt("research", "Compare Grok Build headless flags")
  assert.match(prompt, /\[Duck-Agent research workflow\]/)
  assert.match(prompt, /Compare Grok Build headless flags/)
  assert.match(prompt, /Do not claim verification you did not perform/)
  assert.equal(WORKFLOWS.plan.permissionMode, "plan")
  assert.equal(WORKFLOWS.code.selfVerify, true)
})
