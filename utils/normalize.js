function normalizeString(value) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().toLowerCase()
}

function normalizeWord(value) {
  return normalizeString(value)
}

function getSafeBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {}
  }

  return body
}

module.exports = {
  getSafeBody,
  normalizeString,
  normalizeWord,
}
