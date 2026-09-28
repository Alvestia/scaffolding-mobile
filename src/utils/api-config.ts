export function validateApiUrl(value: string, development: boolean) {
  const url = new URL(value.trim())
  if (
    (url.protocol !== 'https:' && !(development && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('Configure uma URL HTTPS válida para a API, sem credenciais ou parâmetros.')
  }
  return url.toString().replace(/\/$/, '')
}

export function validateRequestTimeout(value: string | undefined, fallback: number) {
  const timeout = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(timeout) || timeout <= 0 || timeout > 300_000) {
    throw new Error('O tempo limite da API deve estar entre 1 e 300000 milissegundos.')
  }
  return timeout
}
