import test from "node:test"
import assert from "node:assert/strict"
import { decideRunAdmission } from "./run-admission.ts"

test("run admission queues when local, remote, or renderer startup work is busy", () => {
  assert.equal(decideRunAdmission(false, false, false), "start")
  assert.equal(decideRunAdmission(true, false, false), "queue")
  assert.equal(decideRunAdmission(false, true, false), "queue")
  assert.equal(decideRunAdmission(false, false, true), "queue")
})
