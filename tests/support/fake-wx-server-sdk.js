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
  lt: (value) => ({ [COMMAND]: 'lt', value })
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

const setPath = (target, path, value) => {
  const keys = path.split('.')
  let node = target
  keys.slice(0, -1).forEach((key) => {
    node[key] = node[key] || {}
    node = node[key]
  })
  const last = keys[keys.length - 1]
  node[last] = applyValue(node[last], value)
}

const applyUpdate = (doc, data) => Object.entries(data).forEach(([path, value]) => setPath(doc, path, value))

const matches = (doc, where) =>
  Object.entries(where).every(([key, condition]) => {
    if (condition && condition[COMMAND] === 'in') return condition.value.includes(doc[key])
    if (condition && condition[COMMAND] === 'gt') return comparable(doc[key]) > comparable(condition.value)
    if (condition && condition[COMMAND] === 'lt') return comparable(doc[key]) < comparable(condition.value)
    return doc[key] === condition
  })

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

const query = (name, where = {}) => {
  const selected = () => Object.values(collectionStore(name)).filter((doc) => matches(doc, where))
  return {
    where: (condition) => query(name, condition),
    limit: () => query(name, where),
    get: async () => ({ data: clone(selected()) }),
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

const database = {
  command,
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
