const store = {}
const deletedFiles = []
let currentOpenid = 'anonymous'

const COMMAND = Symbol('command')
const command = {
  inc: (value) => ({ [COMMAND]: 'inc', value }),
  max: (value) => ({ [COMMAND]: 'max', value }),
  set: (value) => ({ [COMMAND]: 'set', value }),
  addToSet: (value) => ({ [COMMAND]: 'addToSet', value }),
  in: (value) => ({ [COMMAND]: 'in', value }),
  gt: (value) => ({ [COMMAND]: 'gt', value }),
  gte: (value) => ({ [COMMAND]: 'gte', value }),
  lt: (value) => ({ [COMMAND]: 'lt', value }),
  and: (...conditions) => ({ [COMMAND]: 'and', value: conditions })
}

const collectionStore = (name) => (store[name] = store[name] || {})
const clone = (value) => JSON.parse(JSON.stringify(value))
const comparable = (value) => {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value)) return Date.parse(value)
  return value
}

const applyValue = (previous, value) => {
  if (value && value.__serverDate) return new Date().toISOString()
  if (!value || !value[COMMAND]) return value
  switch (value[COMMAND]) {
    case 'set': return clone(value.value)
    case 'inc': return (previous || 0) + value.value
    case 'max': return Math.max(previous || 0, value.value)
    case 'addToSet': return (previous || []).includes(value.value) ? previous : [...(previous || []), value.value]
    default: throw new Error(`unsupported update command ${value[COMMAND]}`)
  }
}

const isPlainValueObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && !value[COMMAND] && !value.__serverDate

// Like the real cloud database: a plain object in update data is expanded into field paths (merged, not replaced),
// and a field that is currently null cannot get sub-fields. Use _.set(...) to replace a whole object.
const setPath = (target, path, value) => {
  const keys = path.split('.')
  let node = target
  keys.slice(0, -1).forEach((key) => {
    if (node[key] === null) throw new Error(`Cannot create field in element {${key}: null}`)
    node[key] = node[key] || {}
    node = node[key]
  })
  const last = keys[keys.length - 1]
  if (isPlainValueObject(value)) {
    if (node[last] === null) throw new Error(`Cannot create field in element {${last}: null}`)
    if (Object.keys(value).length === 0) {
      node[last] = node[last] || {}
      return
    }
    Object.entries(value).forEach(([key, child]) => setPath(node, `${last}.${key}`, child))
    return
  }
  node[last] = applyValue(node[last], value)
}

const applyUpdate = (doc, data) => Object.entries(data).forEach(([path, value]) => setPath(doc, path, value))

const matchesCondition = (value, condition) => {
  if (condition && condition[COMMAND] === 'and') return condition.value.every((part) => matchesCondition(value, part))
  if (condition && condition[COMMAND] === 'in') return condition.value.includes(value)
  if (condition && condition[COMMAND] === 'gt') return comparable(value) > comparable(condition.value)
  if (condition && condition[COMMAND] === 'gte') return comparable(value) >= comparable(condition.value)
  if (condition && condition[COMMAND] === 'lt') return comparable(value) < comparable(condition.value)
  return value === condition
}

const matches = (doc, where) => Object.entries(where).every(([key, condition]) => matchesCondition(doc[key], condition))

let autoId = 0
const docApi = (name, id) => ({
  get: async () => {
    const doc = collectionStore(name)[id]
    if (!doc) throw new Error(`document.get:fail ${name}/${id} not exist`)
    return { data: clone(doc) }
  },
  set: async ({ data }) => {
    collectionStore(name)[id] = { _id: id, ...clone(data) }
  },
  update: async ({ data }) => {
    const doc = collectionStore(name)[id]
    if (!doc) throw new Error(`document.update:fail ${name}/${id} not exist`)
    applyUpdate(doc, data)
    return { stats: { updated: 1 } }
  }
})

const compareBy = (orders) => (left, right) => {
  for (const { field, direction } of orders) {
    const leftValue = comparable(left[field])
    const rightValue = comparable(right[field])
    if (leftValue < rightValue) return direction === 'desc' ? 1 : -1
    if (leftValue > rightValue) return direction === 'desc' ? -1 : 1
  }
  return 0
}

const query = (name, where = {}, orders = [], limitCount = Infinity) => {
  const selected = () => Object.values(collectionStore(name)).filter((doc) => matches(doc, where))
  return {
    where: (condition) => query(name, condition, orders, limitCount),
    orderBy: (field, direction) => query(name, where, [...orders, { field, direction }], limitCount),
    limit: (count) => query(name, where, orders, count),
    get: async () => ({ data: clone(selected().sort(compareBy(orders)).slice(0, limitCount)) }),
    count: async () => ({ total: selected().length }),
    update: async ({ data }) => {
      const docs = selected()
      docs.forEach((doc) => applyUpdate(doc, data))
      return { stats: { updated: docs.length } }
    },
    remove: async () => {
      const docs = selected()
      docs.forEach((doc) => delete collectionStore(name)[doc._id])
      return { stats: { removed: docs.length } }
    }
  }
}

const collection = (name) => ({
  ...query(name),
  aggregate: () => aggregatePipeline(name),
  doc: (id) => docApi(name, id),
  add: async ({ data }) => {
    const id = data._id || `auto${++autoId}`
    if (collectionStore(name)[id]) throw new Error('duplicate key')
    const doc = { ...data, _id: id }
    Object.keys(doc).forEach((key) => {
      doc[key] = applyValue(undefined, doc[key])
    })
    collectionStore(name)[id] = doc
    return { _id: id }
  }
})

const aggregateCommand = {
  min: (field) => ({ op: 'min', field: field.slice(1) }),
  max: (field) => ({ op: 'max', field: field.slice(1) })
}

const aggregatePipeline = (name, stages = []) => ({
  match: (condition) => aggregatePipeline(name, [...stages, { type: 'match', condition }]),
  group: (spec) => aggregatePipeline(name, [...stages, { type: 'group', spec }]),
  end: async () => {
    let docs = clone(Object.values(collectionStore(name)))
    stages.forEach((stage) => {
      if (stage.type === 'match') docs = docs.filter((doc) => matches(doc, stage.condition))
      if (stage.type === 'group') {
        const groups = {}
        const { _id: idExpression, ...accumulators } = stage.spec
        docs.forEach((doc) => {
          const key = doc[idExpression.slice(1)]
          const group = (groups[key] = groups[key] || { _id: key === undefined ? null : key })
          Object.entries(accumulators).forEach(([output, { op, field }]) => {
            const value = doc[field]
            group[output] = group[output] === undefined ? value : Math[op](group[output], value)
          })
        })
        docs = Object.values(groups)
      }
    })
    return { list: docs }
  }
})

const database = {
  command: { ...command, aggregate: aggregateCommand },
  collection,
  serverDate: () => ({ __serverDate: true }),
  runTransaction: async (callback) => {
    const snapshot = clone(store)
    try {
      return await callback({ collection })
    } catch (error) {
      Object.keys(store).forEach((key) => delete store[key])
      Object.assign(store, snapshot)
      throw error
    }
  }
}

const RISKY_KEYWORD = '违规'

module.exports = {
  DYNAMIC_CURRENT_ENV: 'test-env',
  init: () => {},
  database: () => database,
  getWXContext: () => ({ OPENID: currentOpenid }),
  deleteFile: async ({ fileList }) => {
    deletedFiles.push(...fileList)
    return { fileList: fileList.map((fileID) => ({ fileID, status: 0 })) }
  },
  // Every stored file exists except ones whose path contains "missing".
  getTempFileURL: async ({ fileList }) => ({
    fileList: fileList.map(({ fileID, maxAge }) =>
      fileID.includes('missing')
        ? { fileID, status: -1, tempFileURL: '', errMsg: 'file not exist' }
        : { fileID, status: 0, tempFileURL: `https://temp.example/${fileID.split('/').slice(3).join('/')}?maxAge=${maxAge}` }
    )
  }),
  openapi: {
    security: {
      msgSecCheck: async ({ content }) => ({
        errCode: 0,
        result: { suggest: content.includes(RISKY_KEYWORD) ? 'risky' : 'pass' }
      })
    }
  },
  testing: {
    store,
    deletedFiles,
    RISKY_KEYWORD,
    actAs: (openid) => {
      currentOpenid = openid
    }
  }
}
