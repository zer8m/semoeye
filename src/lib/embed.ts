export const EMBED_DIM = 256

export function hashEmbed(text: string): number[] {
  const vector = new Array<number>(EMBED_DIM).fill(0)
  const normalized = text.replace(/\s+/g, ' ').toLowerCase()
  for (let i = 0; i < normalized.length - 1; i += 1) {
    let hash = 7
    for (const ch of normalized.slice(i, i + 2)) {
      hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
    }
    vector[hash % EMBED_DIM] += 1
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1
  return vector.map((value) => Number((value / magnitude).toFixed(6)))
}
