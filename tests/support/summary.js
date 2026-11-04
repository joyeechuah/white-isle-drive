// Prints a Markdown summary of the last test run (test-results/results.json): passed, failed, flaky and skipped
// counts, the failures by name, and the measurements tests recorded as annotations. Used by the CI workflow.
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "..", "test-results", "results.json");
if (!fs.existsSync(file)) {
  console.log("No test results were written.");
  process.exit(0);
}
const r = JSON.parse(fs.readFileSync(file, "utf8"));
const rows = [];
const walk = (s, trail) => {
  for (const spec of s.specs || [])
    for (const t of spec.tests) {
      const last = t.results[t.results.length - 1] || {};
      rows.push({ title: [...trail, spec.title].filter(Boolean).join(" › "), file: spec.file, status: t.status, outcome: last.status, annotations: t.annotations || [] });
    }
  for (const c of s.suites || []) walk(c, [...trail, c.title && !c.title.endsWith(".js") ? c.title : ""]);
};
for (const s of r.suites) walk(s, []);
const n = (f) => rows.filter(f).length;
const st = r.stats || {};
console.log("## Test results\n");
console.log(`| Passed | Failed | Flaky | Skipped | Time |\n|---|---|---|---|---|`);
console.log(`| ${n((x) => x.status === "expected")} | ${n((x) => x.status === "unexpected")} | ${n((x) => x.status === "flaky")} | ${n((x) => x.status === "skipped")} | ${Math.round((st.duration || 0) / 60000)} min |\n`);
const bad = rows.filter((x) => x.status === "unexpected" || x.status === "flaky");
if (bad.length) {
  console.log("### Failed or flaky\n");
  for (const b of bad) console.log(`- **${b.status === "flaky" ? "flaky" : "failed"}**: ${b.title} (\`${b.file}\`)`);
  console.log("");
}
const notes = rows.flatMap((x) => x.annotations.map((a) => ({ test: x.title, ...a })));
if (notes.length) {
  console.log("### Measurements\n");
  for (const a of notes) console.log(`- ${a.type}: \`${a.description}\``);
}
