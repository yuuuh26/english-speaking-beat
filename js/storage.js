const DB_NAME = "speak-beat";
const DB_VERSION = 1;

const DEFAULT_PROFILE = {
  id: "main", xp: 0, totalSpoken: 0, totalStudyMs: 0, currentStreak: 0, bestStreak: 0,
  lastStudyDate: null, maxCombo: 0, ratings: { PERFECT: 0, GREAT: 0, GOOD: 0, RETRY: 0 }, modes: {}, updatedAt: null
};

const DEFAULT_SETTINGS = {
  id: "settings", bgmVolume: .55, sfxVolume: .8, ttsVolume: 1, ttsRate: .9, ducking: .65,
  track: "none", speechLang: "en-US", effects: "strong", vibration: true, rounds: 10, memoryLevel: "auto", autoLevel: 1
};

function requestPromise(request) {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

export class Store {
  async open() {
    if (!window.indexedDB) throw new Error("IndexedDB is not supported");
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("profile")) db.createObjectStore("profile", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "id" });
      if (!db.objectStoreNames.contains("progress")) db.createObjectStore("progress", { keyPath: "phraseId" });
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id", autoIncrement: true });
    };
    this.db = await requestPromise(request);
    return this;
  }
  store(name, mode = "readonly") { return this.db.transaction(name, mode).objectStore(name); }
  async get(name, key) { return requestPromise(this.store(name).get(key)); }
  async put(name, value) { return requestPromise(this.store(name, "readwrite").put(value)); }
  async getAll(name) { return requestPromise(this.store(name).getAll()); }
  async profile() { const saved = await this.get("profile", "main"); return { ...DEFAULT_PROFILE, ...saved, ratings: { ...DEFAULT_PROFILE.ratings, ...(saved?.ratings || {}) } }; }
  async settings() { return { ...DEFAULT_SETTINGS, ...(await this.get("settings", "settings")) }; }
  async saveSettings(settings) { return this.put("settings", { ...settings, id: "settings" }); }

  async recordAttempt({ phrase, mode, rating, responseMs }) {
    const current = await this.get("progress", phrase.id) || { phraseId: phrase.id, attempts: 0, successes: 0, failures: 0, recent: [], reviewPriority: 0 };
    current.attempts += 1;
    if (rating === "RETRY") current.failures += 1; else current.successes += 1;
    current.recent = [{ rating, responseMs, at: new Date().toISOString() }, ...current.recent].slice(0, 10);
    const weight = { RETRY: 3, GOOD: 1.5, GREAT: -.5, PERFECT: -1 }[rating];
    current.reviewPriority = Math.max(0, Math.min(20, current.reviewPriority + weight));
    current.lastMode = mode; current.updatedAt = new Date().toISOString();
    await this.put("progress", current);
    return current;
  }

  async saveSession(session) {
    const profile = await this.profile();
    const today = localDateKey();
    const previous = profile.lastStudyDate;
    const qualifies = session.spoken >= 5 || session.durationMs >= 180000;
    if (qualifies && previous !== today) {
      profile.currentStreak = previous === addDays(today, -1) ? profile.currentStreak + 1 : 1;
      profile.bestStreak = Math.max(profile.bestStreak, profile.currentStreak);
      profile.lastStudyDate = today;
    }
    profile.xp += session.xp;
    profile.totalSpoken += session.spoken;
    profile.totalStudyMs += session.durationMs;
    profile.maxCombo = Math.max(profile.maxCombo, session.maxCombo);
    Object.keys(profile.ratings).forEach(key => { profile.ratings[key] += session.ratings[key] || 0; });
    const modeStats = profile.modes[session.mode] || { sessions: 0, spoken: 0, score: 0, ratings: { PERFECT: 0, GREAT: 0, GOOD: 0, RETRY: 0 } };
    modeStats.sessions += 1; modeStats.spoken += session.spoken; modeStats.score += session.score;
    Object.keys(modeStats.ratings).forEach(key => { modeStats.ratings[key] += session.ratings[key] || 0; });
    profile.modes[session.mode] = modeStats; profile.updatedAt = new Date().toISOString();
    await this.put("profile", profile);
    await this.put("sessions", { ...session, playedAt: new Date().toISOString() });
    return profile;
  }

  async todayStats() {
    const today = localDateKey(); const sessions = await this.getAll("sessions");
    return sessions.filter(s => s.playedAt && localDateKey(new Date(s.playedAt)) === today).reduce((acc, s) => ({ spoken: acc.spoken + s.spoken, durationMs: acc.durationMs + s.durationMs }), { spoken: 0, durationMs: 0 });
  }
}

export function localDateKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(dateKey, amount) {
  const date = new Date(`${dateKey}T12:00:00`); date.setDate(date.getDate() + amount); return localDateKey(date);
}

export async function persistenceStatus(request = false) {
  if (!navigator.storage?.persisted) return "unknown";
  try {
    if (await navigator.storage.persisted()) return "enabled";
    if (request && navigator.storage.persist && await navigator.storage.persist()) return "enabled";
    return "not-applied";
  } catch { return "unknown"; }
}
