export type VerdictLabel = '진행' | '보류' | '폐기'

export interface ReviewerScore {
  readonly name: string
  readonly score: number
}

export interface ReviewerBlock {
  readonly name: string
  readonly question: string
  readonly answer: string
  readonly failure: string
  readonly scores: readonly ReviewerScore[]
}

export interface Verdict {
  readonly label: VerdictLabel
  readonly reason: string
  readonly bullets: readonly string[]
}

export interface ParsedReport {
  readonly assignment: string
  readonly reviewers: readonly ReviewerBlock[]
  readonly rebuttal: { readonly from: string; readonly to: string; readonly text: string } | null
  readonly agreed: string
  readonly split: string
  readonly unspoken: string
  readonly verdict: Verdict | null
}

const SECTION_TITLES = ['검토', '반박', '모인 지점', '갈린 지점', '아무도 말하지 않은 것'] as const

function sectionBody(text: string, title: string): string {
  const start = text.indexOf(`## ${title}`)
  if (start === -1) return ''
  const afterTitle = start + title.length + 3
  const next = text.indexOf('\n## ', afterTitle)
  const verdictAt = text.indexOf('\n판정', afterTitle)
  let end = next === -1 ? text.length : next
  if (verdictAt !== -1 && verdictAt < end) end = verdictAt
  return text.slice(afterTitle, end).trim()
}

function parseReviewers(body: string): ReviewerBlock[] {
  const blocks: ReviewerBlock[] = []
  const matches = [...body.matchAll(/^\[([^\]\n]+)\]\s*[“"]?([^”"\n]*)[”"]?\s*$/gm)]
  matches.forEach((match, index) => {
    const from = (match.index ?? 0) + match[0].length
    const to = index + 1 < matches.length ? matches[index + 1].index ?? body.length : body.length
    const chunk = body.slice(from, to)
    const answer = /-\s*답\s*[:：]\s*([\s\S]*?)(?=\n\s*-\s*(?:실패|채점)|$)/.exec(chunk)?.[1]?.trim() ?? ''
    const failure = /-\s*실패한다면[^:：]*[:：]\s*(.*)$/m.exec(chunk)?.[1]?.trim() ?? ''
    const scoreLine = /-\s*채점\s*[:：]\s*(.+)$/m.exec(chunk)?.[1] ?? ''
    const scores = [...scoreLine.matchAll(/([^·\n]+?)\s+(\d(?:\.\d)?)\s*\/\s*5/g)]
      .map((item) => ({ name: item[1].trim(), score: Number(item[2]) }))
    blocks.push({ name: match[1].trim(), question: match[2].trim(), answer, failure, scores })
  })
  return blocks
}

export function parseVerdict(text: string): Verdict | null {
  const match = /^판정\s*[:：]\s*(진행|보류|폐기)\s*(?:[—–-]+\s*(.*))?$/m.exec(text)
  if (!match) return null
  let tail = text.slice((match.index ?? 0) + match[0].length)
  const nextSection = tail.indexOf('## ')
  if (nextSection !== -1) tail = tail.slice(0, nextSection)
  const bullets = [...tail.matchAll(/^\s*-\s*(.+)$/gm)].map((item) => item[1].trim())
  return { label: match[1] as VerdictLabel, reason: match[2]?.trim() ?? '', bullets }
}

export function parseReport(text: string): ParsedReport {
  const [reviewBody, rebuttalBody, agreed, split, unspoken] = SECTION_TITLES.map((title) => sectionBody(text, title))
  const headEnd = text.indexOf('## ')
  const head = headEnd === -1 ? text : text.slice(0, headEnd)
  const assignment = /^검토자\s*[:：]\s*(.+)$/m.exec(head)?.[1]?.trim() ?? ''
  const rebuttalMatch = /\[([^\]\n]+)\]\s*→\s*\[([^\]\n]+)\]\s*[:：]\s*(.+)/.exec(rebuttalBody)
  return {
    assignment,
    reviewers: parseReviewers(reviewBody),
    rebuttal: rebuttalMatch
      ? { from: rebuttalMatch[1].trim(), to: rebuttalMatch[2].trim(), text: rebuttalMatch[3].trim() }
      : null,
    agreed,
    split,
    unspoken,
    verdict: parseVerdict(text),
  }
}

export type RiskLevel = '낮음' | '중간' | '높음'

export interface RiskItem {
  readonly name: string
  readonly level: RiskLevel
  readonly reason: string
}

export interface Risk {
  readonly overall: RiskLevel
  readonly items: readonly RiskItem[]
}

export function parseRisk(text: string): Risk | null {
  const start = text.indexOf('## 위험도')
  if (start === -1) return null
  const section = text.slice(start)
  const overall = /종합\s*[:：]\s*(낮음|중간|높음)/.exec(section)?.[1] as RiskLevel | undefined
  const items = [...section.matchAll(/^-\s*([^:：\n]+)\s*[:：]\s*(낮음|중간|높음)\s*(?:[—–-]+\s*(.*))?$/gm)]
    .map((match) => ({ name: match[1].trim(), level: match[2] as RiskLevel, reason: match[3]?.trim() ?? '' }))
  if (!overall && items.length === 0) return null
  return { overall: overall ?? (items.some((i) => i.level === '높음') ? '높음' : items.some((i) => i.level === '중간') ? '중간' : '낮음'), items }
}

export interface VerdictChange {
  readonly from: string
  readonly to: VerdictLabel
  readonly reason: string
}

export function parseVerdictChange(text: string): VerdictChange | null {
  const match = /^\[판정 변경\]\s*(진행|보류|폐기)?\s*→\s*(진행|보류|폐기)\s*(?:[—–-]+\s*(.*))?$/m.exec(text)
  if (!match) return null
  return { from: match[1] ?? '', to: match[2] as VerdictLabel, reason: match[3]?.trim() ?? '' }
}

export interface SpeechSegment {
  readonly speaker: string | null
  readonly text: string
}

const NON_SPEAKERS = new Set(['판정 변경', '판정 유지'])

export function parseSegments(text: string): SpeechSegment[] {
  const segments: SpeechSegment[] = []
  const matches = [...text.matchAll(/^\[([^\]\n]{1,12})\]\s*/gm)].filter((match) => !NON_SPEAKERS.has(match[1].trim()))
  if (matches.length === 0) return [{ speaker: null, text: text.trim() }]
  const first = matches[0].index ?? 0
  if (text.slice(0, first).trim()) segments.push({ speaker: null, text: text.slice(0, first).trim() })
  matches.forEach((match, index) => {
    const from = (match.index ?? 0) + match[0].length
    const to = index + 1 < matches.length ? matches[index + 1].index ?? text.length : text.length
    segments.push({ speaker: match[1].trim(), text: text.slice(from, to).trim() })
  })
  return segments
}
