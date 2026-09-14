const OPTIONAL_FILLERS = new Set(["please", "well"]);

export function normalizeSpeech(value = "") {
  return value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\b(i'm)\b/g, "i am")
    .replace(/\b(i'd)\b/g, "i would")
    .replace(/\b(i'll)\b/g, "i will")
    .replace(/\b(i've)\b/g, "i have")
    .replace(/\b(you're)\b/g, "you are")
    .replace(/\b(you'd)\b/g, "you would")
    .replace(/\b(you'll)\b/g, "you will")
    .replace(/\b(we're)\b/g, "we are")
    .replace(/\b(we've)\b/g, "we have")
    .replace(/\b(they're)\b/g, "they are")
    .replace(/\b(it's)\b/g, "it is")
    .replace(/\b(that's)\b/g, "that is")
    .replace(/\b(what's)\b/g, "what is")
    .replace(/\b(can't)\b/g, "cannot")
    .replace(/\b(don't)\b/g, "do not")
    .replace(/\b(doesn't)\b/g, "does not")
    .replace(/\b(didn't)\b/g, "did not")
    .replace(/\b(won't)\b/g, "will not")
    .replace(/\b(wouldn't)\b/g, "would not")
    .replace(/\b(couldn't)\b/g, "could not")
    .replace(/[^a-z0-9' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = old;
    }
  }
  return prev[b.length];
}

export function similarity(a, b) {
  const aa = normalizeSpeech(a); const bb = normalizeSpeech(b);
  if (!aa && !bb) return 1;
  if (!aa || !bb) return 0;
  return 1 - levenshtein(aa, bb) / Math.max(aa.length, bb.length);
}

function wordCoverage(spoken, answer) {
  const spokenWords = normalizeSpeech(spoken).split(" ").filter(Boolean);
  const answerWords = normalizeSpeech(answer).split(" ").filter(Boolean);
  const pool = [...spokenWords]; let matched = 0;
  answerWords.forEach(word => {
    const index = pool.indexOf(word);
    if (index >= 0) { matched += 1; pool.splice(index, 1); }
    else if (OPTIONAL_FILLERS.has(word)) matched += .5;
  });
  return answerWords.length ? matched / answerWords.length : 0;
}

function missingWords(spoken, answer) {
  const pool = normalizeSpeech(spoken).split(" ");
  return normalizeSpeech(answer).split(" ").filter(word => {
    const index = pool.indexOf(word);
    if (index >= 0) { pool.splice(index, 1); return false; }
    return !OPTIONAL_FILLERS.has(word);
  });
}

export function judgeAnswer(alternatives, phrase, thresholds) {
  const answers = [phrase.primaryAnswer, ...(phrase.acceptedAnswers || [])];
  const candidates = (alternatives || []).map(item => typeof item === "string" ? item : item.transcript).filter(Boolean);
  let best = { score: 0, transcript: candidates[0] || "", answer: phrase.primaryAnswer, coverage: 0 };
  for (const transcript of candidates) {
    for (const answer of answers) {
      const sim = similarity(transcript, answer);
      const coverage = wordCoverage(transcript, answer);
      const exact = normalizeSpeech(transcript) === normalizeSpeech(answer);
      const score = exact ? 1 : sim * .62 + coverage * .38;
      if (score > best.score) best = { score, transcript, answer, coverage };
    }
  }
  const required = phrase.requiredWords || [];
  const normalized = normalizeSpeech(best.transcript);
  const hasRequired = required.every(word => normalized.includes(normalizeSpeech(word)));
  let rating = "RETRY";
  if (best.score >= thresholds.perfect && hasRequired) rating = "PERFECT";
  else if (best.score >= thresholds.great && hasRequired) rating = "GREAT";
  else if (best.score >= thresholds.good && best.coverage >= .62 && hasRequired) rating = "GOOD";
  return { ...best, rating, missing: missingWords(best.transcript, best.answer), hasRequired };
}
