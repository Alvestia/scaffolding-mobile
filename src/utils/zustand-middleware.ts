/* eslint-disable @typescript-eslint/no-require-imports */
const middleware = require('zustand/middleware.js') as typeof import('zustand/middleware')

export const createJSONStorage = middleware.createJSONStorage
export const persist = middleware.persist
