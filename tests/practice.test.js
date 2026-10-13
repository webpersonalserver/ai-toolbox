const path = require('path')
const { TIERS, TIER_ORDER, generateQuestion, isCorrect, needsRegrouping } = require(path.join(__dirname, '..', 'utils', 'practice', 'arithmetic'))

const SAMPLES_PER_TIER = 6000

// Deterministic generator so failures can be reproduced.
const seededRng = (seed) => {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }
}

let failed = 0
const check = (condition, message, detail) => {
  if (!condition) {
    failed += 1
    console.log('FAIL', message, JSON.stringify(detail))
  }
}

TIER_ORDER.forEach((tier) => {
  const config = TIERS[tier]
  const rng = seededRng(tier * 7919)
  const counts = { forms: {}, regroup: 0 }
  let previousKey = ''
  for (let index = 0; index < SAMPLES_PER_TIER; index += 1) {
    const question = generateQuestion(tier, { rng, previousKey })
    const { left, right, result, operation, blank, answer } = question
    const numbers = [left, right, result]
    check(numbers.every((value) => Number.isInteger(value) && value >= 0 && value <= config.max), `${tier}: numbers within range`, question)
    check(operation === '+' ? left + right === result : left - right === result, `${tier}: equation holds`, question)
    check(answer === { left, right, result }[blank], `${tier}: answer matches blank`, question)
    check(String(answer).length <= config.maxInputDigits, `${tier}: answer fits the input box`, question)
    check(question.key !== previousKey, `${tier}: no immediate repeat`, question)
    check(isCorrect(question, String(answer)) && !isCorrect(question, String(answer + 1)) && !isCorrect(question, ''), `${tier}: isCorrect`, question)
    const form = `${operation}${blank}`
    counts.forms[form] = (counts.forms[form] || 0) + 1
    if (needsRegrouping(operation, left, right)) counts.regroup += 1
    previousKey = question.key
  }
  const formShares = Object.values(counts.forms).map((count) => count / SAMPLES_PER_TIER)
  check(Object.keys(counts.forms).length === 6, `${tier}: all six forms appear`, counts.forms)
  check(formShares.every((share) => share > 0.12 && share < 0.22), `${tier}: forms roughly balanced`, counts.forms)
  const regroupShare = counts.regroup / SAMPLES_PER_TIER
  // Within 10 there is no target ratio: sums reaching 10 (3 + 7) and 10 − 3 count as regrouping and are normal there.
  if (config.regroupRatio) {
    check(Math.abs(regroupShare - config.regroupRatio) < 0.08, `${tier}: regrouping share near ${config.regroupRatio}`, regroupShare)
  }
  console.log(`tier ${tier}: ${SAMPLES_PER_TIER} questions, regrouping ${(regroupShare * 100).toFixed(1)}%, forms ${JSON.stringify(counts.forms)}`)
})

// Client-side reward preview must agree with the cloud rules (same shape as DEFAULT_RULES.practice).
const rewardsPreview = require(path.join(__dirname, '..', 'utils', 'practice', 'rewards'))
const PRACTICE_RULES = {
  solvedRewards: [{ every: 20, rewards: [{ type: 'stamina', amount: 2 }] }, { every: 100, rewards: [{ type: 'hint', amount: 1 }] }],
  streakRewards: {
    milestones: [10, 20, 30, 50].map((streak) => ({ streak, rewards: [{ type: 'stamina', amount: 1 }] })),
    repeatEvery: 50,
    repeatRewards: [{ type: 'stamina', amount: 3 }]
  },
  dailyCaps: { stamina: 15, hint: 3 }
}
const expectReward = (condition, label) => {
  if (!condition) {
    failed += 1
    console.log('FAIL', label)
  }
}
const nothingEarned = { stamina: 0, hint: 0 }
const expects = (fromTotal, streak, countsForStreak, earnedToday = nothingEarned) =>
  rewardsPreview.expectsChest(PRACTICE_RULES, earnedToday, { fromTotal, toTotal: fromTotal + 1, streak, countsForStreak })
expectReward(rewardsPreview.nextSolvedChest(13, PRACTICE_RULES, nothingEarned).remaining === 7, '13 solved -> 7 to next chest')
expectReward(rewardsPreview.nextSolvedChest(95, PRACTICE_RULES, nothingEarned).remaining === 5, '95 solved -> nearest chest wins')
expectReward(rewardsPreview.nextSolvedChest(13, PRACTICE_RULES, { stamina: 15, hint: 0 }).remaining === 87, 'stamina capped -> next chest is the hint one')
expectReward(rewardsPreview.nextSolvedChest(13, PRACTICE_RULES, { stamina: 15, hint: 3 }) === null, 'all capped -> no solved chest')
expectReward(rewardsPreview.nextStreakChest(0, PRACTICE_RULES, nothingEarned).target === 10, 'first streak target 10')
expectReward(rewardsPreview.nextStreakChest(50, PRACTICE_RULES, nothingEarned).target === 100 && rewardsPreview.nextStreakChest(120, PRACTICE_RULES, nothingEarned).target === 150, 'repeat streak targets every 50')
expectReward(rewardsPreview.nextStreakChest(0, PRACTICE_RULES, { stamina: 15, hint: 0 }) === null, 'stamina-only streak chests hidden once stamina capped')
expectReward(expects(19, 1, true) && !expects(20, 1, true), 'solved chest at the 20th answer only')
expectReward([10, 20, 30, 50, 100, 150].every((streak) => expects(0, streak, true)) && ![9, 11, 60, 99].some((streak) => expects(0, streak, true)), 'streak chest moments')
expectReward(!expects(0, 10, false), 'retried answers do not reach streak chests')
expectReward(!expects(19, 1, true, { stamina: 15, hint: 0 }) && expects(99, 1, true, { stamina: 15, hint: 0 }), 'capped items do not promise a chest')
expectReward(rewardsPreview.isDailyCapReached({ stamina: 15, hint: 3 }, PRACTICE_RULES.dailyCaps) && !rewardsPreview.isDailyCapReached({ stamina: 15, hint: 2 }, PRACTICE_RULES.dailyCaps), 'daily cap needs every item capped')

const FLOWER_RULES = { arithmeticSolvedEvery: 10, arithmeticStreaks: [10] }
const flowerAt = (fromTotal, streak, countsForStreak) => rewardsPreview.expectsFlower(FLOWER_RULES, { fromTotal, toTotal: fromTotal + 1, streak, countsForStreak })
expectReward(flowerAt(9, 1, true) && !flowerAt(10, 1, true), 'flower at every 10th answer')
expectReward(flowerAt(3, 10, true) && !flowerAt(3, 10, false) && !flowerAt(3, 11, true), 'flower when a run reaches streak 10')

console.log(failed ? `${failed} checks failed` : 'all practice checks passed')
process.exitCode = failed ? 1 : 0
