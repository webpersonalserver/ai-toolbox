// A round is 10 questions; stars depend on how many were right on the first try.
const ROUND_SIZE = 10
const STAR_THRESHOLDS = [
  { stars: 3, minFirstTry: 9 },
  { stars: 2, minFirstTry: 7 },
  { stars: 1, minFirstTry: 5 }
]

const starsOfRound = (firstTryCorrect) => {
  const reached = STAR_THRESHOLDS.find((threshold) => firstTryCorrect >= threshold.minFirstTry)
  return reached ? reached.stars : 0
}

// What the next star needs, shown on the result card ("再多答对 2 题就是两颗星").
const nextStarHint = (firstTryCorrect) => {
  const nextThreshold = [...STAR_THRESHOLDS].reverse().find((threshold) => firstTryCorrect < threshold.minFirstTry)
  return nextThreshold ? { stars: nextThreshold.stars, more: nextThreshold.minFirstTry - firstTryCorrect } : null
}

module.exports = { ROUND_SIZE, STAR_THRESHOLDS, starsOfRound, nextStarHint }
