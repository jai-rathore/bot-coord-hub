import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SAGE_NAME, sageNameFor } from "./sage";

test("an account that never renamed its agent gets the default", () => {
  assert.equal(sageNameFor({ hostedAgentName: null }), DEFAULT_SAGE_NAME);
  assert.equal(sageNameFor({ hostedAgentName: "" }), DEFAULT_SAGE_NAME);
  assert.equal(sageNameFor({ hostedAgentName: "   " }), DEFAULT_SAGE_NAME);
});

test("a chosen name is used verbatim", () => {
  assert.equal(sageNameFor({ hostedAgentName: "Mochi" }), "Mochi");
  // Stored padding must not reach the event copy it lands in.
  assert.equal(sageNameFor({ hostedAgentName: "  Mochi  " }), "Mochi");
});
