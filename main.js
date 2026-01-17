const on = (t, e, f) => t.addEventListener(e, f, false)

let activePoll = null

function pollLastModified(file, date) {
  return window.setInterval(() => {
    console.log(filepick.files[0])
  }, 1000)
}

async function processFile() {
  if (activePoll !== null)
    window.clearInterval(activePoll)

  // exit if less/more than 1 file is selected
  if (filepick.files.length != 1) return

  const file   = filepick.files[0]
  const buffer = await file.arrayBuffer()
  const view   = new DataView(buffer)



  console.log(file)

  pollLastModified(file, file.lastModified)

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

  console.log(`Filesize: ${u32()}`)
  const magic = u16()

  if (magic != 0xa5e0)
    throw new Error(`Invalid magic number: ${magic}. Not an aseprite file.`)

  const frameCount = u16()
  const width      = u16()
  const height     = u16()
  const colorDepth = u16()

  console.log(`Canvas size: ${width}x${height}`)

}

on(filepick, "change", processFile)
processFile()
