import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const api = process.env.SEED_API_URL ?? 'http://localhost:3000/api/review'

const EMBED_DIM = 256

function hashEmbed(text) {
  const vector = new Array(EMBED_DIM).fill(0)
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

const SEEDS = [
  { category: 'food', agenda: '대학가 자취생을 위한 반찬 구독 서비스. 주 2회 새벽 배송, 월 6만원. 학교 커뮤니티에서 홍보할 계획이다.' },
  { category: 'app', agenda: '교내외 수십 개 게시판에 흩어진 공지를 한 피드로 모아 보여주는 대학생용 공지 모아보기 앱. 학과와 관심사로 필터링하고 마감 임박 알림을 준다.' },
  { category: 'community', agenda: '같은 취미를 가진 동네 사람들을 주 1회 오프라인 소모임으로 매칭해주는 서비스. 참가비 5천원, 카페와 제휴해 장소를 확보한다.' },
  { category: 'education', agenda: '전공 수업을 먼저 들은 선배와 후배를 매칭하는 교내 과외 플랫폼. 시간당 2만원, 수수료 10%. 학교 인증으로 신뢰를 확보한다.' },
  { category: 'commerce', agenda: '학과 굿즈를 만들고 싶은 학생회를 위한 공동구매 대행 서비스. 최소 수량을 모아 제작 단가를 낮추고 배송까지 대행한다.' },
  { category: 'productivity', agenda: '팀플에서 역할 분담과 마감 관리를 해주는 협업 툴. 조원별 기여도를 기록해 무임승차를 줄인다. 대학생 무료, 기업용 유료.' },
  { category: 'content', agenda: '대학생 인터뷰를 담은 주간 뉴스레터. 취업, 휴학, 창업 같은 진로 이야기를 다루고 구독자 광고로 수익화한다.' },
  { category: 'event', agenda: '교내 중고 물품 플리마켓을 매 학기 개최하는 프로젝트. 참가 부스비 1만원, 총학생회 후원으로 홍보한다.' },
]

async function generate(agenda) {
  const res = await fetch(api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: agenda }] }),
    signal: AbortSignal.timeout(240000),
  })
  if (!res.ok) throw new Error(`api ${res.status}`)
  if (res.headers.get('x-fallback') === '1' || res.headers.get('x-demo') === '1') throw new Error('not a live report')
  const report = (await res.text()).replace(/\r\n/g, '\n').trim()
  if (!report.includes('판정') || !report.includes('## 위험도')) throw new Error('incomplete report')
  return report
}

const rows = []
for (const seed of SEEDS) {
  process.stdout.write(`${seed.category} ... `)
  try {
    const report = await generate(seed.agenda)
    rows.push({ ...seed, report, embedding: hashEmbed(seed.agenda) })
    console.log(`ok (${report.length} chars)`)
  } catch (error) {
    console.log(`FAIL ${String(error).slice(0, 80)}`)
  }
}

const values = rows.map((row) => `('${row.category}', $seed$${row.agenda}$seed$, $seed$${row.report}$seed$, '[${row.embedding.join(',')}]')`).join(',\n')
const sql = `delete from fallback_reviews;\ninsert into fallback_reviews (category, agenda, report, embedding) values\n${values};\n`
writeFileSync(join(root, 'scripts', 'seed.sql'), sql, 'utf8')
console.log(`\nseed.sql 생성 완료 — ${rows.length}건. Supabase SQL Editor에서 실행하세요.`)
