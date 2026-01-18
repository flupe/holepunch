const on = (t, e, f) => t.addEventListener(e, f, false)
const hex = (c) => 0xff000000 | c.b << 16 | c.g << 8 | c.r

// file info (to be update when loading)
let palette = []
let data    = null
let pwidth  = 0
let pheight = 0
let width   = 0
let height  = 0
let ratio   = 1

async function processFile(file) {
  // exit if less/more than 1 file is selected
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
  width  = u16()
  height = u16()
  const colorDepth = u16()

  // indexed mode to use palettes
  if (colorDepth != 8)
    throw new Error(`Unsupported color depth: ${colorDepth}. Aseprite file should be in indexed mode.`)

  // allocate some space for the imported image
  data = new Uint8Array(width * height)

  offset += 20

  pwidth  = u8() || 1
  pheight = u8() || 1

  ratio = pwidth / pheight

  offset = 128 // skip rest of header

  // parse first frame

  const frameBytes    = u32()
  const frameMagic    = u16() // 0xf1fa
  const chunkCount    = u16()
  const frameDuration = u16()

  offset += 6 // reserved space

  if (chunkCount === 0xffff) chunkCount = u32()

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
      console.log(`Skipping chunk: 0x${chunkType.toString(16)}`)
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
        data[px + py * width] = v % palette.length
      })
    }

    offset = chunkStart + chunkSize
  }
}

on(filepick, "change", onFileInputChange)

async function onFileInputChange() {
  if (filepick.files.length != 1) return
  await processFile(filepick.files[0])
  updateStats()
  updatePunchCard()
}

function updateStats() {
  // update file stats
  fileinfo.style.display    = 'inherit'
  fileinfo_dims.innerText   = `${width}x${height}`
  fileinfo_pal.innerText    = `${palette.length} yarn(s)`
  fileinfo_ratio.innerText  = `${pwidth}:${pheight}`

  fileinfo_yarns.innerHTML = ''
  palette.forEach(({r, g, b}) => {
    let item = document.createElement('li')
    let swatch = document.createElement('span')
    swatch.style.background = `rgb(${r}, ${g}, ${b})`
    item.appendChild(swatch)
    fileinfo_yarns.appendChild(item)
  })


  // draw the canvas preview
  canvas.width  = width
  canvas.height = height
  canvas.style.aspectRatio = `${width * ratio | 0} / ${height}`
  let ctx = canvas.getContext('2d')
  let buf = ctx.createImageData(width, height)
  let img = new Uint32Array(buf.data.buffer)
  data.forEach((x, i) => img[i] = hex(palette[data[i]]))
  ctx.putImageData(buf, 0, 0)
}

function updatePunchCard() {
  if (data === null) return

  punchcard.innerHTML = ""

  let hole  = document.createElement('span')
  let info  = hole.cloneNode()
  let frag  = document.createDocumentFragment()
  let punch = null

  function annot(str, row) {
    let annot = info.cloneNode()
    annot.style.gridRow = row
    annot.innerText = str
    frag.appendChild(annot)
  }

  hole.classList.add('hole')
  info.classList.add('info')

  if (double_jacquard.checked) {
    punch = new Array(width * (height * 2 - 1)).fill(false)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        punch[x + width * (2 * y + 1 - (y % 2))] = data[x + y * width] != 1
        if (y + 1 < height) {
          punch[x + width * (2 * y + (y % 2))    ] = data[x + y * width] == 1
        }
      }

      annot(y % 2 ? 'A' : 'B', y * 2 + 1)
    }

  }
  else {
    punch = new Array(width * height).fill(false)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        punch[x + width * y] = data[x + y * width] == 1
      }
    }

    annot('A/B', height)
  }

  punch.forEach(isPunched => {
    let newHole = hole.cloneNode()
    newHole.classList.toggle('punched', isPunched)
    frag.appendChild(newHole)
  })

  punchcard.appendChild(frag)
}

onFileInputChange()

on(double_jacquard, "change", updatePunchCard)
