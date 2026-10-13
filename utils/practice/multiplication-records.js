const { readJson, writeJson } = require('./records')

const PROGRESS_KEY = 'practice.multiplication.progress.v1'

const emptyProgress = () => ({ rows: {}, exam: { passed: false, passCount: 0, attempts: 0, bestCorrect: 0, fastestSeconds: 0, passedAt: 0 } })

const readProgress = () => {
  const stored = readJson(PROGRESS_KEY, null)
  const empty = emptyProgress()
  return stored ? { rows: { ...stored.rows }, exam: { ...empty.exam, ...stored.exam } } : empty
}

const rowProgressOf = (progress, row) => ({ studied: false, mastered: false, stars: 0, ...progress.rows[row] })

const masteredRowCount = (progress) => Object.values(progress.rows).filter((row) => row.mastered).length

const markStudied = (row) => {
  const progress = readProgress()
  progress.rows[row] = { ...rowProgressOf(progress, row), studied: true }
  writeJson(PROGRESS_KEY, progress)
}

// Keeps the best stars ever earned for the row.
const saveTrainingResult = (row, stars) => {
  const progress = readProgress()
  const previous = rowProgressOf(progress, row)
  progress.rows[row] = { ...previous, studied: true, mastered: true, stars: Math.max(previous.stars, stars) }
  writeJson(PROGRESS_KEY, progress)
  return { firstMastery: !previous.mastered, improvedStars: stars > previous.stars }
}

const saveExamResult = ({ passed, correct, seconds }) => {
  const progress = readProgress()
  const { exam } = progress
  const firstPass = passed && !exam.passed
  const fasterPass = passed && (!exam.fastestSeconds || seconds < exam.fastestSeconds)
  progress.exam = {
    passed: exam.passed || passed,
    passCount: exam.passCount + (passed ? 1 : 0),
    attempts: exam.attempts + 1,
    bestCorrect: Math.max(exam.bestCorrect, correct),
    fastestSeconds: fasterPass ? seconds : exam.fastestSeconds,
    passedAt: firstPass ? Date.now() : exam.passedAt
  }
  writeJson(PROGRESS_KEY, progress)
  return { firstPass, fasterPass: fasterPass && !firstPass }
}

// Replaces the local cache with the cloud's merged copy.
const writeProgress = (progress) => writeJson(PROGRESS_KEY, progress)

module.exports = { writeProgress, readProgress, rowProgressOf, masteredRowCount, markStudied, saveTrainingResult, saveExamResult }
