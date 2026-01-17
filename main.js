const on = (t, e, f) => t.addEventListener(e, f, false)
const hex = (c) => 0xff000000 | c.b << 16 | c.g << 8 | c.r

const palette = []

async function processFile() {
  // exit if less/more than 1 file is selected
  if (filepick.files.length != 1) return

  const file   = filepick.files[0]
  const buffer = await file.arrayBuffer()
  const view   = new DataView(buffer)

  let offset = 0

  const u8  = () => view.getUint8(offset++)
  const u16 = () => {
    let v = view.getUint16(offset, true)
    offset += 2
    return v
  }
  const u32 = () => {
    let v = view.getUint32(offset, true)
    offset += 4
    return v
  }
  const i16 = () => {
    let v = view.getInt16(offset, true)
    offset += 2
    return v
  }

  const size  = u32()
  const magic = u16()

  if (magic != 0xa5e0)
    throw new Error(`Invalid magic number: ${magic}. Not an aseprite file.`)

  const frameCount = u16()
  const width      = u16()
  const height     = u16()
  const colorDepth = u16()

  const data = new Uint8Array(width * height)

  // indexed mode to use palettes
  if (colorDepth != 8)
    throw new Error(`Unsupported color depth: ${colorDepth}. Aseprite file should be in indexed mode.`)

  offset += 20

  const pwidth  = u8() || 1
  const pheight = u8() || 1

  const ratio = pwidth / pheight

  offset = 128 // skip rest of header

  // parse first frame

  const frameBytes    = u32()
  const frameMagic    = u16() // 0xf1fa
  const chunkCount    = u16()
  const frameDuration = u16()

  offset += 6 // reserved space

  if (chunkCount === 0xffff)
      chunkCount = u32()

  offset = 144

  for (let c = 0; c < chunkCount; c++) {
    const chunkStart = offset
    const chunkSize  = u32()
    const chunkType  = u16()

    // not a CEL chunk, we skip it entirely
    if (chunkType == 0x2019) {
      console.log("(New) palette chunk: ignored")
      throw new Error(`Found new palette chunk: not supported`)
      offset = chunkStart + chunkSize
      continue
    }
    else if (chunkType == 0x0004) {
      numPackets = u16()

      for (let p = 0; p < numPackets; p++) {
        skipEntries = u8()
        numColors   = u8() || 0xff

        for (let col = 0; col < numColors; col++)
          palette.push({r: u8(), g: u8(), b: u8()})
      }

      offset = chunkStart + chunkSize
      continue
    }
    else if (chunkType == 0x0011) {
      throw new Error(`Found old palette chunk: not supported`)
      offset = chunkStart + chunkSize
      continue
    }
    else if (chunkType != 0x2005) {
      console.log("Skipping chunk")
      offset = chunkStart + chunkSize
      continue
    }

    const layerIndex = u16()
    const x          = i16()
    const y          = i16()
    const opacity    = u8()
    const celType    = u16()

    offset += 7

    if (celType === 0) {
      console.log("raw image")
      throw new Error(`Found raw image: not supported (yet)`)
    }

    else if (celType === 2) {
      let cwidth  = u16()
      let cheight = u16()
      let rawData = buffer.slice(offset, chunkStart + chunkSize)
      pako.inflate(rawData).forEach((v, i) => {
        let px = x + (i % cwidth)
        let py = y + Math.floor(i / cwidth)
        console.log(v)
        data[px + py * width] = v % palette.length
      }) 
    }

    offset = chunkStart + chunkSize
  }

  // draw on canvas
  canvas.width  = width
  canvas.height = height

  canvas.style.width  = `${3 * width * ratio}px`
  canvas.style.height = `${3 * height}px`

  let ctx = canvas.getContext('2d')
  let buf = ctx.createImageData(width, height)
  let img = new Uint32Array(buf.data.buffer)

  data.forEach((x, i) => {
    img[i] = hex(palette[data[i]])
    let hole = document.createElement('span')
    if (data[i]) hole.classList.add('punched')
    punchcard.appendChild(hole)
  })

  ctx.putImageData(buf, 0, 0)
}

on(filepick, "change", processFile)
processFile()
