#!/usr/bin/env node
/* ============================================================
 * NEOYA Design System — ds-lint v1.0  (2026-07-25)
 * 14항 린트를 "문서"에서 "실행되는 게이트"로 승격한 검사기.
 * 의존성 0 (Node 18+ 내장 모듈만 사용).
 *
 * 사용법
 *   node lint/ds-lint.mjs <경로 ...>            # 검사
 *   node lint/ds-lint.mjs --json <경로 ...>     # JSON 출력(CI용)
 *   node lint/ds-lint.mjs --warn-only <경로>    # 경고만(종료코드 0)
 *
 * 예외 처리
 *   같은 줄 또는 바로 윗줄에  ds-lint-disable R04  주석을 달면 그 줄 면제.
 * ============================================================ */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* 시스템별 팔레트 오버라이드: lint/palette.json 이 있으면 그 값을 쓴다.
   → 스크립트 1벌로 NEOYA·BHTM 등 복수 디자인시스템을 검사한다. */
const __here = dirname(fileURLToPath(import.meta.url));
const PALETTE_FILE = join(__here, 'palette.json');
const PALETTE = existsSync(PALETTE_FILE) ? JSON.parse(readFileSync(PALETTE_FILE, 'utf8')) : null;

/* ---------- 정본 상수 (tokens/core.css와 동기) ---------- */
const BRAND = {
  deep: '#1A3A5C', mid: '#2B5F8B', light: '#A8C4DD',
  foam: '#F5F9FC', white: '#FFFFFF',
};
const ALLOWED_HEX = new Set([
  // 브랜드
  '#1A3A5C', '#2B5F8B', '#A8C4DD', '#F5F9FC', '#FFFFFF', '#FFF',
  // 뉴트럴
  '#FAFBFC', '#F2F4F6', '#E4E7EB', '#CBD2D9', '#9AA5B1', '#616E7C', '#3E4C59', '#1F2933',
  // 시맨틱
  '#2F855A', '#D69E2E', '#C53030', '#2B6CB0',
  // 5색 마킹 (제품 전용) + 배경
  '#E8412E', '#F2A03D', '#2F8F4E', '#6B4E9E',
  '#FDECEA', '#FEF5E7', '#EAF6EE', '#EAF1F7', '#F1ECF8',
  // 데이터 시각화
  '#5A8CB5', '#D3E2EF',
  // 시맨틱 틴트 · 온컬러 · 대체 표면
  '#EAF4EE', '#256745', '#FAF3E0', '#8C6719', '#FBEAEA', '#952626',
  '#E7EEF7', '#214F86', '#E6EEF6', '#EDF1F5',
  '#000000', '#000', // 순수 검정은 텍스트 금지지만 SVG mask 등 허용 → R04에서 별도 검사
].map(s => s.toUpperCase()));
if (PALETTE?.allowedHex) { ALLOWED_HEX.clear(); for (const h of PALETTE.allowedHex) ALLOWED_HEX.add(h.toUpperCase()); }
const GRADIENT_RE = PALETTE?.gradientPair
  ? new RegExp(PALETTE.gradientPair.join('|'), 'i')
  : /--neoya-primary-deep|--brand-deep|#1A3A5C|--neoya-primary-mid|--brand-mid|#2B5F8B/i;
const SHADOW_RGB = PALETTE?.shadowRgb || ['26', '58', '92'];
const ALLOWED_EXCEPT = PALETTE?.allowedPhrases || [];

/* 외부 브랜드 색 — 각 사 브랜드 가이드가 강제하는 값이라 정본으로 치환할 수 없다.
   임의 변경 시 소셜 로그인 심사에서 반려된다. 소셜 로그인 버튼 컨텍스트에서만 허용하고,
   다른 용도로 쓰이면 R01_X(WARN)로 표시해 검토 대상으로 남긴다. */
const EXTERNAL_BRAND = {
  '#4285F4': 'Google Blue', '#EA4335': 'Google Red', '#FBBC05': 'Google Yellow', '#34A853': 'Google Green',
  '#FEE500': 'Kakao Yellow', '#191600': 'Kakao Label', '#181600': 'Kakao Label', '#000000': 'Kakao Label',
  '#03C75A': 'Naver Green',
};
const SOCIAL_CTX = /kakao|google|naver|sso|social|oauth|\bgoogle\b|\bnaver\b|\bkakao\b/i;

const ALLOWED_FONTS = [
  'pretendard', 'inter', 'inter 18pt', 'inter 28pt', 'noto serif kr',
  // 시스템 폴백 허용
  '-apple-system', 'blinkmacsystemfont', 'apple sd gothic neo', 'noto sans kr',
  // 한글 시스템 폴백 — 웹폰트 로드 실패 시에만 쓰인다. 브랜드 서체가 아니라 안전망이다.
  'malgun gothic', '맑은 고딕', 'nanum gothic', 'noto sans cjk kr', 'spoqa han sans neo',
  'system-ui', 'sans-serif', 'serif', 'monospace', 'nanum myeongjo', 'georgia',
  'ui-monospace', 'sfmono-regular', 'menlo', 'consolas', 'currentcolor',
  // CSS 전역 키워드 — 폰트명이 아니다 (font-family:inherit 등)
  'inherit', 'initial', 'unset', 'revert', 'revert-layer',
  // 제네릭 패밀리
  'ui-sans-serif', 'ui-serif', 'ui-rounded', 'cursive', 'fantasy', 'emoji', 'math',
];
/* 외부 브랜드 워드마크 전용 폰트 — 소셜 로그인 버튼 맥락에서만 참고 경고 */
const EXTERNAL_BRAND_FONTS = ['arial', 'helvetica', 'roboto', 'product sans'];

let ALLOWED_RADII = new Set(['0', '0px', '2px', '4px', '8px', '12px', '9999px', '50%', '100%', 'inherit', 'initial']);
const HYPE = ['최고의', '최고 수준', '업계 최고', '국내 최고', '유일한', '유일무이',
  '업계 1위', '국내 1위', '세계 최초', '완벽한', '무조건', '절대 실패', '100% 보장', '최상의',
  '반드시 오릅니다', '성적 보장', '합격 보장'];
if (PALETTE?.allowedRadii) ALLOWED_RADII = new Set(PALETTE.allowedRadii.concat(['inherit','initial']));
if (PALETTE?.allowedFonts) ALLOWED_FONTS.push(...PALETTE.allowedFonts.map(f => f.toLowerCase()));
/* 이모지 판정.
   U+2600–27BF 는 그림 이모지와 **활자 기호**가 섞여 있는 구간이다. 체크·엑스·별·화살표
   같은 딩뱃은 브랜드 가이드가 말하는 "이모지"가 아니라 활자다(정부제출 표에도 쓴다).
   따라서 텍스트 표현 딩뱃은 제외하되, 이모지 표현 선택자 U+FE0F 가 붙으면 다시 잡는다. */
const TEXT_DINGBATS = '✓✔✕✖✗✘★☆☑☐☒'
  + '※→←↑↓↔•‣▸▪●○─━–—';
const EMOJI_RE = new RegExp(
  `(?:[\\u{1F300}-\\u{1FAFF}\\u{1F000}-\\u{1F2FF}])`
  + `|(?:[\\u{2600}-\\u{27BF}](?<![${TEXT_DINGBATS}]))`
  + `|(?:[${TEXT_DINGBATS}]\\u{FE0F})`
  + `|(?:\\u{FE0F})`, 'u');

/* ---------- 규칙 메타 ---------- */
const RULES = {
  R01: '색상 화이트리스트 — 정본 팔레트 밖 hex 금지',
  R02: '그라디언트 — 승인 그라디언트 외 금지',
  R03: '라디우스 — 승인 스케일 외 금지',
  R04: '섀도 — 브랜드 틴트 rgba 외 금지(검정·컬러·inset·glow)',
  R05: '폰트 — Pretendard/Inter/Noto Serif KR 외 금지',
  R06: 'Noto Serif KR — 태그라인·풀쿼트 외 사용 경고',
  R07: '이모지 — UI 문자열 내 금지',
  R08: '아이콘 — Lucide outline stroke 1.75 고정',
  R09: '모션 — 120~320ms · 지정 이징 곡선만',
  R10: '통계 출처 — 수치 인접 출처 표기 필수',
  R11: '과장 표현 — 최고·유일·보장 등 금칙어',
  R12: '색상 대비 — WCAG AA(본문 4.5:1)',
  R13: '색 단독 정보전달 금지 — 시맨틱 색은 라벨/아이콘 동반',
  R14: 'CSS 변수 중복정의 금지 — 동일 스코프 2회 이상 선언',
  R12_X: '색상 대비 — 비활성/스와치 예외(참고용)',
  R07_S: '이모지 — 학생 대상 표면(허용·절제 권고)',
  R01_X: '외부 브랜드 색 — 소셜 로그인 전용 예외',
  R05_X: '외부 브랜드 폰트 — 소셜 로그인 워드마크 전용 예외',
};
const WARN_ONLY_RULES = new Set(['R06', 'R10', 'R07_S', 'R01_X', 'R05_X']);

/* ---------- 유틸 ---------- */
const norm = h => {
  h = h.toUpperCase();
  if (h.length === 4) h = '#' + [...h.slice(1)].map(c => c + c).join('');
  return h.slice(0, 7);
};
const srgb = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function luminance(hex) {
  const h = norm(hex);
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/* ---------- 주석 마스킹 (오탐 차단) ----------
   주석 안의 색상·금칙어·이모지는 산출물에 렌더되지 않으므로 검사 대상이 아니다.
   줄 수를 보존한 채 주석 구간만 공백으로 치환한다. */
function maskComments(raw, ext) {
  const out = [...raw];
  const put = (s, e) => { for (let k = s; k < e && k < out.length; k++) if (out[k] !== '\n') out[k] = ' '; };
  const isMarkup = ext === '.html' || ext === '.htm' || ext === '.svg';
  for (let i = 0; i < raw.length; i++) {
    if (isMarkup && raw.startsWith('<!--', i)) {
      const e = raw.indexOf('-->', i + 4); const end = e === -1 ? raw.length : e + 3; put(i, end); i = end - 1; continue;
    }
    if (raw.startsWith('/*', i)) {
      const e = raw.indexOf('*/', i + 2); const end = e === -1 ? raw.length : e + 2; put(i, end); i = end - 1; continue;
    }
    if (raw.startsWith('//', i) && ext !== '.css') {
      const e = raw.indexOf('\n', i); const end = e === -1 ? raw.length : e; put(i, end); i = end - 1; continue;
    }
  }
  return out.join('').split(/\r?\n/);
}
const stripTags = s => s.replace(/<[^>]*>/g, ' ');

/* ---------- 파일 수집 ---------- */
const EXT = new Set(['.css', '.html', '.htm', '.jsx', '.tsx', '.js', '.ts', '.svg']);
// brand/ = 확정 로고 아트워크(별도 CI 규정 관할) → 토큰 린트 대상 아님
const SKIP_DIR = new Set(['node_modules', '.git', 'fonts', 'assets', 'dist', 'build', '_archive', 'brand']);
function collect(p, out = []) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const e of readdirSync(p)) {
      if (SKIP_DIR.has(e)) continue;
      collect(join(p, e), out);
    }
  } else if (EXT.has(extname(p).toLowerCase())) out.push(p);
  return out;
}

/* ---------- 검사 본체 ---------- */
const findings = [];
function report(rule, file, line, msg, snippet) {
  findings.push({
    rule, file, line, msg,
    level: WARN_ONLY_RULES.has(rule) ? 'WARN' : 'FAIL',
    snippet: (snippet || '').trim().slice(0, 120),
  });
}
function disabled(lines, i, rule) {
  const here = lines[i] || '', above = lines[i - 1] || '';
  const tag = `ds-lint-disable`;
  return (here.includes(tag) || above.includes(tag)) &&
         (here.includes(rule) || above.includes(rule) || here.includes(`${tag} all`) || above.includes(`${tag} all`));
}

function lintFile(file, root) {
  const raw = readFileSync(file, 'utf8');
  const lines = raw.split(/\r?\n/);
  const ext = extname(file).toLowerCase();
  const code = maskComments(raw, ext);          // 주석 제거본 — 실제 검사 대상
  const rel = relative(root, file) || file;
  const isTokenSrc = /tokens[\/\\](core|legacy-alias)\.css$/.test(rel.replace(/\\/g, '/'));
  const varDecl = new Map();          // R14

  lines.forEach((ln, i) => {
    const L = i + 1;
    const check = r => !disabled(lines, i, r);
    const bare = code[i] || '';

    /* R01 색상 화이트리스트 */
    if (check('R01')) {
      for (const m of bare.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        const hex = norm(m[0]);
        if (m[0].length > 7 && m[0].length !== 4 && m[0].length !== 7) continue; // 8자리 alpha 별도
        if (ALLOWED_HEX.has(hex)) continue;
        if (EXTERNAL_BRAND[hex]) {                       // 외부 브랜드 색
          if (SOCIAL_CTX.test(ln)) continue;             // 소셜 로그인 컨텍스트면 통과
          report('R01_X', rel, L, `외부 브랜드 색 ${m[0]} (${EXTERNAL_BRAND[hex]}) — 소셜 로그인 외 용도 검토`, ln);
          continue;
        }
        report('R01', rel, L, `정본 밖 색상 ${m[0]}`, ln);
      }
    }
    /* R02 그라디언트 */
    if (check('R02') && /linear-gradient|radial-gradient|conic-gradient/i.test(bare)) {
      // 브랜드 면 판정 — 팔레트 override 가 있으면 그쪽 gradientPair 를 쓴다(다중 시스템 지원).
      const BRAND_VAR = PALETTE?.gradientPair
        ? GRADIENT_RE
        : /--neoya-primary-(deep|mid)|--brand-(deep|mid)|--(deep|mid|light|d|o|s)\b|#1A3A5C|#2B5F8B|#A8C4DD/i;
      const ANGLES = PALETTE?.gradientAngles || ['135', '155', '160'];
      const ok = new RegExp(`\\b(${ANGLES.join('|')})deg`, 'i').test(bare) && BRAND_VAR.test(bare);
      // 진행바·미터 전용 축방향 선형 — 가로 90deg · 세로 180deg. 색은 Deep→Mid.
      const isBrandLinear = /\b(90|180)deg/i.test(bare) && BRAND_VAR.test(bare);
      const isHairlineGrid = /1px,\s*transparent\s*1px/.test(bare);  // 그리드 배경
      const isWaveToken = /--wave-|wave-divider|--brand-gradient/.test(bare) || isBrandLinear || isHairlineGrid;
      if (!ok && !isWaveToken) report('R02', rel, L, '승인 외 그라디언트', ln);
    }
    /* R03 라디우스 */
    if (check('R03')) {
      for (const m of bare.matchAll(/border-radius\s*:\s*([^;{}"'>]+)/gi)) {
        const val = m[1].trim();
        if (val.includes('var(')) continue;
        for (const tok of val.split(/[\s\/]+/)) {
          if (!tok) continue;
          if (!ALLOWED_RADII.has(tok)) report('R03', rel, L, `허용 밖 radius ${tok}`, ln);
        }
      }
    }
    /* R04 섀도 */
    if (check('R04')) {
      for (const m of bare.matchAll(/box-shadow\s*:\s*([^;{}]+)/gi)) {
        const v = m[1];
        if (v.includes('var(') || /^\s*none/i.test(v)) continue;
        const isFocusRing = /focus/i.test(m.input.slice(0, m.index)) || /0 0 0 2px .*0 0 0 4px/.test(v) || /--focus-ring/.test(v);
        if (isFocusRing) continue;                                  // 접근성 포커스 링은 정본 토큰
        if (/inset\s+0\s+0\s+0\s+1px/i.test(v)) {                  // 1px 내부 헤어라인 = border 대용
          report('R04', rel, L, 'inset 1px 헤어라인 — border/outline로 교체 권장', ln);
          continue;
        }
        if (/inset/i.test(v)) report('R04', rel, L, 'inset(내부) 그림자 금지', ln);
        for (const c of v.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
          const [, r, g, b] = c;
          if (!(r === SHADOW_RGB[0] && g === SHADOW_RGB[1] && b === SHADOW_RGB[2])) {
            report('R04', rel, L, `섀도 색 rgba(${r},${g},${b}) — rgba(${SHADOW_RGB.join(',')},x)만 허용`, ln);
          }
        }
        if (/#[0-9a-fA-F]{3,6}/.test(v)) report('R04', rel, L, `섀도에 hex 사용 — rgba(${SHADOW_RGB.join(',')},x)만 허용`, ln);
      }
    }
    /* R05 / R06 폰트 */
    if (check('R05')) {
      // 꺾쇠에서 끊는다 — 따옴표 없는 인라인 style 속성이 뒤 마크업을 통째로 삼키는 것 방지.
      // 따옴표는 폰트명 자체에 쓰이므로 허용하고 아래에서 제거한다.
      for (const m of bare.matchAll(/font-family\s*:\s*([^;{}>]+)/gi)) {
        if (m[1].includes('var(')) continue;
        for (const f of m[1].split(',')) {
          const name = f.trim().replace(/['"]/g, '').toLowerCase();
          if (!name) continue;
          if (ALLOWED_FONTS.includes(name)) continue;
          if (EXTERNAL_BRAND_FONTS.includes(name) && SOCIAL_CTX.test(bare)) {
            report('R05_X', rel, L, `외부 브랜드 워드마크 폰트 "${name}" — 소셜 로그인 전용 예외`, ln);
            continue;
          }
          report('R05', rel, L, `미승인 폰트 "${name}"`, ln);
        }
      }
    }
    const isSpecimen = /preview[\/\\]type-|preview[\/\\]brand-/.test(rel.replace(/\\/g,'/'));
    if (check('R06') && PALETTE?.serifRule !== false && /noto serif kr/i.test(bare) && !isTokenSrc && !isSpecimen) {
      if (!/tagline|태그라인|pull-?quote|풀쿼트|serif-display|--font-serif/i.test(bare)) {
        report('R06', rel, L, 'Noto Serif KR은 태그라인·풀쿼트 전용', ln);
      }
    }
    /* R07 이모지 — 표면별 스코프 (브랜드 가이드 원문: 학생 대상 카피에 한해 허용,
       투자자·정부 자료에는 절대 금지). 대표님 결정 2026-07-25: 라이브 학생 표면은 유지. */
    if (check('R07') && EMOJI_RE.test(bare)) {
      const p = rel.replace(/\\/g, '/');
      const strictSurface = /ui_kits\/(gov|pitch)\/|preview\/|components\/|tokens\//.test(p);
      if (strictSurface) report('R07', rel, L, '이모지 금지 표면(투자자·정부제출·시스템 자산)', ln);
      else report('R07_S', rel, L, '학생 대상 표면 이모지 — 허용되나 절제 대상', ln);
    }
    /* R08 아이콘 stroke */
    if (check('R08')) {
      const iconCtx = /lucide|data-icon|class=["'][^"']*\bico\b|<i[\s>]|IconBase|feather/i.test(bare);
      const illustration = /polyline|<path\s+d=|grid-line|chart|spark|wave/i.test(bare);
      if (iconCtx && !illustration) {
        for (const m of bare.matchAll(/stroke-?[wW]idth\s*[:=]\s*["'{]?\s*([\d.]+)/g)) {
          if (parseFloat(m[1]) !== 1.75) report('R08', rel, L, `Lucide stroke ${m[1]} — 1.75 고정`, ln);
        }
      }
    }
    /* R09 모션 */
    if (check('R09')) {
      for (const m of bare.matchAll(/(?:transition|animation)[^;{}]*?(\d+)ms/gi)) {
        const ms = parseInt(m[1], 10);
        if (ms < 120 || ms > 320) report('R09', rel, L, `duration ${ms}ms — 120~320ms 범위 초과`, ln);
      }
      for (const m of bare.matchAll(/cubic-bezier\(([^)]+)\)/gi)) {
        const nums = m[1].split(',').map(s => parseFloat(s.trim()));
        const ok = Math.abs(nums[0] - 0.2) < 0.001 && nums[1] === 0 && nums[2] === 0 && nums[3] === 1;
        if (!ok) report('R09', rel, L, `이징 ${m[0]} — cubic-bezier(0.2,0,0,1)만 허용`, ln);
      }
    }
    /* R11 과장 표현 */
    if (check('R11')) {
      const exemptPhrase = ALLOWED_EXCEPT.some(p => bare.includes(p));
      if (!exemptPhrase) for (const w of HYPE) if (bare.includes(w)) report('R11', rel, L, `금칙 표현 "${w}"`, ln);
    }
    /* R13 색 단독 정보전달 */
    if (check('R13')) {
      const m = ln.match(/class\s*=\s*["'][^"']*\bmark-([1-5])\b[^"']*["']/);
      if (m) {
        const after = ln.slice(ln.indexOf(m[0]) + m[0].length);
        if (!/>[^<]*\S/.test(after)) report('R13', rel, L, `mark-${m[1]}에 라벨 텍스트 없음(색 단독 전달 금지)`, ln);
      }
    }
    /* R14 CSS 변수 중복정의 */
    if (check('R14') && /\.css$/i.test(rel)) {
      const m = bare.match(/^\s*(--[a-zA-Z0-9-]+)\s*:/);
      if (m) {
        const k = m[1];
        if (varDecl.has(k)) {
          report('R14', rel, L, `변수 ${k} 중복정의 (최초 ${varDecl.get(k)}행)`, ln);
        } else varDecl.set(k, L);
      }
    }
  });

  /* R10 통계 출처 — 화면에 렌더되는 텍스트에만 적용(CSS·설정 파일 제외) */
  if (['.html', '.htm', '.jsx', '.tsx'].includes(ext)) {
    // <style> 블록은 화면 텍스트가 아니므로 R10 대상에서 제외
    let inStyle = false;
    const styleMask = code.map(l => {
      const open = /<style[\s>]/i.test(l), close = /<\/style>/i.test(l);
      const was = inStyle;
      if (open) inStyle = true;
      if (close) inStyle = false;
      return was || open;
    });
    const stat = /(\d[\d,.]*)\s*(%|배|점|명|건|원|문항|일|시간|만|억)/;
    const hasSource = /출처|source|기준일|n\s*=|class=["'][^"']*\b(src|cite|source)\b/i;
    const isSpecimenFile = /preview[\/\\]type-/.test(rel.replace(/\\/g,'/'));
    code.forEach((cl, i) => {
      const text = stripTags(cl);
      if (isSpecimenFile) return;                       // 폰트 스펙 카드의 숫자는 견본
      if (styleMask[i] || disabled(lines, i, 'R10')) return;
      if (/gradient\(|width\s*:|height\s*:|flex|translate|border-radius/i.test(cl)) return;  // 스타일 값
      if (!stat.test(text)) return;
      const win = code.slice(Math.max(0, i - 8), i + 9).join('\n');
      if (!hasSource.test(win)) report('R10', rel, i + 1, '수치 인접 8줄 내 출처·기준일 표기 없음', lines[i]);
    });
  }

  /* R12 대비 — 같은 규칙 블록의 color/background 쌍 */
  const blocks = raw.split('}');
  let offset = 0;
  for (const b of blocks) {
    const startLine = raw.slice(0, offset).split(/\r?\n/).length;
    offset += b.length + 1;
    const decl = b.slice(b.lastIndexOf('{') + 1);   // 마지막 여는 중괄호 이후 = 실제 선언부
    const fg = decl.match(/(?<!-)\bcolor\s*:\s*(#[0-9a-fA-F]{3,6})/);
    const bg = decl.match(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6})/);
    if (fg && bg) {
      const ratio = contrast(fg[1], bg[1]);
      // JS 템플릿 문자열 한 줄에 인라인 style이 2개 이상이면 블록 분리가 불가능 →
      // 서로 다른 요소의 color/background가 잘못 짝지어진다. 확정 FAIL로 올리지 않는다.
      // (블록 전체 기준 — JS 템플릿의 `${}` 가 블록 분리를 더 잘게 쪼개므로 decl만 보면 놓친다)
      const ambiguousInline = (b.match(/style\s*=/gi) || []).length >= 2
        || /\$\{|\+\s*'<|\+\s*"</.test(b);
      // 정본이 placeholder·muted 용도로 규정한 톤(--gray-300/400 = --fg-3 계열)을
      // 전경색으로 쓰면 그 자체가 "비활성·미표기" 상태 표현이다. 본문 대비 기준 대상이 아니다.
      const PLACEHOLDER_FG = /^#(CBD2D9|9AA5B1)$/i;
      const exempt = ambiguousInline
        || PLACEHOLDER_FG.test(fg[1])
        || /disabled|\bchip\b|swatch|\btile\b|placeholder-demo/i.test(b)
        || /#FEE500|#03C75A|#4285F4|#EA4335/i.test(decl);   // 외부 브랜드 버튼
      if (ratio < 4.5) {
        if (exempt) { WARN_ONLY_RULES.add('R12_X'); report('R12_X', rel, startLine, `대비 ${ratio.toFixed(2)}:1 — 비활성/스와치 예외(참고)`, ''); }
        else report('R12', rel, startLine, `대비 ${ratio.toFixed(2)}:1 — AA 본문 4.5:1 미달 (${fg[1]} on ${bg[1]})`, '');
      }
    }
  }
}

/* ---------- 실행 ---------- */
const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const warnOnly = argv.includes('--warn-only');
// 값을 받는 옵션은 그 다음 인자도 대상 목록에서 뺀다
const VALUE_FLAGS = new Set(['--baseline', '--write-baseline']);
const targets = argv.filter((a, i) =>
  !a.startsWith('--') && !VALUE_FLAGS.has(argv[i - 1]));
if (targets.length === 0) targets.push('.');

const root = process.cwd();
let files = [];
for (const t of targets) files = files.concat(collect(t));
for (const f of files) {
  try { lintFile(f, root); }
  catch (e) { report('R00', f, 0, `검사 실패: ${e.message}`, ''); }
}

/* ---------- baseline ----------
   라이브 저장소처럼 "이미 알고 있고 고치지 않기로 한" 위반이 남아 있는 곳에서,
   그 목록만 면제하고 **신규 위반은 그대로 FAIL** 시키기 위한 래칫.
   키는 (규칙 · 파일 · 메시지 · 스니펫)의 해시 — 줄번호가 밀려도 유지된다. */
const keyOf = f => createHash('sha1')
  .update(`${f.rule}|${f.file.replace(/\\/g, '/')}|${f.msg}|${f.snippet}`)
  .digest('hex').slice(0, 12);

const argIdx = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const baselinePath = argIdx('--baseline');
const writeBaselinePath = argIdx('--write-baseline');

let baseline = new Set();
if (baselinePath && existsSync(baselinePath)) {
  const b = JSON.parse(readFileSync(baselinePath, 'utf8'));
  baseline = new Set((b.accepted || []).map(e => e.key));
}

let baselined = [];
if (baseline.size) {
  baselined = findings.filter(f => f.level === 'FAIL' && baseline.has(keyOf(f)));
  for (const f of baselined) f.level = 'BASE';
}

if (writeBaselinePath) {
  const accepted = findings.filter(f => f.level === 'FAIL' || f.level === 'BASE')
    .map(f => ({ key: keyOf(f), rule: f.rule, file: f.file.replace(/\\/g, '/'), msg: f.msg }));
  writeFileSync(writeBaselinePath, JSON.stringify({
    note: '승인된 잔여 위반 목록. 근거는 docs/LIVE_EXCEPTIONS.md. 신규 위반은 여기에 없으므로 CI에서 FAIL 한다.',
    accepted,
  }, null, 2) + '\n');
  console.log(`baseline 기록 ${accepted.length}건 → ${writeBaselinePath}`);
}

const fails = findings.filter(f => f.level === 'FAIL');
const warns = findings.filter(f => f.level === 'WARN');

if (asJson) {
  console.log(JSON.stringify({ files: files.length, fail: fails.length, warn: warns.length, findings }, null, 2));
} else {
  console.log(`\nds-lint v1.0 — ${PALETTE?.system || 'NEOYA Design System'}`);
  console.log(`검사 파일 ${files.length}개 · FAIL ${fails.length} · WARN ${warns.length}`
    + (baselined.length ? ` · BASE ${baselined.length}(승인된 잔여)` : '') + '\n');
  const byRule = {};
  for (const f of findings) (byRule[f.rule] ||= []).push(f);
  for (const r of Object.keys(byRule).sort()) {
    console.log(`[${r}] ${RULES[r] || ''}  (${byRule[r].length}건)`);
    for (const f of byRule[r].slice(0, 20)) {
      console.log(`   ${f.level}  ${f.file}:${f.line}  ${f.msg}`);
      if (f.snippet) console.log(`         ${f.snippet}`);
    }
    if (byRule[r].length > 20) console.log(`   … 외 ${byRule[r].length - 20}건`);
    console.log('');
  }
  if (findings.length === 0) console.log('통과 — 14항 전부 이상 없음.\n');
}

process.exit(warnOnly ? 0 : (fails.length > 0 ? 1 : 0));
