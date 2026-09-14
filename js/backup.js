import { levelInfo } from "./scoring.js";

const modeNames = { quick: "QUICK SPEAK", memory: "MEMORY SPEAK", listen: "LISTEN & REPEAT", review: "REVIEW" };

export function buildMarkdown(profile, progress) {
  const level = levelInfo(profile.xp).level;
  const rows = progress.sort((a,b) => b.reviewPriority - a.reviewPriority).map(p =>
    `| ${p.phraseId} | ${p.attempts} | ${p.successes} | ${p.failures} | ${p.reviewPriority.toFixed(1)} |`
  ).join("\n") || "| — | 0 | 0 | 0 | 0 |";
  const modes = Object.entries(profile.modes || {}).map(([key, value]) =>
    `| ${modeNames[key] || key} | ${value.sessions} | ${value.spoken} | ${value.score} |`
  ).join("\n") || "| — | 0 | 0 | 0 |";
  return `# SPEAK BEAT バックアップ

- 出力日時: ${new Date().toISOString()}
- データ形式: v1

## Profile

- Level: ${level}
- XP: ${profile.xp}
- Current Streak: ${profile.currentStreak} days
- Best Streak: ${profile.bestStreak} days
- 累計発話数: ${profile.totalSpoken}
- 累計学習時間: ${formatDuration(profile.totalStudyMs)}
- 最大Combo: ${profile.maxCombo}

## Ratings

| PERFECT | GREAT | GOOD | RETRY |
|---:|---:|---:|---:|
| ${profile.ratings.PERFECT} | ${profile.ratings.GREAT} | ${profile.ratings.GOOD} | ${profile.ratings.RETRY} |

## モード別成績

| Mode | Sessions | Spoken | Score |
|---|---:|---:|---:|
${modes}

## 問題別進捗

| Phrase ID | Attempts | Successes | Failures | Review Priority |
|---|---:|---:|---:|---:|
${rows}
`;
}

export function downloadMarkdown(markdown) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob);
  link.download = `english-speaking-beat-backup-${new Date().toISOString().slice(0,10)}.md`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000); const seconds = Math.floor(ms % 60000 / 1000);
  return `${minutes}分${seconds}秒`;
}
