import { calculateScore } from "./scoring.js";
import { judgeAnswer } from "./judge.js";

export const MODE_META = {
  quick: { label: "QUICK SPEAK", instruction: "日本語を英語で言おう" },
  memory: { label: "MEMORY SPEAK", instruction: "覚えた英文を声に出そう" },
  listen: { label: "LISTEN & REPEAT", instruction: "聞こえた英文をそのまま言おう" },
  review: { label: "REVIEW", instruction: "苦手表現を英語で言おう" }
};

export function createSession(mode, phrases, rounds) {
  return {
    mode, queue: selectPhrases(phrases, rounds), index: 0, score: 0, combo: 0, maxCombo: 0,
    xp: 0, spoken: 0, ratings: { PERFECT: 0, GREAT: 0, GOOD: 0, RETRY: 0 },
    responseTimes: [], startedAt: Date.now(), memoryMax: 1
  };
}

function selectPhrases(phrases, rounds) {
  const shuffled = [...phrases].sort(() => Math.random() - .5);
  if (!shuffled.length) return [];
  return Array.from({ length: rounds }, (_, i) => shuffled[i % shuffled.length]);
}

export function applyAnswer({ session, phrase, alternatives, responseMs, memoryLevel, config }) {
  const judgement = judgeAnswer(alternatives, phrase, config.judgement);
  if (judgement.rating === "RETRY") session.combo = 0;
  else session.combo += 1;
  session.maxCombo = Math.max(session.maxCombo, session.combo);
  const points = calculateScore({ rating: judgement.rating, combo: session.combo, mode: session.mode, memoryLevel, responseMs }, config);
  session.score += points.total;
  session.spoken += 1;
  session.ratings[judgement.rating] += 1;
  session.responseTimes.push(responseMs);
  session.memoryMax = Math.max(session.memoryMax, memoryLevel);
  session.xp += config.xp.attempt + (config.xp[judgement.rating] || 0);
  return { judgement, points };
}

export function reviewOrder(phrases, progress) {
  const map = new Map(progress.map(item => [item.phraseId, item]));
  return [...phrases].sort((a,b) => {
    const pa = map.get(a.id); const pb = map.get(b.id);
    const wa = (pa?.reviewPriority || 0) + (pa?.failures || 0) * .4 + Math.random() * .5;
    const wb = (pb?.reviewPriority || 0) + (pb?.failures || 0) * .4 + Math.random() * .5;
    return wb - wa;
  });
}

export function memoryMarkup(phrase, level) {
  const answer = phrase.primaryAnswer;
  const tokens = answer.match(/[A-Za-z']+|[^A-Za-z']+/g) || [];
  const wordPositions = tokens.map((token, index) => ({ token, index })).filter(x => /^[A-Za-z']+$/.test(x.token));
  const preferred = new Set((phrase.memoryHoleCandidates || []).map(w => w.toLowerCase()));
  const ranked = [...wordPositions].sort((a,b) => {
    const pref = Number(preferred.has(b.token.toLowerCase())) - Number(preferred.has(a.token.toLowerCase()));
    return pref || (b.token.length - a.token.length) || (Math.random() - .5);
  });
  const ratios = [0, .16, .28, .38, .55, .82];
  const count = Math.max(1, Math.round(wordPositions.length * ratios[level]));
  const hidden = new Set(ranked.slice(0, count).map(x => x.index));
  return tokens.map((token, index) => hidden.has(index)
    ? `<span class="hole" aria-label="空欄">${"_".repeat(Math.max(3, Math.min(8, token.length)))}</span>`
    : escapeHtml(token)).join("");
}

export function updateAutoLevel(settings, rating, config) {
  if (settings.memoryLevel !== "auto") return Number(settings.memoryLevel);
  settings.autoHighStreak = rating === "GREAT" || rating === "PERFECT" ? (settings.autoHighStreak || 0) + 1 : 0;
  settings.autoRetryStreak = rating === "RETRY" ? (settings.autoRetryStreak || 0) + 1 : 0;
  if (settings.autoHighStreak >= config.autoMemory.raiseAfterHighRatings) {
    settings.autoLevel = Math.min(5, (settings.autoLevel || 1) + 1); settings.autoHighStreak = 0;
  }
  if (settings.autoRetryStreak >= config.autoMemory.lowerAfterRetries) {
    settings.autoLevel = Math.max(1, (settings.autoLevel || 1) - 1); settings.autoRetryStreak = 0;
  }
  return settings.autoLevel || 1;
}

function escapeHtml(value) { return value.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" })[c]); }
