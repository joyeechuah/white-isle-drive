// Static checks on the game's code: ESLint over the script inside index.html (and 404.html), with rules that catch
// real mistakes (undefined names, duplicate keys, unreachable code and the like). Errors fail; warnings are listed.
// Run with `npm run lint`; CI runs it before the browser tests.
const fs = require("fs");
const path = require("path");
const { ESLint } = require("eslint");
const globals = require("globals");

const ROOT = path.resolve(__dirname, "..", "..");
const RULES = {
  "no-undef": "error", "no-dupe-keys": "error", "no-unreachable": "error", "no-redeclare": "error", "no-self-assign": "error",
  "no-dupe-else-if": "error", "no-duplicate-case": "error", "use-isnan": "error", "valid-typeof": "error", "no-loss-of-precision": "error",
  "no-self-compare": "error", "no-unsafe-negation": "error", "no-shadow-restricted-names": "error", "no-func-assign": "error",
  "no-const-assign": "error", "no-setter-return": "error", "no-dupe-args": "error", "no-compare-neg-zero": "error", "no-unsafe-finally": "error",
  "no-global-assign": "error", "getter-return": "error", "no-obj-calls": "error", "no-misleading-character-class": "error",
  "no-async-promise-executor": "error", "no-unsafe-optional-chaining": "error",
  "no-cond-assign": "warn", "no-fallthrough": "warn", "no-sparse-arrays": "warn", "no-constant-condition": ["warn", { checkLoops: false }],
  "no-unused-vars": ["warn", { vars: "local", args: "none", caughtErrors: "none" }], "no-unused-expressions": ["warn", { allowShortCircuit: true, allowTernary: true }],
  "no-empty": ["warn", { allowEmptyCatch: true }], "no-unmodified-loop-condition": "warn", "array-callback-return": "warn", "no-case-declarations": "warn",
};

(async () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{ languageOptions: { ecmaVersion: 2021, sourceType: "script", globals: { ...globals.browser, THREE: "readonly" } }, rules: RULES }],
  });
  let errors = 0,
    warnings = 0;
  for (const file of ["index.html", "404.html"]) {
    const html = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      const startLine = html.slice(0, m.index + m[0].indexOf(">") + 1).split("\n").length - 1;
      const [res] = await eslint.lintText(m[1]);
      for (const msg of res.messages) {
        const kind = msg.severity === 2 ? "error" : "warning";
        if (kind === "error") errors++;
        else warnings++;
        console.log(`${file}:${startLine + msg.line}:${msg.column}  ${kind}  ${msg.message}  (${msg.ruleId})`);
      }
    }
  }
  console.log(`\n${errors} error(s), ${warnings} warning(s)`);
  process.exit(errors ? 1 : 0);
})();
