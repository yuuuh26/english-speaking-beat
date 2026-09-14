import { readFile } from "node:fs/promises";
const phrases = JSON.parse(await readFile(new URL("../data/phrases-core.json", import.meta.url)));
const config = JSON.parse(await readFile(new URL("../data/game-config.json", import.meta.url)));
const ids = new Set(); const errors = [];
for (const [index, phrase] of phrases.entries()) {
  for (const key of ["id","category","ja","primaryAnswer"]) if (!phrase[key]) errors.push(`phrase ${index + 1}: ${key} is required`);
  if (ids.has(phrase.id)) errors.push(`duplicate id: ${phrase.id}`); ids.add(phrase.id);
  if (!Array.isArray(phrase.acceptedAnswers)) errors.push(`${phrase.id}: acceptedAnswers must be an array`);
}
if (phrases.length !== 100) errors.push(`expected 100 phrases, found ${phrases.length}`);
if (config.ratings.GOOD !== 100 || config.ratings.GREAT !== 150 || config.ratings.PERFECT !== 200) errors.push("score constants do not match the specification");
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
const categories = phrases.reduce((acc,p) => ((acc[p.category] ||= []).push(p), acc), {});
console.log(`Validated ${phrases.length} phrases across ${Object.keys(categories).length} categories.`);
