const fs = require('fs')
const { PNG } = require('pngjs')
const src = PNG.sync.read(fs.readFileSync('C:/Users/王占成/.workbuddy/clipboard-images/clipboard-2026-11-05T15-06-53-174Z-b502ffdc.png'))
function crop(x, y, w, h, scale, out) {
  const W = w * scale, H = h * scale
  const o = new PNG({ width: W, height: H })
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const sx = Math.min(src.width - 1, x + Math.floor(i / scale))
    const sy = Math.min(src.height - 1, y + Math.floor(j / scale))
    const si = (sy * src.width + sx) * 4, di = (j * W + i) * 4
    o.data[di] = src.data[si]; o.data[di+1] = src.data[si+1]; o.data[di+2] = src.data[si+2]; o.data[di+3] = 255
  }
  fs.writeFileSync(out, PNG.sync.write(o))
}
crop(540, 300, 560, 60, 3, '.name-greet.png')
crop(0, 385, 400, 50, 3, '.name-repo.png')
console.log('ok')
