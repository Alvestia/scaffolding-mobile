const fs = require('node:fs')
const path = require('node:path')
const { PNG } = require('pngjs')

const brandDirectory = path.resolve(__dirname, '../assets/images/brand')
const source = PNG.sync.read(fs.readFileSync(path.join(brandDirectory, 'kaefer-symbol.png')))

const palette = {
  blue: { r: 44, g: 65, b: 74 },
  white: { r: 255, g: 255, b: 255 },
}

function resolveInkAlpha(r, g, b) {
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return Math.max(0, Math.min(255, Math.round((250 - luminance) * 3)))
}

function fill(image, color, alpha) {
  for (let index = 0; index < image.data.length; index += 4) {
    image.data[index] = color.r
    image.data[index + 1] = color.g
    image.data[index + 2] = color.b
    image.data[index + 3] = alpha
  }
}

function sampleSource(targetX, targetY, targetSize) {
  const sourceX = Math.min(
    source.width - 1,
    Math.max(0, Math.round((targetX / Math.max(1, targetSize - 1)) * (source.width - 1))),
  )
  const sourceY = Math.min(
    source.height - 1,
    Math.max(0, Math.round((targetY / Math.max(1, targetSize - 1)) * (source.height - 1))),
  )
  const index = (sourceY * source.width + sourceX) * 4

  return resolveInkAlpha(source.data[index], source.data[index + 1], source.data[index + 2])
}

function renderAsset({ fileName, size, symbolSize, transparent }) {
  const output = new PNG({ width: size, height: size })
  fill(output, transparent ? palette.white : palette.blue, transparent ? 0 : 255)

  const offset = Math.round((size - symbolSize) / 2)
  for (let y = 0; y < symbolSize; y += 1) {
    for (let x = 0; x < symbolSize; x += 1) {
      const inkAlpha = sampleSource(x, y, symbolSize)
      if (inkAlpha === 0) continue

      const index = ((offset + y) * size + offset + x) * 4
      if (transparent) {
        output.data[index] = palette.white.r
        output.data[index + 1] = palette.white.g
        output.data[index + 2] = palette.white.b
        output.data[index + 3] = inkAlpha
        continue
      }

      const blend = inkAlpha / 255
      output.data[index] = Math.round(palette.blue.r * (1 - blend) + 255 * blend)
      output.data[index + 1] = Math.round(palette.blue.g * (1 - blend) + 255 * blend)
      output.data[index + 2] = Math.round(palette.blue.b * (1 - blend) + 255 * blend)
      output.data[index + 3] = 255
    }
  }

  fs.writeFileSync(path.join(brandDirectory, fileName), PNG.sync.write(output))
}

renderAsset({ fileName: 'app-icon.png', size: 1024, symbolSize: 740, transparent: false })
renderAsset({ fileName: 'adaptive-icon.png', size: 1024, symbolSize: 560, transparent: true })
renderAsset({ fileName: 'favicon.png', size: 256, symbolSize: 190, transparent: false })

console.log('KAEFER brand assets generated in assets/images/brand.')
