import { isAxiosError } from 'axios'

export function getErrorMessage(error: unknown, fallback = 'Algo deu errado.') {
  if (isAxiosError(error)) {
    const responseMessage = error.response?.data?.message

    if (Array.isArray(responseMessage) && responseMessage.length > 0) {
      return responseMessage.join(' • ')
    }

    if (typeof responseMessage === 'string' && responseMessage.trim()) {
      return responseMessage
    }
  }

  if (error instanceof Error && error.message.trim()) {
    if (
      error.message.includes('Network Error') ||
      error.message.includes('ERR_CONNECTION_REFUSED')
    ) {
      return 'A API do Scaffold nao respondeu. Verifique a URL configurada e se o backend esta em execucao.'
    }

    return error.message
  }

  return fallback
}

export function isOfflineLikeError(error: unknown) {
  if (!isAxiosError(error)) {
    return false
  }

  if (!error.response) {
    return true
  }

  return error.code === 'ECONNABORTED'
}
