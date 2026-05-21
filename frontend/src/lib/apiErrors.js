const collectMessages = (value) => {
  if (!value) return []
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectMessages(item))
  }
  if (typeof value === 'object') {
    return Object.values(value).flatMap((item) => collectMessages(item))
  }
  return []
}

export const extractApiErrorMessage = (error, fallbackMessage) => {
  const data = error?.response?.data
  if (!data) return fallbackMessage

  if (typeof data === 'string') return data
  if (typeof data?.detail === 'string' && data.detail.trim()) return data.detail
  if (typeof data?.message === 'string' && data.message.trim()) return data.message

  const messages = collectMessages(data)
  return messages[0] || fallbackMessage
}
