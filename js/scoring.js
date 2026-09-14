export function comboMultiplier(combo, bands) {
  const band = bands.find(({ min, max }) => combo >= min && (max === null || combo <= max));
  return band?.value ?? 1;
}

export function speedBonus(responseMs, rating, speedConfig) {
  if (rating === "RETRY" || !Number.isFinite(responseMs)) return { label: null, points: 0 };
  if (responseMs <= speedConfig.fastMs) return { label: "FAST", points: speedConfig.fastPoints };
  if (responseMs <= speedConfig.quickMs) return { label: "QUICK", points: speedConfig.quickPoints };
  return { label: null, points: 0 };
}

export function calculateScore({ rating, combo, mode, memoryLevel = 1, responseMs }, config) {
  const base = config.ratings[rating] ?? 0;
  const comboRate = comboMultiplier(combo, config.comboMultipliers);
  const fever = combo >= config.fever.startsAtCombo;
  const feverRate = fever ? config.fever.multiplier : 1;
  const memoryRate = mode === "memory" ? config.memoryMultipliers[String(memoryLevel)] ?? 1 : 1;
  const bonus = speedBonus(responseMs, rating, config.speedBonus);
  return {
    total: Math.round(base * comboRate * feverRate * memoryRate + bonus.points),
    base,
    comboRate,
    fever,
    feverRate,
    memoryRate,
    speed: bonus
  };
}

export function levelInfo(totalXp) {
  let level = 1;
  let floor = 0;
  let needed = 500;
  while (totalXp >= floor + needed) {
    floor += needed;
    level += 1;
    needed = Math.round(500 * Math.pow(level, 1.22) / 50) * 50;
  }
  return { level, floor, next: floor + needed, progress: (totalXp - floor) / needed };
}
