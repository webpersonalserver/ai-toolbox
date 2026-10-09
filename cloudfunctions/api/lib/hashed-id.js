const crypto = require('crypto')

const HASHED_ID_LENGTH = 24

const hashedId = (source) => crypto.createHash('sha1').update(source).digest('hex').slice(0, HASHED_ID_LENGTH)

module.exports = { hashedId }
