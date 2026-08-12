아래의 내용을 바탕으로, 출처 목록에 대해 chrome.tab 을 이용하여 작성일자를 모두 가져오도록 하고 이걸 바탕으로 APA 양식의 인용 및 참고문헌 스타일도 가능하도록 해보자.
인용 표시를 할 때, APA 양식인 `(저자, 년도)` 방식을 쓰게 하고, 하단 참고문헌 목록을 보여줄 때는 각주의 형태로 나열하게 만들자. 각주의 나열 부분에서도 최대한 APA 양식에 맞춘 참고문헌 나열로 보이게 하자.


# [기획안] URL 작성일자 및 접속일자 자동 수집 크롬 확장프로그램

**제품명(가칭):** Auto Date Scraper (Web Citation Date Extractor)

**목적:** 대량의 웹사이트 URL 목록으로부터 작성일자(발행일) 및 접속일자(수집일)를 자동 추출하여 출처 정리 효율 극대화

## 1. 기획 배경 및 목적

### 1.1 배경

- AI 검색(Gemini Deep Research 등), 논문 작성, 리서치 보고서 작성 시 다수의 웹 출처(URL)를 수집하게 됨.
- 서지 정보(Citation) 작성 시 **작성일자**와 **접속일자** 기록이 필수적이나, 수동으로 일일이 페이지에 방문하여 날짜를 확인하는 과정에서 많은 시간이 소요됨.
- 웹사이트마다 날짜 표시 방식(메타태그, Schema.org, 본문 텍스트 등)이 상이하여 일관된 수집 도구가 필요함.

### 1.2 목적

- URL 목록(bulk input)을 일괄 입력받아 배경에서 비동기로 날짜 데이터를 자동 추출.
- 추출된 작성일자, 접속일자, 페이지 제목 등을 정형화된 형태(CSV, JSON, Markdown 표)로 내보내기 기능 제공.

## 2. 주요 기능 명세 (Key Features)

| 구분 | 주요 기능 | 상세 설명 |
| --- | --- | --- |
| **입력 (Input)** | URL 대량 입력 | • 텍스트 상자에 줄바꿈/쉼표 구분으로 URL 목록 입력• `.txt` 또는 `.csv` 파일 업로드 지원• 현재 브라우저에 열려있는 탭 전체 URL 일괄 불러오기 버튼 |
| **추출 엔진 (Extraction)** | 메타데이터 자동 추출 | • Open Graph, Schema.org, HTML5 `<time>`, HTTP Header 등을 순차 탐색• 메타태그 부재 시 본문 텍스트 내 날짜 패턴(정규표현식) 추적 fallback 실행 |
| **기록 (Timestamp)** | 접속일자 자동 산출 | • 해당 URL에 크롤링/접속을 실행한 시점의 시스템 타임스탬프 자동 기록 |
| **모니터링 (Status)** | 진행 상태 표시 | • 수집 진행률(ProgressBar, 성공/실패 개수) 실시간 표시• 타임아웃(기본 10초) 및 접근 불가 URL 예외 처리 |
| **내보내기 (Export)** | 결과 저장 및 공유 | • CSV, JSON 파일 다운로드• Markdown 표 형태 클립보드 복사 기능 (보고서/노션 붙여넣기용) |

## 3. 날짜 추출 알고리즘 및 우선순위 (Fallback Logic)

웹페이지마다 표기 방식이 다르므로 아래의 **4단계 우선순위 알고리즘**을 적용합니다.

```
[입력 URL] ──> [1단계: Schema.org (JSON-LD)] ──(실패시)──> [2단계: Open Graph & Meta Tags]
                                                                    │
[완료] <── [4단계: 본문 정규식 파싱 & HTTP Header] <──(실패시)─── [3단계: HTML5 <time> 태그]

```

1. **우선순위 1: Schema.org (JSON-LD 메타데이터)**

  - `script[type="application/ld+json"]` 탐색
  - `datePublished`, `dateCreated`, `uploadDate` 키 값 추출
2. **우선순위 2: Open Graph 및 모바일/뉴스 메타 태그**

  - `<meta property="article:published_time">`
  - `<meta property="og:published_time">`
  - `<meta name="pubdate">`, `<meta name="date">`, `<meta name="DC.date.issued">`
3. **우선순위 3: 시맨틱 HTML 태그**

  - `<time datetime="...">` 속성값 추출
4. **우선순위 4: HTTP Response Header & 본문 정규표현식 (Fallback)**

  - HTTP Header의 `Last-Modified` 값 확인
  - 본문 내 날짜 패턴 검색: `YYYY-MM-DD`, `YYYY.MM.DD`, `YYYY년 MM월 DD일` 등

**접속일자 (Access Date):**

요청 처리 성공 시점의 Client Local ISO Time (`YYYY-MM-DD HH:mm:SS`)을 자동 지정.

## 4. UI/UX 및 워크플로우 설계

### 4.1 워크플로우

1. 확장프로그램 아이콘 클릭 (팝업 창 오픈)
2. URL 목록 입력 (직접 입력 또는 '현재 탭 목록 가져오기')
3. **[날짜 수집 시작]** 버튼 클릭
4. Background에서 순차적/병렬적 Fetch 수행 (동시 처리 수: 3~5개 권장)
5. 실시간 데이터 테이블 갱신 (URL, 페이지 제목, 작성일자, 접속일자, 추출 상태)
6. 결과 데이터 **[CSV 다운로드]** 또는 **[Markdown 복사]**

### 4.2 팝업 UI 구성 요소

- **Header:** 앱 타이틀 및 설정(톱니바퀴) 아이콘
- **Input Area:** Textarea (URL 입력 영역), `파일 업로드` 버튼, `현재 열린 탭 불러오기` 버튼
- **Control Bar:** `수집 시작` / `일시정지` 버튼, 동시 요청 수 설정 슬라이더
- **Progress Bar:** 진행 상태 (% 및 X / Y 완료 표시)
- **Result Table:**

  - 컬럼: `[상태]` | `[페이지 제목]` | `[작성일자]` | `[접속일자]` | `[원본 URL]`
- **Footer:** `CSV 저장`, `JSON 저장`, `Markdown 복사` 버튼

## 5. 시스템 아키텍처 및 크롬 확장프로그램 구조

Chrome Extension **Manifest V3** 표준을 준수합니다.

```
auto-date-scraper/
├── manifest.json            # 확장프로그램 권한 및 설정 정보
├── popup/
│   ├── popup.html           # 메인 사용자 인터페이스
│   ├── popup.js             # UI 이벤트 처리 및 상태 관리
│   └── popup.css            # 스타일시트
├── scripts/
│   ├── background.js        # Background Service Worker (큐 관리 및 요청 총괄)
│   └── extractor.js         # DOMParser 기반 HTML 메타데이터 파싱 모듈
└── assets/
    └── icons/               # 애플리케이션 아이콘

```

### 필수 권한 (`manifest.json`)

- `permissions`: `["activeTab", "scripting", "storage"]`
- `host_permissions`: `["<all_urls>"]` *(모든 웹사이트의 HTML을 비동기 Fetch/Parsing하기 위함)*

## 6. 개발 단계별 로드맵 (Roadmap)

### Phase 1: MVP (최소 기능 제품) 개발

- [x] Popup UI 기본 레이아웃 제작
- [x] DOMParser를 이용한 단일/대량 URL 비동기 Fetch 처리
- [x] Schema.org 및 Open Graph 기반 작성일자 추출 알고리즘 구현
- [x] CSV 내보내기 기능 개발

### Phase 2: 예외 처리 및 기능 강화

- [ ] SPA(Single Page Application) 대응 (필요 시 Offscreen Document 또는 순차 탭 모드 지원)
- [ ] 사용자 지정 날짜 포맷팅 기능 (예: `YYYY-MM-DD` vs `DD/MM/YYYY`)
- [ ] 정규표현식 파서 성능 고도화 (한국어, 영어, 일본어 등 다국어 날짜 표기 대응)

### Phase 3: AI 연동 및 고도화 (선택 사항)

- [ ] 메타태그가 완전히 부재한 사이트의 경우 Gemini / OpenAI Lite API를 활용한 본문 기반 날짜 추론 옵션 추가
- [ ] APA, Harvard, Chicago 스타일 서지 정보 자동 생성 지원