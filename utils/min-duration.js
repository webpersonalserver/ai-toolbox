// Keeps a loading state on screen for at least `minimumMs`, so a fast answer still shows its feedback.
const withMinimumDuration = async (task, minimumMs) => {
  const startedAt = Date.now()
  try {
    return await task()
  } finally {
    const remaining = minimumMs - (Date.now() - startedAt)
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
  }
}

module.exports = { withMinimumDuration }
