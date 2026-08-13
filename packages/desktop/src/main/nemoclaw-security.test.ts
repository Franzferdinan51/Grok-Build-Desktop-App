import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_NEMO_NETWORK, taskApprovalReason } from "./nemoclaw-policy.ts"

test("reading an X post or tweet does not require approval", () => {
  assert.equal(taskApprovalReason("what does this tweet say? https://x.com/grok/status/20"), undefined)
  assert.equal(taskApprovalReason("read this post on X https://twitter.com/foo/status/20"), undefined)
  assert.equal(taskApprovalReason("look at this github repo https://github.com/browseros-ai/BrowserOS"), undefined)
  assert.equal(taskApprovalReason("explain the error message from the build"), undefined)
})

test("actually sending or posting still requires approval", () => {
  assert.equal(taskApprovalReason("tweet this from my account"), "external communication")
  assert.equal(taskApprovalReason("send a message to the whole list"), "external communication")
  assert.equal(taskApprovalReason("post this to twitter"), "external communication")
})

test("network allowlist treats github and X hosts the same", () => {
  assert.ok(DEFAULT_NEMO_NETWORK.includes("github.com"))
  assert.ok(DEFAULT_NEMO_NETWORK.includes("x.com"))
  assert.ok(DEFAULT_NEMO_NETWORK.includes("twitter.com"))
})

test("destructive and credential tasks still require approval", () => {
  assert.equal(taskApprovalReason("delete the repo files"), "destructive filesystem or data action")
  assert.equal(taskApprovalReason("git push origin main"), "repository or external release action")
  assert.equal(taskApprovalReason("print the api key"), "credential or secret-related action")
  assert.equal(taskApprovalReason("curl https://example.com"), "network or remote-system action")
})
