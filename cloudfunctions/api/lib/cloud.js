const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// A document, or null when it does not exist (or cannot be read).
const readDocOrNull = async (collection, docId) => {
  try {
    return (await db.collection(collection).doc(docId).get()).data
  } catch (error) {
    return null
  }
}

module.exports = { cloud, db, _: db.command, readDocOrNull }
