// The practice page reports on its way out; the page it returns to waits for that report before reading stats.
let latestReport = Promise.resolve()

const trackReport = (report) => {
  latestReport = report.catch(() => null)
  return report
}

const waitForPendingReport = () => latestReport

module.exports = { trackReport, waitForPendingReport }
