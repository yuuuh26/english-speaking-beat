import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateScore, comboMultiplier, speedBonus, levelInfo } from "../js/scoring.js";
import { normalizeSpeech, similarity, judgeAnswer } from "../js/judge.js";
import { memoryMarkup, updateAutoLevel } from "../js/game.js";
const config = JSON.parse(await readFile(new URL("../data/game-config.json", import.meta.url)));
const phrase = { primaryAnswer:"Could you say that again?", acceptedAnswers:["Can you say that again?"], requiredWords:["again"], memoryHoleCandidates:["say","again"] };
test("official score examples", () => {
  assert.equal(calculateScore({rating:"PERFECT",combo:10,mode:"quick",responseMs:900},config).total,320);
  assert.equal(calculateScore({rating:"PERFECT",combo:30,mode:"memory",memoryLevel:5,responseMs:900},config).total,1250);
});
test("combo and speed boundaries", () => {
  assert.equal(comboMultiplier(4,config.comboMultipliers),1.05); assert.equal(comboMultiplier(30,config.comboMultipliers),2);
  assert.deepEqual(speedBonus(1000,"GREAT",config.speedBonus),{label:"FAST",points:50});
  assert.deepEqual(speedBonus(1001,"GREAT",config.speedBonus),{label:"QUICK",points:25}); assert.equal(speedBonus(500,"RETRY",config.speedBonus).points,0);
});
test("speech normalization and accepted answer", () => {
  assert.equal(normalizeSpeech("I'm not sure."),"i am not sure"); assert.ok(similarity("Could you say that again","Could you say that again?")>.99);
  assert.equal(judgeAnswer(["Can you say that again"],phrase,config.judgement).rating,"PERFECT");
});
test("important omissions do not pass highly", () => assert.equal(judgeAnswer(["Could you say that"],phrase,config.judgement).rating,"RETRY"));
test("memory markup and AUTO level", () => {
  assert.match(memoryMarkup(phrase,1),/class="hole"/); assert.ok((memoryMarkup(phrase,5).match(/class="hole"/g)||[]).length>=3);
  const settings={memoryLevel:"auto",autoLevel:1}; updateAutoLevel(settings,"PERFECT",config); updateAutoLevel(settings,"GREAT",config); updateAutoLevel(settings,"PERFECT",config); assert.equal(settings.autoLevel,2);
  updateAutoLevel(settings,"RETRY",config); updateAutoLevel(settings,"RETRY",config); assert.equal(settings.autoLevel,1);
});
test("level curve is monotonic", () => { assert.equal(levelInfo(0).level,1); assert.ok(levelInfo(500).level>=2); });
