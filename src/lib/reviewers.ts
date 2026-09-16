import { publicAssetPath } from '@/lib/public-asset-path'

export interface Reviewer {
  readonly id: string
  readonly name: string
  readonly label: string
  readonly persona: string
  readonly question: string
  readonly basis: string
  readonly rubric: readonly string[]
  readonly hints: string
  readonly avatar: string
  readonly always?: boolean
  readonly conditional?: boolean
  readonly hidden?: boolean
}

export const REVIEWERS: readonly Reviewer[] = [
  {
    id: 'user', name: '쓰는 사람', label: '사용자', persona: '예상 사용자. 편리함을 추구한다.',
    question: '이걸 쓰려면 제가 뭘 더 해야 하죠?',
    basis: '이 서비스를 쓸 때 지금보다 편리해지는가. 동작이 두 번 이상 늘면 반대한다.',
    rubric: ['편의 개선', '진입 부담', '계속 쓸 이유'],
    hints: '사용 편의 습관 일상 이용자 고객 경험 접근',
    avatar: publicAssetPath('/personas/kim-seoyeon.png'),
  },
  {
    id: 'nonuser', name: '안 쓰는 사람', label: '비사용자', persona: '서비스에 관심이 없는 사람.',
    question: '제가 이걸 왜 열어야 하죠?',
    basis: '처음 한 번 열게 만드는 이유가 있는가. 없으면 반대한다.',
    rubric: ['첫 관심 유발', '대안 대비 매력', '전환 가능성'],
    hints: '관심 무관심 홍보 마케팅 유입 첫인상 발견',
    avatar: publicAssetPath('/personas/oh-junhyeok.png'),
  },
  {
    id: 'builder', name: '만드는 사람', label: '개발자·제작자', persona: '구현하고 수정하는 사람.',
    question: '이거 깨지면 누가 고치죠?',
    basis: '오류가 날 지점과 제작·복구 비용.',
    rubric: ['기술 실현성', '유지보수 부담', '장애 복구력'],
    hints: '개발 구현 기술 앱 웹 시스템 크롤링 데이터 유지보수 서버',
    avatar: publicAssetPath('/personas/choi-minjun-v2.png'),
  },
  {
    id: 'operator', name: '운영자', label: '운영자', hidden: true, persona: '만든 뒤 매일 돌보는 사람.',
    question: '매주 누가 뭘 확인해야 하죠?',
    basis: '방치했을 때 며칠 만에 쓸모없어지는가.',
    rubric: ['운영 부담', '방치 내성', '점검 용이성'],
    hints: '운영 관리 업데이트 콘텐츠 수집 점검 지속',
    avatar: publicAssetPath('/personas/lee-sumin.png'),
  },
  {
    id: 'decider', name: '결정권자', label: '결정권자', persona: '돈과 일정을 대는 사람.',
    question: '이거 안 하면 무슨 일이 생기죠?',
    basis: '미뤘을 때의 손실. 손실이 없으면 지금 할 이유도 없다.',
    rubric: ['시급성', '자원 대비 효과', '기회비용'],
    hints: '비용 예산 수익 매출 일정 투자 손익 가격',
    avatar: publicAssetPath('/personas/han-jihoon.png'),
  },
  {
    id: 'judge', name: '심사위원', label: '심사위원', persona: '비슷한 걸 수십 개 봤다.',
    question: '같은 걸 이미 세 개 봤는데 뭐가 다르죠?',
    basis: '설명 없이 구분되는 지점이 있는가.',
    rubric: ['차별성', '전달력', '완성 기대치'],
    hints: '공모전 심사 대회 제출 출품 차별 경쟁 발표',
    avatar: publicAssetPath('/personas/kang-doyoon.png'),
  },
  {
    id: 'compliance', name: '규칙 담당', label: '법률 관리인', persona: '개인정보, 돈, 저작권, 상표 등 법과 관련된 조언을 준다.',
    question: '누구 정보가 어디에 남죠?',
    basis: '사고가 났을 때 책임지는 사람이 정해져 있는가.',
    rubric: ['개인정보 안전', '권리 침해 없음', '책임 소재 명확성'],
    hints: '개인정보 결제 돈 유료 저작권 상표 미성년 법 계정 로그인',
    avatar: publicAssetPath('/personas/jeong-hyeonwoo.png'),
    conditional: true,
  },
  {
    id: 'opponent', name: '반대자', label: '악플러', persona: '비판점을 찾는다. 언제나 포함한다. 예외 없다.',
    question: '6개월 뒤 이게 죽어 있다면 사인은 뭐죠?',
    basis: '가장 그럴듯한 사망 원인 하나.',
    rubric: ['생존 가능성', '치명 리스크 대비', '가정의 검증 정도'],
    hints: '실패 위험 리스크 반대 검증 가정',
    avatar: publicAssetPath('/personas/park-jiwoo.png'),
    always: true,
  },
]

export function reviewerByName(name: string): Reviewer | undefined {
  const normalized = name.replace(/\s+/g, '')
  return REVIEWERS.find((reviewer) => reviewer.name.replace(/\s+/g, '') === normalized)
}

export const AGENDA_STAGES = [
  { id: 'decide', label: '만들지 말지 정하는 단계', detail: '쓰는 사람 · 안 쓰는 사람 · 반대자' },
  { id: 'method', label: '만들기로 정했고 방법을 보는 단계', detail: '만드는 사람 · 운영자 · 반대자' },
  { id: 'contest', label: '공모전·심사 제출물', detail: '심사위원 · 쓰는 사람 · 반대자' },
  { id: 'budget', label: '돈이나 일정이 걸린 안건', detail: '결정권자 · 만드는 사람 · 반대자' },
] as const
