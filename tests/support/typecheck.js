// Type-checks the game's code with TypeScript: plain JavaScript checked as it is (checkJs), leniently. The game is
// the inline scripts in index.html; each is checked as a script of its own, sharing one global scope as in the
// browser, padded so every reported line and column is the one in index.html. npm run lint runs it; npm run
// typecheck runs it alone. Options come from tsconfig.json; what comes from outside the game (three.js, Firebase) is
// declared in types/globals.d.ts. A false report is settled where it is, with a JSDoc cast (/** @type {any} */ (x))
// or a typed default, never with a blanket ignore.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.join(__dirname, "..", "..");
const norm = (f) => f.replace(/\\/g, "/");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const cfg = ts.readConfigFile(path.join(ROOT, "tsconfig.json"), ts.sys.readFile);
if (cfg.error) throw new Error(ts.flattenDiagnosticMessageText(cfg.error.messageText, "\n"));
const { options } = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);

// each inline <script> becomes index.html.N.js, with blank lines and spaces in front so it starts where it does
const virtual = new Map();
let n = 0;
for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
  const before = html.slice(0, m.index + m[0].indexOf(">") + 1);
  const pad = "\n".repeat(before.split("\n").length - 1) + " ".repeat(before.length - before.lastIndexOf("\n") - 1);
  virtual.set(norm(path.join(ROOT, `index.html.${++n}.js`)), pad + m[1]);
}
const host = ts.createCompilerHost(options);
const { getSourceFile, fileExists, readFile } = host;
host.fileExists = (f) => virtual.has(norm(f)) || fileExists.call(host, f);
host.readFile = (f) => virtual.get(norm(f)) ?? readFile.call(host, f);
host.getSourceFile = (f, lang, ...rest) =>
  virtual.has(norm(f)) ? ts.createSourceFile(f, virtual.get(norm(f)), lang, true, ts.ScriptKind.JS) : getSourceFile.call(host, f, lang, ...rest);
const files = [path.join(ROOT, "types", "globals.d.ts"), ...virtual.keys()];
const diags = ts.getPreEmitDiagnostics(ts.createProgram(files, options, host));
for (const d of diags) {
  let where = "";
  if (d.file) {
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
    where = `${path.relative(ROOT, d.file.fileName).replace(/\.\d+\.js$/, "")}:${line + 1}:${character + 1}  `;
  }
  console.log(`${where}TS${d.code}  ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);
}
console.log(`${diags.length} type error(s)`);
process.exitCode = diags.length ? 1 : 0;
