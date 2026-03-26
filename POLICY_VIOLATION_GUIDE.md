# Chrome Web Store 정책 위반 대응 가이드

**위반 참조 ID**: Red Potassium  
**위반 내용**: "Copy as Markdown" 기능이 작동하지 않거나 검토 시 재현 불가  
**관련 정책**: 제품의 콘텐츠, 제목, 아이콘, 설명 또는 스크린샷에 잘못되거나 사용자를 오도하는 정보가 포함된 경우 해당 내용이 삭제될 수 있음

---

## 1. 오류 원인 진단

### 1.1 기능 구조 개요

이 확장 프로그램은 **두 가지** "Copy as Markdown" 경로를 제공합니다:

| 경로 | 트리거 | 관련 파일 |
|------|--------|-----------|
| **플로팅 버튼** | Gemini 응답 영역에 `.markdown` 요소가 감지되면 "Copy Markdown" 버튼 표시 | `content.ts`, `content.css` |
| **컨텍스트 메뉴** | 텍스트 선택 후 우클릭 → "Copy selection as Markdown" | `context-menu-handler.ts`, `background.ts` |

### 1.2 잠재적 실패 원인

#### A. 플로팅 버튼이 표시되지 않는 경우

**원인**: `content.ts`의 `TARGET_SELECTOR`가 Gemini 페이지의 현재 DOM 구조와 불일치

```ts
// content.ts 7행
const TARGET_SELECTOR = ':is(message-content#extended-response-message-content, immersive-editor#extended-response-message-content) .markdown';
```

- **가능성**: Gemini 웹 UI가 업데이트되거나 A/B 테스트로 다른 구조를 사용할 때
- **확인 방법**: `https://gemini.google.com` 접속 후 DevTools → Elements 탭에서 `message-content`, `immersive-editor`, `.markdown` 클래스 존재 여부 확인

#### B. 컨텍스트 메뉴가 표시되지 않는 경우

**원인**: `context-menu-handler.ts`의 `isSelectionReadable()`가 `false`를 반환

- **가능성**:
  - Gemini가 Shadow DOM, Canvas, 또는 비읽기 가능한 요소로 렌더링
  - 선택 영역이 `range.cloneContents()`로 HTML을 추출할 수 없는 경우
- **확인 방법**: Gemini에서 텍스트를 선택한 뒤, DevTools Console에서 `document.getSelection()` 결과 확인

#### C. 클립보드 복사 실패

**원인**: `navigator.clipboard.writeText()` 실패

- **가능성**:
  - 사용자 제스처가 없이 호출됨 (클립보드 API는 사용자 제스처 필요)
  - `clipboardWrite` 권한 미설정 (현재 `manifest.json`에는 있음)
  - 페이지의 CSP(Content Security Policy) 제한

#### D. 빌드/실행 오류

**원인**: `content.js`, `context-menu-handler.js`가 빌드되지 않거나 `html-to-markdown` 모듈 누락

- **확인 방법**: `bun pack` 실행 후 `dist/` 폴더에 `content.js`, `context-menu-handler.js`가 생성되는지 확인

---

## 2. 수정 방법 제안

### 2.1 플로팅 버튼 셀렉터 업데이트

1. **Gemini 페이지에서 실제 DOM 구조 확인**:
   - `https://gemini.google.com` 접속
   - 대화를 시작하고 응답이 표시될 때까지 대기
   - DevTools → Elements에서 응답 영역의 태그/클래스/ID 확인

2. **셀렉터 수정** (`src/content.ts`):

```ts
// 예: 기존 셀렉터가 실패할 경우, 더 유연한 대안 시도
const TARGET_SELECTOR = ':is(message-content#extended-response-message-content, immersive-editor#extended-response-message-content) .markdown';
// 또는 더 넓은 범위:
// const TARGET_SELECTOR = '[class*="markdown"], [class*="message-content"] .markdown';
```

3. **디버깅용 로그 추가** (재현 시에만 사용, 배포 전 제거):

```ts
// toggleButtonVisibility 함수 내부
console.debug('[GEMINI_CANVAS_MARKDOWN_COPY] canvas found, showing button');
// 또는
console.debug('[GEMINI_CANVAS_MARKDOWN_COPY] canvas not found, hiding button');
```

### 2.2 컨텍스트 메뉴가 항상 보이도록 변경

**현재**: `visible: false`로 시작하고, 선택 시에만 `visible: true`로 업데이트

**검토 시 재현 어려움 가능성**: 선택이 "읽기 가능"하지 않으면 메뉴가 아예 보이지 않음

**제안**: `visible: true`로 고정하여 메뉴 항목을 항상 표시하고, 클릭 시 선택이 없으면 "선택 영역이 없습니다" 메시지 표시

```ts
// context-menu-handler.ts: contextMenus.create에서
visible: true,  // false → true로 변경
```

그리고 `background.ts`에서 `visible` 업데이트 로직 제거 또는 단순화.

### 2.3 클립보드 API 폴백

`navigator.clipboard.writeText` 실패 시 `document.execCommand('copy')` 폴백 추가:

```ts
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  }
}
```

### 2.4 검증 체크리스트

수정 후 배포 전 검증:

- [ ] `bun pack` 실행 후 `versions/gemini-canvas-md-copy-*.zip` 생성 확인
- [ ] Chrome에서 `chrome://extensions` → "압축해제된 확장 프로그램 로드"로 `dist` 폴더 로드
- [ ] `https://gemini.google.com` 접속 후 대화 생성
- [ ] 플로팅 "Copy Markdown" 버튼 표시 여부 확인
- [ ] 버튼 클릭 시 클립보드에 Markdown 복사 확인
- [ ] 텍스트 선택 후 우클릭 → "Copy selection as Markdown" 표시 및 동작 확인
- [ ] 콘솔 에러 없음 확인

---

## 3. 삭제 방법 제안

기능을 수정할 수 없거나, 스토어 설명에서 "Copy as Markdown" 언급을 제거하는 방향으로 대응할 경우:

### 3.1 기능 소스 코드 삭제

**삭제 대상**:

- `src/content.ts` — 플로팅 버튼 및 "Copy Markdown" 기능
- `src/context-menu-handler.ts` — 컨텍스트 메뉴 "Copy selection as Markdown" 기능
- `src/content.css` — 플로팅 버튼 스타일
- `src/html-to-markdown.ts` — 위 두 기능에서만 사용되는 경우 삭제

**수정 대상**:

- `src/manifest.json`:
  - `content_scripts`에서 `content.js`, `content.css`, `context-menu-handler.js` 제거
  - `permissions`에서 `contextMenus` 제거 (다른 용도 없으면)
  - `clipboardWrite` 권한 제거 (다른 용도 없으면)
- `scripts/pack.js`:
  - `COPY_EXCLUDE` 및 `scripts` 배열에서 `content.ts`, `context-menu-handler.ts` 관련 항목 제거
- `README.md`:
  - "Copy as Markdown" 관련 설명 제거

### 3.2 스토어 리스팅만 수정 (기능 유지)

기능은 유지하되, **스토어 설명/스크린샷**에서 "Copy as Markdown" 언급을 제거하거나 변경:

- "Copy as Markdown" → "Gemini 응답을 Markdown 형식으로 복사" 등 더 일반적인 표현으로 변경
- 스크린샷에서 해당 기능이 보이지 않도록 수정
- 또는 기능을 완전히 제거하고 설명에 맞는 다른 기능만 남김

### 3.3 삭제 후 체크리스트

- [ ] `bun pack` 실행 후 `dist/`에 불필요한 파일 없음
- [ ] `chrome://extensions`에서 확장 프로그램 로드 후 에러 없음
- [ ] `manifest.json`의 `content_scripts`, `permissions`가 정리됨
- [ ] 스토어 제출용 설명/스크린샷이 실제 동작과 일치함

---

## 4. 권장 대응 순서

1. **진단**: `https://gemini.google.com`에서 실제 DOM 구조와 선택/복사 동작 확인
2. **수정 시도**: 2.1~2.3 적용 후 2.4 검증 체크리스트 수행
3. **수정 불가 시**: 3.1 또는 3.2에 따라 기능 삭제 또는 스토어 리스팅 수정
4. **재제출**: 수정 후 새 버전으로 Chrome Web Store에 재제출

---

## 5. 참고

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome Web Store 개발자 프로그램 정책](https://developer.chrome.com/docs/webstore/program-policies/)
