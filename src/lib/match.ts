import { hashEmbed } from '@/lib/embed'
import { REVIEWERS, type Reviewer } from '@/lib/reviewers'

const MIN_RELATIVE_AFFINITY = 0.6
const MAX_PICK = 3

const LEGAL_KEYWORDS = ['개인정보', '결제', '유료', '저작권', '상표', '미성년', '청소년', '계정', '로그인', '수수료', '환불'] as const

export interface Affinity {
  readonly reviewer: Reviewer
  readonly similarity: number
  readonly relative: number
}

function cosine(a: readonly number[], b: readonly number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i]
  return sum
}

function profileText(reviewer: Reviewer): string {
  return `${reviewer.persona} ${reviewer.question} ${reviewer.basis} ${reviewer.rubric.join(' ')} ${reviewer.hints}`
}

export function reviewerAffinities(agenda: string): Affinity[] {
  const needsLegal = LEGAL_KEYWORDS.some((keyword) => agenda.includes(keyword))
  const candidates = REVIEWERS.filter((reviewer) =>
    !reviewer.hidden && !reviewer.always && (reviewer.id !== 'compliance' || needsLegal))
  const agendaVector = hashEmbed(agenda)
  const scored = candidates.map((reviewer) => ({
    reviewer,
    similarity: cosine(agendaVector, hashEmbed(profileText(reviewer))),
  }))
  const max = Math.max(...scored.map((item) => item.similarity), 0.0001)
  return scored
    .map((item) => ({ ...item, relative: item.similarity / max }))
    .sort((a, b) => b.similarity - a.similarity)
}

export function autoAssign(agenda: string): string[] {
  const affinities = reviewerAffinities(agenda)
  const qualified = affinities.filter((item) => item.relative >= MIN_RELATIVE_AFFINITY).slice(0, MAX_PICK)
  const picked = qualified.length >= 2 ? qualified : affinities.slice(0, 2)
  return [...picked.map((item) => item.reviewer.name), '반대자']
}
