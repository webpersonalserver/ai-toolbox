// Copied from utils/practice by scripts/sync_cloud_practice.js — edit the original, then run the script.
// Everything shown under 趣味: subjects (乐园) → islands → units. Pages read this table; adding a unit means one
// entry here plus a skill in utils/practice/skills/. Unit ids are stored with player data: never rename one.

const SUBJECTS = [
  { id: 'math', name: '数理乐园', icon: '🔢', intro: '加减乘除、口诀算式，跟着喵算算去冒险', open: true, entryUrl: '/packageMath/pages/map/map' },
  { id: 'chinese', name: '语文乐园', icon: '📖', intro: '迷雾还没散开，敬请期待～', open: false },
  { id: 'english', name: '英语乐园', icon: '🔤', intro: '迷雾还没散开，敬请期待～', open: false }
]

// Islands in the suggested learning order (top to bottom on the map). Nothing is locked.
const ISLANDS = [
  { id: 'counting', subject: 'math', name: '数数岛', fitFor: '难度 ★', intro: '点点糖果排排队，10 以内的数都住在这里喵～', units: ['split-10', 'add-sub-10'] },
  { id: 'make-ten', subject: 'math', name: '凑十岛', fitFor: '难度 ★★', intro: '这里的小伙伴最爱凑成 10，凑满就能跳过去！', units: ['add-sub-20', 'chain-add-sub', 'compare'] },
  { id: 'hundred', subject: 'math', name: '百数岛', fitFor: '难度 ★★★', intro: '竹子十根捆一捆，几捆几根就是几十几～', units: ['add-sub-100'] },
  { id: 'times-table', subject: 'math', name: '口诀岛', fitFor: '难度 ★★★★', intro: '九九口诀是武功秘籍，练成就是小侠客！', units: ['multiplication', 'division-table'] },
  { id: 'ten-thousand', subject: 'math', name: '万数岛', fitFor: '难度 ★★★★★', intro: '城堡里的数又大又多，等你来闯关～', units: ['add-sub-10000'] }
]

const ADD_SUB_EXAM_SECONDS = {
  'add-sub-10': { 1: 180, 2: 120, 3: 80 },
  'add-sub-20': { 1: 240, 2: 180, 3: 120 },
  'add-sub-100': { 1: 420, 2: 300, 3: 210 }
}

/**
 * skill: which file in skills/ makes the questions; options: its parameters.
 * legacyTier: the old 加减运算 tier this unit replaces (used to carry over stats and unsent reports).
 * entryUrl: units with their own pages (九九神功) open these instead of the shared practice page.
 */
const UNITS = {
  'split-10': {
    name: '10 以内分与合',
    example: '7 分成 3 和 ?',
    skill: 'split',
    options: { max: 10 },
    examSeconds: { 1: 150, 2: 100, 3: 70 }
  },
  'add-sub-10': {
    name: '10 以内加减',
    example: '3 + ? = 7',
    skill: 'addSub',
    options: { max: 10, regroupRatio: 0, zeroRatio: 0.1 },
    examSeconds: ADD_SUB_EXAM_SECONDS['add-sub-10'],
    legacyTier: 10
  },
  'add-sub-20': {
    name: '20 以内加减（凑十）',
    example: '8 + 5 = ?',
    skill: 'addSub',
    options: { max: 20, regroupRatio: 0.5, zeroRatio: 0.05 },
    examSeconds: ADD_SUB_EXAM_SECONDS['add-sub-20'],
    legacyTier: 20
  },
  'chain-add-sub': {
    name: '连加连减',
    example: '3 + 4 − 2 = ?',
    skill: 'chain',
    options: { max: 20 },
    examSeconds: { 1: 300, 2: 210, 3: 150 }
  },
  compare: {
    name: '比大小',
    example: '38 ○ 45',
    skill: 'compare',
    options: {},
    examSeconds: { 1: 150, 2: 100, 3: 70 }
  },
  'add-sub-100': {
    name: '100 以内加减',
    example: '? − 28 = 45',
    skill: 'addSub',
    options: { max: 100, regroupRatio: 0.4, zeroRatio: 0.03 },
    examSeconds: ADD_SUB_EXAM_SECONDS['add-sub-100'],
    legacyTier: 100
  },
  multiplication: { name: '九九乘法口诀', example: '三七二十一', entryUrl: '/pages/practice/multiplication/index' },
  'division-table': {
    name: '表内除法',
    example: '24 ÷ 4 = ?',
    skill: 'division',
    options: {},
    examSeconds: { 1: 200, 2: 140, 3: 100 }
  },
  'add-sub-10000': {
    name: '万以内加减',
    example: '356 + 278 = ?',
    skill: 'column',
    options: {},
    examSeconds: { 1: 600, 2: 450, 3: 300 }
  }
}

const unitOf = (unitId) => (UNITS[unitId] ? { id: unitId, ...UNITS[unitId] } : null)

const islandsOf = (subjectId) => ISLANDS.filter((island) => island.subject === subjectId)

const islandOfUnit = (unitId) => ISLANDS.find((island) => island.units.includes(unitId)) || null

// Units the shared practice / exam pages can run (not coming soon, no page of their own).
const playableUnitIds = () => Object.keys(UNITS).filter((unitId) => UNITS[unitId].skill)

const unitIdOfLegacyTier = (tier) => playableUnitIds().find((unitId) => UNITS[unitId].legacyTier === Number(tier)) || null

module.exports = { SUBJECTS, ISLANDS, UNITS, unitOf, islandsOf, islandOfUnit, playableUnitIds, unitIdOfLegacyTier }
