# 설정 가이드

## 환경 변수

`.env.local` 파일에 아래 값을 채운다 (`.env.example` 참고).

- `LLM_API_KEY`: LLM 게이트웨이 API 키
- `LLM_BASE_URL`: OpenAI 호환 엔드포인트 주소 (`.../v1` 형식, 끝의 `/chat/completions`는 빼고)
- `LLM_MODEL`: 모델명
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase 프로젝트 설정 → API에서 복사

## Supabase 준비

1. supabase.com에서 새 프로젝트 생성
2. Authentication → Providers에서 Email 활성화 (기본값), 확인 메일 없이 쓰려면 "Confirm email" 끄기
3. SQL Editor에서 아래 실행

```sql
create table reviews (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  agenda text not null,
  messages jsonb not null default '[]',
  verdict text,
  verdict_reason text,
  updated_at timestamptz not null default now()
);

alter table reviews enable row level security;

create policy "own rows only" on reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

RLS 정책으로 각 사용자는 자기 행만 읽고 쓸 수 있다. 로그인하지 않아도 검토는 가능하며 저장만 되지 않는다.

## 폴백 저장소 (LLM 응답 지연 대비)

LLM이 25초 안에 응답을 시작하지 못하면 미리 저장된 유사 안건의 검토 예시를 대신 보여준다. 안건 텍스트를 벡터로 변환해 pgvector 코사인 유사도로 검색하며, 카테고리가 같은 행을 우선한다.

SQL Editor에서 실행:

```sql
create extension if not exists vector;

create table fallback_reviews (
  id bigint generated always as identity primary key,
  category text not null,
  agenda text not null,
  report text not null,
  embedding vector(256) not null
);

alter table fallback_reviews enable row level security;

create policy "public read" on fallback_reviews for select using (true);

create or replace function match_fallback(query_embedding vector(256), query_category text)
returns table(id bigint, category text, agenda text, report text, similarity float)
language sql stable as $$
  select id, category, agenda, report, 1 - (embedding <=> query_embedding) as similarity
  from fallback_reviews
  order by (category = query_category)::int desc, embedding <=> query_embedding
  limit 1;
$$;
```

시드 데이터는 개발 서버(`npm run dev`)를 켠 상태에서 `node scripts/seed-fallback.mjs`로 생성한다. 서비스와 같은 프롬프트로 검토를 만들기 위해 로컬 `/api/review`를 호출한다(다른 주소면 `SEED_API_URL` 환경 변수로 지정). 완료되면 `scripts/seed.sql`이 만들어지고, 그 내용을 SQL Editor에서 실행하면 폴백 저장소가 채워진다.

## 실행

```bash
npm install
npm run dev
```

## Vercel 배포

환경 변수 4개를 Vercel 프로젝트 설정에 동일하게 등록한다.

## 문서 전처리 서버 (선택 — 스캔본 OCR)

브라우저 내 추출로 텍스트를 얻지 못한 파일(스캔 PDF, 이미지 등)은 docling 전처리 서버로 넘겨 텍스트를 추출한다. 서버가 없으면 이 단계는 건너뛰고 안내 문구가 표시된다.

```bash
pip install docling-serve
docling-serve run
```

`.env.local`(및 Vercel 환경 변수)에 변환 엔드포인트를 등록한다. 버전에 따라 경로가 다를 수 있으니 docling-serve 문서에서 확인한다.

```
DOCLING_URL=http://localhost:5001/v1alpha/convert/file
```
