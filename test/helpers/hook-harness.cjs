const React = require('react')

// Runs component state/effects without a native renderer. It does not simulate layout.
exports.hookHarness = function hookHarness() {
  const cells = []
  let cursor = 0
  let dirty = false
  let effects = []
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++
      if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial
      return [
        cells[index],
        (update) => {
          const next = typeof update === 'function' ? update(cells[index]) : update
          if (!Object.is(next, cells[index])) {
            cells[index] = next
            dirty = true
          }
        },
      ]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in cells)) cells[index] = { current: initial }
      return cells[index]
    },
    useMemo(factory) {
      return factory()
    },
    useEffect(callback, deps) {
      const index = cursor++
      const previous = cells[index]
      if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) {
        cells[index] = deps
        effects.push(callback)
      }
    },
  }
  return {
    hooks,
    render(Component, props = {}) {
      let result
      for (let pass = 0; pass < 20; pass++) {
        cursor = 0
        dirty = false
        effects = []
        result = Component(props)
        for (const effect of effects) effect()
        if (!dirty) return result
      }
      throw new Error('Component entered a repeated state/effect update loop')
    },
  }
}

exports.findElement = function findElement(element, predicate) {
  if (!element || typeof element !== 'object') return undefined
  if (predicate(element)) return element
  return React.Children.toArray(element.props?.children)
    .map((child) => findElement(child, predicate))
    .find(Boolean)
}

exports.nativeMock = {
  Platform: { OS: 'android', select: (choices) => choices.android ?? choices.default },
  StyleSheet: { create: (styles) => styles, absoluteFill: {} },
  ...Object.fromEntries(
    [
      'ActivityIndicator',
      'Alert',
      'Image',
      'FlatList',
      'KeyboardAvoidingView',
      'Modal',
      'Pressable',
      'ScrollView',
      'Text',
      'TextInput',
      'View',
    ].map((name) => [name, name]),
  ),
}
