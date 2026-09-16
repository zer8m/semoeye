const CATEGORY_KEYWORDS: readonly { readonly id: string; readonly keywords: readonly string[] }[] = [
  { id: 'food', keywords: ['반찬', '음식', '식당', '카페', '배달', '베이커리', '디저트', '급식', '학식', '요리', '밀키트'] },
  { id: 'app', keywords: ['앱', '어플', '서비스', '플랫폼', '웹', '사이트', '알림', '공지', '모아', '검색'] },
  { id: 'community', keywords: ['커뮤니티', '모임', '소모임', '매칭', '동아리', '친구', 'sns', '채팅'] },
  { id: 'education', keywords: ['교육', '과외', '스터디', '강의', '학습', '멘토', '튜터', '선배', '전공'] },
  { id: 'commerce', keywords: ['판매', '쇼핑', '커머스', '공동구매', '굿즈', '중고', '거래', '구독'] },
  { id: 'productivity', keywords: ['일정', '관리', '툴', '협업', '팀플', '메모', '기록', '자동화'] },
  { id: 'content', keywords: ['콘텐츠', '영상', '뉴스레터', '블로그', '브이로그', '유튜브', '방송'] },
  { id: 'event', keywords: ['행사', '축제', '플리마켓', '전시', '공연', '이벤트', '부스'] },
]

export function classifyAgenda(text: string): string {
  const lowered = text.toLowerCase()
  let best = 'app'
  let bestScore = 0
  for (const category of CATEGORY_KEYWORDS) {
    const score = category.keywords.reduce((sum, keyword) => sum + (lowered.includes(keyword) ? 1 : 0), 0)
    if (score > bestScore) {
      best = category.id
      bestScore = score
    }
  }
  return best
}
