export const ECONOMY = {
  coinsPerHit: 5,
  coinsPerWaveClear: 15,
  scorePerHit: 100,
  scorePerWaveClear: 250,
  confettiUnlockCoins: 40,
  c4UnlockCoins: 90,
  highScoreKey: "blastingWorld.donutShop.highScore",
  totalWaves: 3,
} as const;

export function loadHighScore(): number {
  try {
    const raw = localStorage.getItem(ECONOMY.highScoreKey);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function saveHighScore(score: number): number {
  const prev = loadHighScore();
  const next = Math.max(prev, score);
  try {
    localStorage.setItem(ECONOMY.highScoreKey, String(next));
  } catch {
    /* ignore quota / private mode */
  }
  return next;
}
