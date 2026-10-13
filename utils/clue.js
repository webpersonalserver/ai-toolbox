const MASK_CHAR = '□'

// Splits a clue into plain runs and single masked characters so masks can be drawn as tokens.
const splitClue = (text) => {
  const segments = []
  for (const char of text || '') {
    if (char === MASK_CHAR) {
      segments.push({ text: '?', masked: true })
    } else if (segments.length && !segments[segments.length - 1].masked) {
      segments[segments.length - 1].text += char
    } else {
      segments.push({ text: char, masked: false })
    }
  }
  return segments
}

module.exports = { splitClue }
