import assert from "node:assert/strict";
import { isDictating, DICTATING_BODY_CLASS } from "../src/focusMode.ts";

assert.equal(DICTATING_BODY_CLASS, "dictating");

// El foco solo se activa mientras se graba.
assert.equal(isDictating("recording"), true);
assert.equal(isDictating("idle"), false);
assert.equal(isDictating("stopping"), false);

console.log("focus-mode.test.mjs OK");
