const DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.hwp', '.hwpx', '.doc', '.ppt', '.png', '.jpg', '.jpeg', '.tiff'] as const

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  let local = ''
  try {
    if (name.endsWith('.pdf')) local = await extractPdf(file)
    else if (name.endsWith('.docx')) local = await extractDocx(file)
    else if (name.endsWith('.pptx')) local = await extractPptx(file)
    else if (name.endsWith('.hwpx')) local = await extractHwpx(file)
    else if (name.endsWith('.hwp')) local = await extractHwp(file)
    else if (!DOCUMENT_EXTENSIONS.some((ext) => name.endsWith(ext))) local = await file.text()
  } catch {
    local = ''
  }
  if (local.trim()) return local
  const remote = await extractViaPreprocessor(file)
  if (remote.trim()) return remote
  return local
}

async function extractViaPreprocessor(file: File): Promise<string> {
  try {
    const form = new FormData()
    form.append('file', file, file.name)
    const res = await fetch('/api/extract', { method: 'POST', body: form })
    if (!res.ok) return ''
    const json = (await res.json()) as { text?: string }
    return json.text ?? ''
  } catch {
    return ''
  }
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))
  }
  return pages.join('\n\n').replace(/[ \t]+/g, ' ').trim()
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return result.value.trim()
}

async function extractHwpx(file: File): Promise<string> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const sectionNames = Object.keys(zip.files)
    .filter((path) => /^Contents\/section\d+\.xml$/i.test(path))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0))
  const sections: string[] = []
  for (const path of sectionNames) {
    const xml = await zip.files[path].async('string')
    const texts = [...xml.matchAll(/<hp:t[^>]*>([^<]*)<\/hp:t>/g)].map((match) => match[1])
    if (texts.length > 0) sections.push(texts.join(' '))
  }
  return sections.join('\n\n').trim()
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const HWP_EXTENDED_CONTROLS = new Set([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23])

function decodeHwpParaText(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  while (i + 1 < bytes.length) {
    const code = bytes[i] | (bytes[i + 1] << 8)
    if (code >= 32) {
      out += String.fromCharCode(code)
      i += 2
    } else if (HWP_EXTENDED_CONTROLS.has(code)) {
      i += 16
    } else {
      if (code === 10 || code === 13) out += '\n'
      i += 2
    }
  }
  return out
}

function parseHwpRecords(data: Uint8Array): string {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let pos = 0
  let out = ''
  while (pos + 4 <= data.length) {
    const header = view.getUint32(pos, true)
    const tag = header & 0x3ff
    let size = (header >>> 20) & 0xfff
    pos += 4
    if (size === 0xfff) {
      if (pos + 4 > data.length) break
      size = view.getUint32(pos, true)
      pos += 4
    }
    if (pos + size > data.length) break
    if (tag === 67) out += `${decodeHwpParaText(data.subarray(pos, pos + size))}\n`
    pos += size
  }
  return out
}

async function extractHwp(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return extractHwpx(file)
  const CFB = await import('cfb')
  const container = CFB.read(bytes, { type: 'buffer' })
  const fileHeader = CFB.find(container, 'FileHeader')
  const headerBytes = fileHeader ? new Uint8Array(fileHeader.content as ArrayLike<number>) : null
  const compressed = headerBytes ? (headerBytes[36] & 1) === 1 : true
  const sections = (container.FullPaths ?? [])
    .map((path, index) => ({ path, index }))
    .filter(({ path }) => /BodyText\/Section\d+$/i.test(path))
    .sort((a, b) => Number(a.path.match(/\d+$/)?.[0] ?? 0) - Number(b.path.match(/\d+$/)?.[0] ?? 0))
  const parts: string[] = []
  for (const { index } of sections) {
    const entry = container.FileIndex[index]
    let data: Uint8Array = new Uint8Array(entry.content as ArrayLike<number>)
    if (compressed) data = await inflateRaw(data)
    parts.push(parseHwpRecords(data))
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

async function extractPptx(file: File): Promise<string> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const slideNames = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0))
  const slides: string[] = []
  for (const path of slideNames) {
    const xml = await zip.files[path].async('string')
    const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((match) => match[1])
    if (texts.length > 0) slides.push(texts.join(' '))
  }
  return slides.join('\n\n').trim()
}
