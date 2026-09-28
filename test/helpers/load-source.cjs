const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

// Execute a source module with explicit native/network substitutes. No app build.
exports.loadSource = function loadSource(file, mocks = {}) {
  const cache = new Map()
  function load(filename) {
    const resolved = [filename, filename + '.ts', filename + '.tsx'].find(fs.existsSync)
    if (!resolved) throw new Error(`Module not found: ${filename}`)
    if (cache.has(resolved)) return cache.get(resolved).exports
    const module = { exports: {} }
    cache.set(resolved, module)
    const { outputText } = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
      fileName: resolved,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    })
    new Function('require', 'module', 'exports', outputText)(
      (name) => {
        if (Object.hasOwn(mocks, name)) return mocks[name]
        if (name.startsWith('@/')) return load(path.resolve(__dirname, '../../src', name.slice(2)))
        if (name.startsWith('.')) return load(path.resolve(path.dirname(resolved), name))
        return require(name)
      },
      module,
      module.exports,
    )
    return module.exports
  }
  return load(path.resolve(__dirname, '../../src', file))
}
