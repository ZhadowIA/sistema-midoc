import assert from "node:assert/strict";
import { isNightTheme, nextTheme, themeToggleLabel, THEME_STORAGE_KEY } from "../src/theme.ts";

assert.equal(THEME_STORAGE_KEY, "midoc-theme");

// isNightTheme: solo "night" es nocturno.
assert.equal(isNightTheme("night"), true);
assert.equal(isNightTheme("light"), false);
assert.equal(isNightTheme(null), false);
assert.equal(isNightTheme(undefined), false);
assert.equal(isNightTheme(""), false);

// nextTheme: alterna ida y vuelta.
assert.equal(nextTheme("light"), "night");
assert.equal(nextTheme("night"), "light");

// themeToggleLabel: nombra el destino, no el estado actual.
assert.match(themeToggleLabel("light"), /nocturno/i);
assert.match(themeToggleLabel("night"), /claro/i);

console.log("theme.test.mjs OK");
