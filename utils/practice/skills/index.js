// Skill lookup by the name used in catalog.js. A new question type = a new file here + one line below.
const addSub = require('./add-sub')
const split = require('./split')
const chain = require('./chain')
const compare = require('./compare')
const division = require('./division')
const column = require('./column')

const SKILLS = { addSub, split, chain, compare, division, column }

const skillOf = (name) => {
  const skill = SKILLS[name]
  if (!skill) throw new Error(`unknown practice skill: ${name}`)
  return skill
}

module.exports = { skillOf }
