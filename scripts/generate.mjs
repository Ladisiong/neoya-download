/**
 * NEOUL 무료 학습자료 — 100% 무인 생성 엔진 v2 (품질 최우선)
 * 변경 핵심(v1 결함 4종 근본수정):
 *  1) 모델명 비노출  — PDF 표기에서 AI(provider)/v-auto 제거 → "SKY 멘토 × AI 협업 출제"만.
 *  2) 수식 렌더      — LibreOffice(JS 미실행) → Chromium(Playwright) 프린트 + KaTeX 렌더. raw LaTeX 제거.
 *  3) 도형/그래프    — 문항 내 인라인 <svg> 강제(자기완결). "그림과 같이"인데 그림 없는 문제 금지.
 *  4) 라우팅 품질    — 전 과목 주력 = Opus 4.8(anthropic). 타 모델은 폴백만. (수학=flash 자의배정 폐기)
 *  + 레이아웃        — 문항 카드/여백/줄바꿈(overflow-wrap) 정비로 글자 잘림 제거.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { chromium } from 'playwright';

const OUT = 'frontend/materials';
const MANIFEST = 'frontend/materials.json';
const KBROWS = [];  // tutor_kb(RAG) sidecar: weekly concept -> learn tutor KB
mkdirSync(OUT, { recursive: true });

const MODELS = {
  anthropic: process.env.ANTHROPIC_MODEL || 'claude-opus-5',            // MODEL FLOOR (BHTM constitution v17.0 art.9): Opus 5 + effort high
  anthropic2: process.env.ANTHROPIC_MODEL_FALLBACK || 'claude-fable-5-1', // same-provider fallback, ABOVE the floor
  openai:    process.env.OPENAI_MODEL    || '',                        // below-floor default removed (2026-09-09); opt-in via repo var only
  gemini:    process.env.GEMINI_MODEL    || 'gemini-3.1-pro-preview',  // top-tier fallback only (no Flash-class models)
};
const KEYS = {
  anthropic: process.env.ANTHROPIC_API_KEY || '',
  anthropic2: process.env.ANTHROPIC_API_KEY || '',
  openai:    process.env.OPENAI_API_KEY || '',
  gemini:    process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
};

// 품질 최우선(거버넌스: 전 부서 1순위 = Opus 4.8). 전 과목 주력 = anthropic, 나머지는 폴백만.
// MODEL FLOOR: Opus 5 (effort high) primary -> Fable 5.1 -> Gemini 3.1 Pro. Providers without a model or key are skipped.
const FALLBACK = ['anthropic', 'anthropic2', 'gemini', 'openai'].filter(p => MODELS[p]);

const SUBJECTS = [
  { cat:'국어', sub:'독서' }, { cat:'국어', sub:'문학' }, { cat:'국어', sub:'화법과작문' }, { cat:'국어', sub:'언어와매체' },
  { cat:'영어', sub:'독해' },
  { cat:'한국사', sub:'한국사' },
  { cat:'수학', sub:'수학1' }, { cat:'수학', sub:'수학2' }, { cat:'수학', sub:'확률과통계' }, { cat:'수학', sub:'미적분' }, { cat:'수학', sub:'기하' },
  { cat:'사탐', sub:'생활과윤리' }, { cat:'사탐', sub:'윤리와사상' }, { cat:'사탐', sub:'한국지리' }, { cat:'사탐', sub:'세계지리' }, { cat:'사탐', sub:'정치와법' }, { cat:'사탐', sub:'경제' }, { cat:'사탐', sub:'사회문화' }, { cat:'사탐', sub:'동아시아사' }, { cat:'사탐', sub:'세계사' },
  { cat:'과탐', sub:'물리학1' }, { cat:'과탐', sub:'물리학2' }, { cat:'과탐', sub:'화학1' }, { cat:'과탐', sub:'화학2' }, { cat:'과탐', sub:'생명과학1' }, { cat:'과탐', sub:'생명과학2' }, { cat:'과탐', sub:'지구과학1' }, { cat:'과탐', sub:'지구과학2' },
  { cat:'통합사회', sub:'통합사회' }, { cat:'통합과학', sub:'통합과학' },
];

// 파일럿: ONLY_SUBJECTS="미적분,물리학1" 지정 시 해당 세부과목만 생성(검증용). 미지정=전 과목.
const ONLY=(process.env.ONLY_SUBJECTS||'').split(',').map(x=>x.trim()).filter(Boolean);
const RUN=ONLY.length?SUBJECTS.filter(s=>ONLY.includes(s.sub)):SUBJECTS;

const PROMPT = (s, unit) => `당신은 대한민국 수능·내신 ${s.cat}(${s.sub}) 최고 출제·해설 집필 전문가입니다. 시중 최상위 문제집과 평가원 해설집 수준의 학습자료 1세트를 만드세요. 타깃 독자는 고3 1~2등급·재수생 상위권이다. 시대인재·대성 최상위 프리미엄 교재 수준으로 만들어 '무료 배포이지만 유료 교재보다 낫다'는 인상을 주어야 한다(화장품이 샘플에 최고 퀄리티를 넣는 전략과 동일—무료라고 퀄리티가 낮으면 실패한다). 이 자료의 궁극 목적은 학생이 감탄해 '너울(NEOUL)'로 유입되는 매개체가 되는 것이다.

이번 자료의 단원(unit)은 「${unit}」 이다. 반드시 이 단원 범위 안에서만 개념·문항·해설을 구성하라(다른 단원 내용 혼입 금지).${s.sub==='미적분'?' ★미적분 특칙(대표님 지시, 필수): 삼각함수 관련 내용 전면 제외 — 삼각함수의 극한·미분·적분 및 sin·cos·tan 포함 문항 절대 금지, 지수·로그·다항·유리·무리함수 중심으로만 출제한다. 그리고 도형·그래프가 필요한 문항 전면 제외 — 인라인 <svg> 도형/그래프 없이 순수 대수·해석적으로 완결되는 문항만(넓이·부피·기하 해석 문제 배제).':''}${s.cat==='국어'&&s.sub==='문학'?' ★문학 특칙(대표님 지시, 필수): 문학 지문은 절대 자작하지 말고, 저작권 보호기간이 만료된(작가 사후 70년 경과·1962년 이전 사망) 실제 빈출·대표 작품의 원문을 정확히 인용한다(김소월·이육사·윤동주·한용운·정지용·현진건·김유정 등 근현대 및 정철·윤선도 등 고전 전체 가능. 백석 등 저작권 존속 현대작 금지). 작가·출처를 명시하고 지문 원문은 그대로 싣되 문항·선지·해설만 새로 창작한다.':''}

[절대 원칙]
1. 자기완결성: 문제는 스스로 완결되어야 한다. "그림과 같이", "다음 그래프에서"처럼 도형·그래프를 언급하면 그 도형·그래프를 반드시 문항 안에 인라인 <svg>로 직접 그려 넣는다. 외부 이미지/링크 금지. 도형을 언급하면서 도형이 없는 문제 절대 금지.
2. 수식: 모든 수식·기호는 반드시 인라인은 $ ... $, 별행은 $$ ... $$ 로 감싼다. (예: $\lim_{x\to 2}\frac{x^2+ax+b}{x-2}=5$) 다른 구분자나 순수 텍스트 수식 금지. 수식 안 부등호는 반드시 \lt \gt \le \ge 로 쓰고 원시 문자 <, >, ≤, ≥ 는 수식 안에서 사용 금지. ★\lt \gt \le \ge 명령어는 오직 $...$ 수식 안에서만 쓴다 — 수식 밖 일반 문장에서 크기 비교는 한국어("A가 B보다 크다/높다·초과·미만")로 표현하고 부등호 기호나 \gt 등 명령어를 평문에 절대 쓰지 않는다(평문에 gt/lt 텍스트가 그대로 노출됨).
3. 도형/그래프: <svg viewBox="0 0 W H"> 에 좌표축·눈금·라벨·점 좌표를 정확히 그린다. 함수 그래프는 실제 좌표로 <path>/<polyline>, 기하 도형은 정확한 비율·각도. 색은 흑/남색 위주, 폰트 12px 내외.
4. 정확성: 정답·풀이 수치는 반드시 재검산(수학·과탐은 계산 2회 검증). 정답표와 해설의 수치가 일치해야 한다.
5. 벤치마킹: 평가원 기출·EBS의 유형·난이도·평가요소만 차용하고, 지문·선지·수치·표현·도형은 완전히 새로 창작한다. 기출 원문 재수록·부분치환 절대 금지(저작권).
6. 난이도(고3 1~2등급·재수 상위권 상향): 5~7문항. 전체 기준선은 "1·2등급이 풀어야 실력이 붙는" 수준으로, 단순 대입·생기초 유형은 배제한다. 3단으로 구성(★대표님 지시: 전 티어 한 단계씩 상향) — 기본=(구 심화급) 평가원 4점 준킬러(2~3개 개념 통합·조건 해석·역방향 사고, 단순 개념 적용은 '기본'에서도 금지), 심화=(구 킬러급) 평가원 최상위 4점 킬러(21·22·29·30번급: 발상 전환·다단계 추론·경우 나눔), 킬러=상위 1%만 푸는 진정한 킬러(수능 만점 방어선·최상단 변별로 1등급 최상위권도 시간 압박을 받는 수준—비표준적 발상 대전환+다단계 추론+숨은 구조 통찰이 동시에 필요한, 시대인재 최고난도 파이널/킬러 N제급). 의대·치대·한의대 지망 최상위권 변별이 목표이며, 무료 자료라고 절대 쉽게 내지 말 것. 각 문항에는 [기본]/[심화]/[킬러] 난이도만 표기하고 배점(점수·N점)은 절대 표기하지 않는다(★대표님 지시: 배점은 난이도와 무관해 혼란만 준다). 킬러는 최소 1문항. 흔한 실수(부호·정의역·극한의 존재조건·경계값·필요충분·수렴판정)를 유발하는 매력적 오답 선지를 의도적으로 배치한다. 정답은 반드시 깔끔한 값이어야 하며(지저분한 분수·무리수 남발 금지), 모든 수치는 손계산으로 2회 재검산해 문항·정답표·해설이 완전히 일치해야 한다. 7. 개념요약(깊이 있되 쉽게 — 일타강사식, ★대표님 지시): concept_html은 상위권 심화 학습·단권화에 쓸 깊이를 담되, 반드시 학생이 이해하기 쉬운 용어와 구체적 예시로 일타강사가 설명하듯 풀어쓴다(존댓말·경어체 필수, 반말 금지). ①핵심 정의·정리·공식과 왜 성립하는지를 직관적 이유와 간단한 예로 ②빈출 유형별 접근 전략 ③비자명한 성질·반례·경계 조건 ④자주 틀리는 함정 ⑤두문자·요약표 등 암기 장치. 어려운 개념일수록 쉬운 비유·예시로 풀어 설명한다. 최근 수능·평가원에 출제되지 않는 지엽·폐지 개념은 제외하고 최신 핵심 개념 위주로 한다. 단순 공식 나열·자명 상식 금지. <h3> 소제목으로 구획한다.
8. 해설편(가독성·해설집 어휘·스텝 필수, 전 과목 공통 — 시각적 구조화 필수): 어떤 과목이든 줄글 나열식 해설은 학생이 즉시 스킵하므로 반드시 단계로 끊는다. ▸수학·과탐=계산·논리 단계 / ▸국어·영어=[지문 근거 찾기]→[선지 대조]→[정답 확정] / ▸사탐·한국사=[개념 적용]→[자료 해석]→[선지 판별]로 사고 흐름을 단계화한다. 반드시 <div class="sol"> 안에서 <div class="step"><b>Step 1.</b> …</div> 을 단계마다 반복해 각 단계에서 '무엇을 왜' 하는지 짧게 제시하고, 핵심 수식은 별행 $$…$$. 실제 시중 해설집·평가원 해설의 표준 어휘·표기("조건에 의하여", "주어진 식을 정리하면", "~이므로", "양변을 …", "∴", "따라서", "그러므로")를 사용한다. 스텝 풀이 뒤에 <div class="blk">…</div>로 4블록(<span class="lb">정답근거</span> → <span class="lb">오답분석</span>[배치한 함정 명시] → <span class="lb">연관개념</span> → <span class="lb">메타인지</span> 한 줄)을 붙인다.
9. 표기: "SKY 멘토 × AI 협업 출제"만 사용. 개인명(김태민 등)·특정 AI 모델명(gemini/gpt/claude 등)·타사 브랜드(메가/대성/시대인재/이투스/EBS 강사명 등)·성적보장·과장 표현 금지.
10. 시각화·가독성 최우선(개념·문제·해설 전부): 긴 글 덩어리 금지. 핵심은 <table>(비교·분류·공식표), <div class="box">(정의·핵심·함정 강조 박스), <b>색 강조</b>, 번호 목록, 필요한 곳엔 인라인 <svg> 도식(개념 관계도·그래프·기하)으로 시각화한다. 한눈에 구조가 들어오는 프리미엄 편집(시대인재式)을 지향한다.
11. 통합사회·통합과학: 절대 중학·기초 나열 수준 금지. 수능 통합과학/통합사회 상위 수준으로 여러 개념의 연결·자료(그래프·표) 해석·실생활 적용 추론을 담아 고3 상위권도 사고하게 만든다.
12. ★암기 비중이 큰 과목(사탐·한국사·생명과학 등)은 개념요약에 두문자(앞글자)를 딴 암기법을 자연스러운 스토리텔링으로 제시해 학생이 쉽게 외우도록 한다.
13. ★어투(전 과목·전 산출물): 개념·문제·해설의 설명 문장은 모두 존댓말(경어체)로 쓴다. 반말 절대 금지.

[출력] 오직 JSON 하나만 출력(코드펜스 금지):
{"topic":"이 단원의 핵심 소주제 한 줄(15자 내외)","concept_html":"개념요약 본문 HTML","problems_html":"문제편 본문 HTML","solutions_html":"해설편 본문 HTML"}
- 각 값은 <html>/<body> 없이 본문 HTML만. 문항은 <div class="q"><span class="no">[기본] 1</span> ... </div> 구조(심화는 class="no adv", 킬러는 class="no killer").
- 개념요약은 <h3>소제목</h3>으로 구획하고 필요 시 <table>/<div class="box"> 사용. 해설편 각 풀이는 반드시 <div class="sol"> 안에 <div class="step"><b>Step 1.</b>…</div>을 단계마다 반복(줄글 금지)한 뒤 <div class="blk">…4블록…</div>.
- 도형·그래프는 인라인 <svg>, 수식은 $ ... $ / $$ ... $$.`;

// ── 수학 전용(대표님 지시): 개념요약 1 + 기본/심화/킬러 각 8문항(너울7+기출8) ──
const MATH_CONCEPT = (s, unit) => `당신은 대한민국 수능 수학(${s.sub}) 최고 개념서 집필 전문가입니다. 단원 「${unit}」의 개념요약 1편을 만드세요. 무료 배포이지만 유료 교재보다 낫다는 인상(미끼상품 최고품질).
[규칙]
1. 일타강사식: 어려운 개념도 학생이 이해하기 쉬운 용어와 구체적 예시로 풀어 설명한다(존댓말·경어체 필수, 반말 금지). 정의·정리·공식은 왜 성립하는지 직관과 간단한 예를 함께 든다. 최근 수능·평가원에 출제되지 않는 지엽·폐지 개념은 제외하고 최신 핵심 개념 위주로 한다.
2. 담을 것: 핵심 정의·정리·공식(유도 직관), 빈출 유형별 접근 전략, 자주 틀리는 함정, 암기용 요약표·두문자. <h3> 소제목으로 구획하고 <table>/<div class="box">를 활용한다. 긴 글 덩어리 금지.
3. 수식은 $ … $ / $$ … $$ 로 감싼다(KaTeX). 부등호가 필요하면 수식 안에서 처리하고, 평문에는 부등호 기호를 쓰지 말고 '크다·작다·이상·이하'로 쓴다. 필요 시 인라인 <svg> 도식.${s.sub==='미적분'?' ★미적분 특칙: 삼각함수 전면 제외.':''}
4. 표기: "SKY 멘토 × AI 협업 출제"만. 개인명·특정 AI 모델명·타사 브랜드(메가/대성/시대인재 등)·성적보장·과장 금지.
[출력] 오직 JSON 하나만(코드펜스 금지): {"topic":"핵심 소주제 한 줄(15자 내외)","concept_html":"개념요약 본문 HTML(<html>/<body> 없이)"}`;

const MATH_SET = (s, unit, diff) => `당신은 대한민국 수능 수학(${s.sub}) 최고 출제·해설 전문가입니다. 단원 「${unit}」의 [${diff}] 난이도 문제 세트(총 8문항)를 만드세요. 시대인재·대성 최상위 프리미엄 N제 수준으로, 무료지만 유료보다 낫게 만든다(미끼상품—무료라고 절대 쉽게 내지 말 것).
[구성] 총 8문항 전부 너울 자체창작 — 완전히 새로 창작한 [${diff}] 난이도 문항(지문·수치·선지·도형 전부 새로 만든다). 기출 원문 재수록·부분치환 절대 금지(저작권). 평가원 기출의 유형·난이도·평가요소만 벤치마킹한다.
[난이도 ${diff}] ${diff==='기본'?'평가원 4점 준킬러급 — 2~3개 개념 통합·조건 해석·역방향 사고. 단순 대입·생기초 유형 금지.':diff==='심화'?'평가원 최상위 4점 킬러급(21·22·29·30번급) — 발상 전환·다단계 추론·경우 나눔.':'상위 1%만 푸는 진짜 킬러 — 수능 만점 방어선. 비표준 발상 대전환+다단계 추론+숨은 구조 통찰이 동시에 필요.'}
[규칙]
1. 각 문항은 <div class="q"><span class="no${diff==='기본'?'':diff==='심화'?' adv':' killer'}">[${diff}] N</span> …</div> 구조. 배점(점수·N점)은 절대 표기하지 않고 [${diff}]만 표기.
2. 수식은 $ … $ / $$ … $$ (KaTeX). 부등호가 필요하면 수식 안에서 처리하고 평문에는 '크다·작다·이상·이하'로 쓴다.
3. 도형·그래프를 언급하면("그림과 같이" 등) 반드시 인라인 <svg>로 문항 안에 직접 그린다(외부 이미지/링크 금지, 도형 없는 도형문제 금지).
4. 출제한 8문항을 스스로 처음부터 끝까지 풀어 검산한다. 각 문항은 조건이 서로 모순되지 않고 유일하고 깔끔한 정답이 반드시 존재하며, 해설이 그 정답까지 완결되어야 한다. 조건이 모순되거나 정답이 안 떨어지는 문항은 폐기하고 조건이 명확한 새 문항으로 교체한 뒤 다시 검산한다. 해설에 '정정'·'설계 오류'·'재설계'·'모순'·'미확정'·'정정이 필요' 등 미완결·오류를 자인하는 표현이 나오면 실패이므로 절대 금지한다.${s.sub==='미적분'?' ★미적분 특칙: 삼각함수 및 도형·그래프 문항 전면 제외(순수 대수·해석적으로 완결).':''}
5. 표기: "SKY 멘토 × AI 협업 출제"만, 개인명·특정 AI 모델명·타사 브랜드·성적보장 금지.
[해설] 해설편은 각 문항마다 <div class="sol"> 안에 <div class="step"><b>Step 1.</b> …</div>을 단계마다 반복하고(줄글 나열 금지, 존댓말), 끝에 <div class="blk"><span class="lb">정답근거</span> … → <span class="lb">오답분석</span>[배치한 함정 명시] → <span class="lb">연관개념</span> → <span class="lb">메타인지</span></div> 4블록을 붙인다. 핵심 수식은 별행 $$ … $$.
[출력] 오직 JSON 하나만(코드펜스 금지): {"problems_html":"문제편 본문 HTML","solutions_html":"해설편 본문 HTML"}`;

const MATH_VERIFY = (s, unit, diff, pr, sol) => `당신은 대한민국 수능 수학(${s.sub}) 최고 검수관입니다. 아래 단원 「${unit}」 [${diff}] 8문항의 문제편·해설편(HTML)을 각 문항마다 처음부터 끝까지 직접 풀어 검증하세요.
[불량 판정] 조건이 서로 모순되거나, 유일하고 깔끔한 정답이 존재하지 않거나(값 미결정 포함), 해설이 정답까지 완결되지 않거나, 해설에 '정정'·'설계 오류'·'재설계'·'모순'·'미확정'·'필요합니다' 등 오류를 자인하는 표현이 있는 문항은 불량입니다.
[중요] 정상 문항은 절대 손대지 마세요(출력에 포함하지 않습니다). 오직 불량 문항만, 같은 [${diff}] 난이도·같은 평가요소로 조건이 명확하고 정답이 깔끔히 떨어지는 새 문항으로 교체합니다.
[교체 형식] problem_html = 그 한 문항 전체 <div class="q"><span class="no${diff==='기본'?'':diff==='심화'?' adv':' killer'}">[${diff}] N</span> … </div>. solution_html = 그 한 문항 해설 전체 <div class="sol"> … <div class="blk"><span class="lb">정답근거</span> … <span class="lb">오답분석</span> … <span class="lb">연관개념</span> … <span class="lb">메타인지</span> …</div></div>. 번호 N·$…$/$$…$$(KaTeX)·인라인 <svg> 표기를 지키고 모든 $는 반드시 짝을 맞춥니다(홀수 개 금지). 배점 표기 금지, 자평·변경사유 등 메타설명 금지.
[출력] 오직 JSON 하나만(코드펜스 금지). 불량 문항이 없으면 {"bad":[]}. 있으면 {"bad":[{"no":정수,"problem_html":"…","solution_html":"…"}]}
[문제편]
${pr}
[해설편]
${sol}`;

// ── 전 과목 공통(대표님 지시 2026-07-19): 개념요약 1 + 기본/심화/킬러 각 8문항 ──
function SUBJ_NOTE(s){
  var n='';
  if(s.sub==='미적분') n+=' ★미적분 특칙(필수): 삼각함수(극한·미분·적분·sin/cos/tan) 전면 제외 + 도형·그래프 문항 제외 — 지수·로그·다항·유리·무리함수 중심 순수 대수·해석으로 완결.';
  if(s.cat==='국어'&&s.sub==='문학') n+=' ★문학 특칙(필수): 지문 자작 절대 금지 — 저작권 만료(작가 1962년 이전 사망: 김소월·이육사·윤동주·한용운·정지용·현진건·김유정·정철·윤선도 등, 백석 등 저작권 존속작 금지) 실제 빈출·대표작 원문을 정확히 인용하고 작가·출처를 명시하되 문항·선지·해설만 새로 창작한다.';
  if(s.cat==='국어'&&s.sub!=='문학') n+=' ★국어 비문학/화작/언매: 지문·자료를 문항 안에 직접 싣고(자작 가능) 해설은 지문 근거 문장을 인용해 단계화한다.';
  if(s.cat==='영어') n+=' ★영어: 수준 높은 영어 지문을 문항 안에 직접 싣고 대의파악·빈칸·순서·문장삽입·어법 등 수능 유형으로 출제. 해설은 정답 근거 영어 문장을 인용한다.';
  if(s.cat==='사탐'||s.cat==='통합사회') n+=' ★자료해석형: 표·그래프·지도·사례 자료를 인라인 <svg>/<table>로 문항에 직접 넣고 자료 해석+개념 적용을 요구. 암기 요소는 두문자 활용.';
  if(s.cat==='한국사') n+=' ★한국사: 사료·연표·지도를 <svg>/<table>로 직접 넣고, 현대사(개항~현대) 비중을 반드시 포함. 두문자 암기 활용.';
  if(s.cat==='과탐'||s.cat==='통합과학') n+=' ★과학: 계산+자료해석 혼합, 그래프·실험장치는 인라인 <svg>, 수치는 2회 재검산. 통합과학은 중학·기초 나열 금지·상위 통합 추론.';
  return n;
}
const CONCEPT_G = (s, unit) => `당신은 대한민국 수능·내신 ${s.cat}(${s.sub}) 최고 개념서 집필 전문가입니다. 단원 「${unit}」의 개념요약 1편을 만드세요. 무료 배포이지만 유료 교재보다 낫다는 인상(미끼상품 최고품질). 이 단원 범위 안에서만 구성.${SUBJ_NOTE(s)}
[규칙]
1. 일타강사식: 어려운 개념도 학생이 이해하기 쉬운 용어와 구체적 예시로 풀어 설명(존댓말·경어체 필수, 반말 금지). 정의·정리·공식은 왜 성립하는지 직관과 예를 함께. 최근 수능·평가원 미출제 지엽·폐지 개념 제외, 최신 핵심 위주.
2. 담을 것: 핵심 정의·정리·공식(유도 직관), 빈출 유형별 접근 전략, 비자명 성질·반례·경계, 자주 틀리는 함정, 암기용 요약표·두문자(암기 비중 큰 과목 필수). <h3> 소제목 구획 + <table>/<div class="box"> 활용. 긴 글 덩어리·단순 공식 나열 금지.
3. 수식은 $ … $ / $$ … $$(KaTeX). 수식 안 부등호만 \\lt \\gt \\le \\ge, 평문엔 '크다·작다·이상·이하'. 리터럴 <,> 는 수식 안에서도 금지. 필요 시 인라인 <svg> 도식.
4. 표기: "SKY 멘토 × AI 협업 출제"만. 개인명·특정 AI 모델명·타사 브랜드·성적보장·과장 금지.
[출력] 오직 JSON 하나만(코드펜스 금지): {"topic":"핵심 소주제 한 줄(15자 내외)","concept_html":"개념요약 본문 HTML(<html>/<body> 없이)"}`;

const SET_G = (s, unit, diff) => `당신은 대한민국 수능·내신 ${s.cat}(${s.sub}) 최고 출제·해설 전문가입니다. 단원 「${unit}」의 [${diff}] 난이도 문제 세트(총 8문항)를 만드세요. 시대인재·대성 최상위 프리미엄 수준으로 무료지만 유료보다 낫게(미끼상품—절대 쉽게 내지 말 것). 타깃=고3 1~2등급·재수 상위권. 이 단원 범위 안에서만.${SUBJ_NOTE(s)}
[구성] 총 8문항 전부 너울 자체창작(지문·자료·수치·선지·도형 전부 새로). 기출 원문 재수록·부분치환 절대 금지(저작권), 평가원 유형·난이도·평가요소만 벤치마킹.
[난이도 ${diff}] ${diff==='기본'?'평가원 4점 준킬러급 — 2~3개 개념 통합·조건/자료 해석·역방향 사고. 단순 대입·단순 암기확인·생기초 금지.':diff==='심화'?'평가원 최상위 4점 킬러급(21·22·29·30번급) — 발상 전환·다단계 추론·경우 나눔·자료 종합.':'상위 1%만 푸는 진짜 킬러 — 수능 만점 방어선·최상단 변별. 비표준 발상 대전환+다단계 추론+숨은 구조 통찰이 동시에 필요.'}
[규칙]
1. 각 문항 <div class="q"><span class="no${diff==='기본'?'':diff==='심화'?' adv':' killer'}">[${diff}] N</span> …</div>. 배점(점수·N점) 절대 금지, [${diff}]만 표기.
2. 자기완결성: "그림과 같이/다음 자료에서" 등 도형·그래프·표를 언급하면 반드시 인라인 <svg>/<table>로 문항 안에 직접 그린다(외부 이미지/링크 금지, 도형 없는 도형문제 금지). 국어·영어는 지문을 문항 안에 직접 싣는다.
3. 수식은 $ … $ / $$ … $$(KaTeX). 수식 안 부등호만 \\lt \\gt \\le \\ge, 평문엔 한국어 표현. 리터럴 <,> 는 수식 안에서도 금지.
4. 자가검산(필수): 8문항을 스스로 끝까지 풀어(국어·영어는 지문 근거로 정답의 유일성 확인) 조건·자료가 모순되지 않고 유일하고 명확한 정답이 존재하며 해설이 그 정답까지 완결되게 한다. 매력적 오답(함정) 선지를 의도 배치. 불량 문항은 폐기하고 새로 만든 뒤 재검산. 해설에 '정정'·'설계 오류'·'재설계'·'모순'·'미확정'·'정정이 필요' 등 미완결·오류 자인 표현 절대 금지.
5. 표기: "SKY 멘토 × AI 협업 출제"만, 개인명·AI 모델명·타사 브랜드·성적보장 금지.
[해설] 각 문항 <div class="sol"> 안 <div class="step"><b>Step 1.</b> …</div> 단계 반복(줄글 금지, 존댓말). 과목별 사고흐름: 수학·과탐=계산·논리 단계 / 국어·영어=지문 근거 찾기→선지 대조→정답 확정 / 사탐·한국사=개념 적용→자료 해석→선지 판별. 표준 해설 어휘("조건에 의하여","정리하면","∴","따라서") 사용. 끝에 <div class="blk"><span class="lb">정답근거</span> … <span class="lb">오답분석</span>[함정 명시] … <span class="lb">연관개념</span> … <span class="lb">메타인지</span></div> 4블록. 핵심 수식 별행 $$…$$.
[출력] 오직 JSON 하나만(코드펜스 금지): {"problems_html":"문제편 본문 HTML","solutions_html":"해설편 본문 HTML"}`;

const VERIFY_G = (s, unit, diff, pr, sol) => `당신은 대한민국 수능·내신 ${s.cat}(${s.sub}) 최고 검수관입니다. 아래 단원 「${unit}」 [${diff}] 8문항의 문제편·해설편(HTML)을 각 문항마다 직접 풀어(국어·영어는 지문 근거로 정답 유일성 확인) 검증하세요.
[불량 판정] 조건·자료가 서로 모순되거나, 유일하고 명확한 정답이 없거나(복수정답·값 미결정 포함), 해설이 정답까지 완결되지 않거나, 해설에 '정정'·'설계 오류'·'재설계'·'모순'·'미확정'·'필요합니다' 등 오류 자인 표현이 있는 문항은 불량입니다.
[중요] 정상 문항은 절대 손대지 마세요(출력 제외). 오직 불량 문항만 같은 [${diff}] 난이도·같은 평가요소로 조건이 명확하고 정답이 확실한 새 문항으로 교체합니다.
[교체 형식] problem_html=그 한 문항 전체 <div class="q"><span class="no${diff==='기본'?'':diff==='심화'?' adv':' killer'}">[${diff}] N</span> … </div>. solution_html=그 한 문항 해설 전체 <div class="sol"> … <div class="blk"><span class="lb">정답근거</span> … <span class="lb">오답분석</span> … <span class="lb">연관개념</span> … <span class="lb">메타인지</span> …</div></div>. 번호 N·$…$(KaTeX)·인라인 <svg>·지문 표기를 지키고 모든 $는 짝을 맞춤. 배점·자평·변경사유 금지.
[출력] 오직 JSON 하나만(코드펜스 금지). 불량 없으면 {"bad":[]}. 있으면 {"bad":[{"no":정수,"problem_html":"…","solution_html":"…"}]}
[문제편]
${pr}
[해설편]
${sol}`;

const LOG_URL = 'https://iwrblahmszuthemfrhmy.supabase.co/functions/v1/log-usage';
function logUsage(provider, model, inTok, outTok){
  try{ fetch(LOG_URL,{method:'POST',headers:{'content-type':'application/json','x-bhtm-log':'bhtm-usage-2026'},body:JSON.stringify({provider,model,feature:'free-dist-engine',input_tokens:inTok||0,output_tokens:outTok||0})}).catch(function(){}); }catch(e){}
}
async function callAnthropic(prompt, maxTok=20000, model=MODELS.anthropic) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'x-api-key':KEYS.anthropic, 'anthropic-version':'2023-06-01', 'content-type':'application/json' },
    body: JSON.stringify({ model:model, max_tokens:maxTok, output_config:{ effort:'high' }, messages:[{role:'user',content:prompt}] })
  });
  const j = await r.json();
  if (!r.ok) throw new Error('anthropic '+r.status+' '+JSON.stringify(j).slice(0,200));
  logUsage('anthropic', model, j.usage&&j.usage.input_tokens, j.usage&&j.usage.output_tokens);
  return j.content.map(c=>c.text||'').join('');
}
async function callOpenAI(prompt, maxTok=24000) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{ 'authorization':'Bearer '+KEYS.openai, 'content-type':'application/json' },
    body: JSON.stringify({ model:MODELS.openai, messages:[{role:'user',content:prompt}], max_completion_tokens:maxTok, reasoning_effort:'low' })
  });
  const j = await r.json();
  if (!r.ok) throw new Error('openai '+r.status+' '+JSON.stringify(j).slice(0,200));
  logUsage('openai', MODELS.openai, j.usage&&j.usage.prompt_tokens, j.usage&&j.usage.completion_tokens);
  return j.choices[0].message.content;
}
async function callGemini(prompt, maxTok=24000) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent?key=${KEYS.gemini}`;
  const r = await fetch(url, { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ contents:[{ parts:[{ text:prompt }] }], generationConfig:{ maxOutputTokens:maxTok } }) });
  const j = await r.json();
  if (!r.ok) throw new Error('gemini '+r.status+' '+JSON.stringify(j).slice(0,200));
  logUsage('gemini', MODELS.gemini, j.usageMetadata&&j.usageMetadata.promptTokenCount, j.usageMetadata&&j.usageMetadata.candidatesTokenCount);
  return j.candidates[0].content.parts.map(p=>p.text||'').join('');
}
const CALL = { anthropic:callAnthropic, anthropic2:(p,m)=>callAnthropic(p,m,MODELS.anthropic2), openai:callOpenAI, gemini:callGemini };

function extractJSON(text){
  let t = text.trim().replace(/^```(json)?/i,'').replace(/```$/,'').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a<0||b<0) throw new Error('no json in model output');
  return JSON.parse(t.slice(a,b+1));
}

const CSS = `<style>
@page{size:A4}
*{box-sizing:border-box}
body{font-family:"Noto Sans CJK KR","Noto Serif CJK KR",sans-serif;color:#12222f;line-height:1.65;font-size:11pt;margin:0}
h1{color:#0A3D62;font-size:17pt;border-bottom:3px solid #1B6CA8;padding-bottom:8px;margin:0 0 4px}
h2{color:#1B6CA8;font-size:12.5pt;margin:18px 0 6px}
h3{font-size:11.5pt;margin:14px 0 4px}
p{margin:6px 0;word-break:keep-all;overflow-wrap:anywhere}
ul,ol{margin:6px 0 6px 18px}
.tag{color:#5A7890;font-size:9pt;margin-bottom:10px}
.q{border:1px solid #CFE2F0;border-radius:8px;padding:12px 14px;margin:12px 0;page-break-inside:avoid;overflow-wrap:anywhere}
.q .no{display:inline-block;background:#1B6CA8;color:#fff;font-size:9pt;border-radius:4px;padding:1px 8px;margin-bottom:6px}
.box{background:#EAF4FB;border-left:4px solid #3498DB;padding:8px 12px;margin:10px 0;overflow-wrap:anywhere}
.q .no.adv{background:#B8860B}
.q .no.killer{background:#7B241C}
.q .src{display:inline-block;background:#eef2f7;color:#345;font-size:8.5pt;border-radius:4px;padding:1px 7px;margin-left:6px}
.sol{margin:8px 0}
.step{margin:5px 0;padding:6px 10px 6px 12px;border-left:3px solid #1B6CA8;background:#F6FAFD;border-radius:0 6px 6px 0;overflow-wrap:anywhere}
.step>b,.step .s{color:#1B6CA8;font-weight:700;margin-right:5px}
.blk{margin:9px 0;padding:9px 12px;border-radius:6px;background:#F4F9FD;border:1px solid #E1EEF7;page-break-inside:avoid}
.blk .lb{display:inline-block;font-weight:700;color:#0A3D62;margin-right:6px}
.concept h3{color:#0A3D62;border-left:4px solid #1B6CA8;padding-left:8px}
svg{max-width:100%;height:auto;display:block;margin:10px auto}
.katex svg{margin:0;max-width:none;height:inherit}
table{border-collapse:collapse;width:100%;margin:8px 0}
th,td{border:1px solid #CFE2F0;padding:5px 8px;font-size:10.5pt;text-align:center;overflow-wrap:anywhere}
.foot{margin-top:22px;color:#5A7890;font-size:8.5pt;border-top:1px solid #D6E9F5;padding-top:8px}
b{color:#0A3D62}
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">`;

const KATEX_JS =
  '<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>' +
  '<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>' +
  '<script>window.addEventListener("load",function(){function done(){document.body.setAttribute("data-katex-done","1");}function render(){try{renderMathInElement(document.body,{delimiters:[{left:"$$",right:"$$",display:true},{left:"$",right:"$",display:false}],throwOnError:false});}catch(e){}setTimeout(done,180);}var fam=["KaTeX_Main","KaTeX_Math","KaTeX_Size1","KaTeX_Size2","KaTeX_Size3","KaTeX_Size4","KaTeX_AMS","KaTeX_Caligraphic","KaTeX_Fraktur","KaTeX_SansSerif","KaTeX_Script","KaTeX_Typewriter"];if(document.fonts&&document.fonts.load){var ps=[];fam.forEach(function(f){["16px ","italic 16px ","bold 16px "].forEach(function(w){ps.push(document.fonts.load(w+f).catch(function(){}));});});Promise.all(ps).then(function(){return (document.fonts.ready||Promise.resolve()).catch(function(){});}).then(render);}else{setTimeout(render,700);}});</script>';

const FOOT = `<div class="foot">너울(NEOUL) 무료 학습자료 · SKY 출신 교과 멘토 × AI 협업 출제<br>교육과정 성취기준 기반 새 창작(기출 지문·문항 미수록). 어떤 성적도 보장하지 않습니다. 학습 목적 제공·무단 상업적 재배포 금지.</div>`;
const CTA = '<div class="box" style="text-align:center;margin-top:16px"><b>이 자료가 도움이 됐다면</b> — 너울(NEOUL)은 5회독 누적복습·AI 맞춤 학습으로 이어집니다. 무료 자료 더 보기 → <b>neoulai.com</b></div>';
const page = (title, tag, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${CSS}</head><body><h1>${title}</h1><div class="tag">${tag}</div>${body}${CTA}${FOOT}${KATEX_JS}</body></html>`;

let BROWSER = null;
async function getBrowser(){ if(!BROWSER) BROWSER = await chromium.launch({ args:['--no-sandbox'] }); return BROWSER; }
async function htmlToPdf(html, outPdf){
  const b = await getBrowser();
  const pg = await b.newPage();
  try {
    await pg.setContent(html, { waitUntil:'networkidle', timeout:60000 });
    await pg.waitForFunction('document.body.getAttribute("data-katex-done")==="1"', { timeout:15000 }).catch(()=>{});
    await pg.pdf({ path: outPdf, format:'A4', printBackground:true, margin:{ top:'16mm', bottom:'16mm', left:'14mm', right:'14mm' } });
  } finally { await pg.close(); }
}

function fixStrayIneq(h){ return String(h).replace(/(\$\$[\s\S]*?\$\$|\$[^$]*?\$)|\\lt|\\gt|\\le|\\ge/g, function(m, math){ if(math) return math; return m==='\\lt'?'&lt;':m==='\\gt'?'&gt;':m==='\\le'?'≤':'≥'; }); }
// 짝 없는(홀수) $ 제거: 유효한 $$…$$ / $…$ 스팬은 보존하고 스팬 밖의 떠돌이 $만 삭제
function fixStrayDollar(h){ h=String(h); let out='', last=0, m; const re=/\$\$[\s\S]*?\$\$|\$[^$\n]{1,600}?\$/g; while((m=re.exec(h))){ out += h.slice(last,m.index).replace(/\$/g,''); out += m[0]; last=m.index+m[0].length; } out += h.slice(last).replace(/\$/g,''); return out; }
function balancedDollar(h){ const s=String(h).replace(/\$\$[\s\S]*?\$\$/g,'').replace(/\$[^$\n]{1,600}?\$/g,''); return s.indexOf('$')===-1; }
// 수식 스팬 안의 리터럴 <,> 를 \lt \gt 로 치환(HTML 파서가 <b… 를 태그로 오인해 KaTeX가 깨지는 것 방지). SVG 등 스팬 밖은 불변.
function fixMathAngle(h){ return String(h).replace(/\$\$[\s\S]*?\$\$|\$[^$\n]{1,600}?\$/g, function(m){ return m.replace(/</g,'\\lt ').replace(/>/g,'\\gt '); }); }
// ---- 커리큘럼 단원 선택(누적) ----
let CURRICULUM={}, COVERAGE={};
try{ CURRICULUM=JSON.parse(readFileSync(new URL('./curriculum.json', import.meta.url),'utf-8')); }catch(e){ console.log('curriculum load fail: '+String(e).slice(0,90)); }
try{ COVERAGE=JSON.parse(readFileSync('frontend/materials/_coverage.json','utf-8')); }catch(e){ try{ COVERAGE=JSON.parse(readFileSync('frontend/coverage.json','utf-8')); }catch(e2){ COVERAGE={}; } }
function pickUnit(cat, sub){
  const key=cat+'|'+sub; const units=CURRICULUM[key]||['1단원'];
  let next=units.find(u=>!(COVERAGE[key]||[]).includes(u));
  if(!next){ COVERAGE[key]=[]; next=units[0]; }
  return next;
}
const plan = RUN.map(s=>({cat:s.cat, sub:s.sub, unit:pickUnit(s.cat,s.sub)}));
console.log('생성 계획: '+plan.map(p=>p.sub+'/'+p.unit).join(', '));

// ---- QC(자가치유) ----
const CRIT=['rawLatex','modelName','brand','figMissing'];
function qcStatic(d){
  const html=[d.concept_html,d.problems_html,d.solutions_html].join(' ');
  const pr=d.problems_html||'';
  const flags=[];
  if(/\\\(|\\\[/.test(html)) flags.push('rawLatex');
  if(/gemini|openai|anthropic|claude|gpt-/i.test(html)) flags.push('modelName');
  if(/메가스터디|대성마이맥|시대인재|이투스|김태민/.test(html)) flags.push('brand');
  if(/그림|그래프|좌표|아래 그림|그림과 같이|다음 그림/.test(pr) && !/<svg/i.test(pr)) flags.push('figMissing');
  if(pr.replace(/<[^>]+>/g,'').replace(/\s/g,'').length < 120) flags.push('problemsShort');
  return flags;
}
const RETRY_NOTE='\n\n[재요청] 직전 출력에 결함이 있었다. 규칙 100% 준수: 모든 수식은 $ … $ / $$ … $$, 도형·그래프는 반드시 인라인 <svg>, 특정 AI 모델명·타사 브랜드·개인명 금지. 다시 출력하라.';
async function genData(s, unit, extra){
  for(const pv of FALLBACK){ if(!KEYS[pv]) continue;
    try{ return { data: extractJSON(await CALL[pv](PROMPT(s, unit)+(extra||''))), used:pv }; }
    catch(e){ console.log(` [${s.cat}] ${s.sub} ${pv} 실패: ${String(e).slice(0,100)}`); }
  }
  return null;
}
async function answerAudit(s, unit, data){
  if(!KEYS.anthropic) return null;
  const strip=(h)=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,3500);
  const prompt=`다음은 수능 ${s.cat}(${s.sub}) 「${unit}」 문제편과 해설편이다. 각 문항의 정답과 풀이가 문제와 논리적으로 일치하고 계산이 정확한지 점검하라. 오류가 있는 문항 번호와 한줄 사유만 JSON으로: {"issues":[{"no":정수,"why":"..."}]}. 문제 없으면 {"issues":[]}. 오직 JSON만.\n\n[문제편]\n${strip(data.problems_html)}\n\n[해설편]\n${strip(data.solutions_html)}`;
  try{ const j=extractJSON(await callAnthropic(prompt)); return Array.isArray(j.issues)? j.issues : []; }catch(e){ return null; }
}
const AUDIT = ONLY.length
  ? new Set(plan.map(s=>s.cat+'|'+s.sub))
  : (()=>{ const pool=plan.filter(s=>s.cat==='수학'||s.cat==='과탐'); for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];} return new Set(pool.slice(0,4).map(s=>s.cat+'|'+s.sub)); })();

function fnsafe(u){ return String(u).replace(/[\/\\?%*:|"<>·().,\s]+/g,'').slice(0,28); }
const items=[]; const qc=[];

async function callBest(prompt, maxTok, extra){
  for(const pv of FALLBACK){ if(!KEYS[pv]) continue;
    try{ return { data: extractJSON(await CALL[pv](prompt+(extra||''), maxTok)), used:pv }; }
    catch(e){ console.log('  math '+pv+' 실패: '+String(e).slice(0,90)); }
  }
  return null;
}
// 한 난이도 세트 생성+검수(API·정제만, 병렬 가능 — 공유 상태 미접근). 렌더링은 호출부에서 순차.
async function genTier(s, unit, diff){
  const r = await callBest(SET_G(s,unit,diff), 32000);
  if(!r) return { diff, fail:true };
  let pr=fixStrayIneq(fixMathAngle(r.data.problems_html||'')), sol=fixStrayIneq(fixMathAngle(r.data.solutions_html||''));
  let fixed=0;
  try{
    const v = await callBest(VERIFY_G(s,unit,diff,pr.slice(0,20000),sol.slice(0,42000)), 24000);
    const bad = (v && Array.isArray(v.data.bad)) ? v.data.bad : [];
    if(bad.length){
      const qParts=pr.split(/(?=<div class="q")/), sParts=sol.split(/(?=<div class="sol")/);
      const qBase=qParts.findIndex(p=>/^<div class="q"/.test(p)), sBase=sParts.findIndex(p=>/^<div class="sol"/.test(p));
      if(qBase>=0 && sBase>=0 && (qParts.length-qBase)===8 && (sParts.length-sBase)===8){
        for(const b of bad){
          const n=parseInt(b.no,10);
          const ph=fixStrayIneq(fixMathAngle(String(b.problem_html||''))), sh=fixStrayIneq(fixMathAngle(String(b.solution_html||'')));
          if(!(n>=1&&n<=8)) continue;
          if(!/class="q"/.test(ph) || !/class="sol"/.test(sh)) continue;
          if(!balancedDollar(ph) || !balancedDollar(sh)) continue;
          qParts[qBase+n-1]=ph.trim(); sParts[sBase+n-1]=sh.trim(); fixed++;
        }
        if(fixed){ pr=qParts.join(''); sol=sParts.join(''); }
      }
    }
  }catch(e){ console.log('  verify skip: '+String(e).slice(0,80)); }
  pr=fixStrayDollar(pr); sol=fixStrayDollar(sol);
  return { diff, pr, sol, fixed };
}
async function genUnit(s){
  const unit=s.unit, uf=fnsafe(unit);
  const tag=`${s.cat} · ${s.sub} · ${unit} · SKY 멘토 × AI 협업 출제`;
  const rc = await callBest(CONCEPT_G(s,unit), 16000);
  if(rc && typeof rc.data.concept_html==='string'){
    const body=fixStrayDollar(fixStrayIneq(fixMathAngle(rc.data.concept_html)));
    const file=`${s.cat}_${s.sub}_${uf}_개념요약.pdf`;
    try{ await htmlToPdf(page(`${s.cat} ${s.sub} · ${unit} · 개념요약`, tag, body), `${OUT}/${file}`);
      items.push({category:s.cat,subject:s.sub,unit,topic:String(rc.data.topic||unit).slice(0,40),type:'개념요약',file});
      console.log(` [${s.cat}]${s.sub}/${unit} 개념요약 PDF OK`);
    }catch(e){ console.log(` [${s.cat}]${s.sub} 개념요약 PDF 실패: ${String(e).slice(0,80)}`); }
    const kb=String(rc.data.concept_html).replace(/<[^>]+>/g,' ').replace(/&[a-z]+;/g,' ').replace(/\s+/g,' ').trim().slice(0,5000);
    if(kb) KBROWS.push({subject:s.cat,title:`${s.cat} ${s.sub} · ${unit} 개념`,content:kb});
  } else { console.log(` [${s.cat}]${s.sub}/${unit} 개념요약 생성 실패`); }
  // 기본/심화/킬러 3티어 동시(병렬) 생성 → 렌더링은 순차(공유 브라우저·배열 보호)
  const tiers = await Promise.all(['기본','심화','킬러'].map(diff => genTier(s, unit, diff)));
  for(const t of tiers){
    const du=`${unit} · ${t.diff}`, duf=fnsafe(du);
    if(t.fail){ console.log(` [${s.cat}]${s.sub}/${unit} ${t.diff} 생성 실패`); qc.push({subject:s.sub,category:s.cat,unit:du,status:'fail',flags:['noData']}); continue; }
    const pr=t.pr, sol=t.sol;
    if(t.fixed) console.log(` [${s.cat}]${s.sub}/${unit} ${t.diff} 불량 ${t.fixed}문항 교체`);
    const dtag=`${s.cat} · ${s.sub} · ${du} · SKY 멘토 × AI 협업 출제`;
    for(const d of [{type:'문제편',body:pr},{type:'해설편',body:sol}]){
      if(!d.body) continue; const file=`${s.cat}_${s.sub}_${duf}_${d.type}.pdf`;
      try{ await htmlToPdf(page(`${s.cat} ${s.sub} · ${du} · ${d.type}`, dtag, d.body), `${OUT}/${file}`);
        items.push({category:s.cat,subject:s.sub,unit:du,topic:`${unit} ${t.diff}`,type:d.type,file});
        console.log(` [${s.cat}]${s.sub}/${du} ${d.type} PDF OK`);
      }catch(e){ console.log(` [${s.cat}]${s.sub} ${du} ${d.type} PDF 실패: ${String(e).slice(0,80)}`); }
    }
    const flags=qcStatic({concept_html:'',problems_html:pr,solutions_html:sol});
    qc.push({subject:s.sub,category:s.cat,unit:du,topic:`${unit} ${t.diff}`,status: flags.length?'flagged':'ok', flags, fixed:t.fixed||0});
  }
  const key=s.cat+'|'+s.sub; COVERAGE[key]=Array.from(new Set([...(COVERAGE[key]||[]), unit]));
}

// 전 과목 동일 파이프라인: 개념요약 1 + 기본/심화/킬러 각 8문항(검수·교정 패스 + sanitizer)
for (const s of plan) {
  await genUnit(s);
}
if (BROWSER) await BROWSER.close();

// ---- 매니페스트 누적(단원키 병합) + 이번 주 무료 샘플 ----
let prev=[]; try{ prev=(JSON.parse(readFileSync(MANIFEST,'utf-8')).items)||[]; }catch(e){}
const runKeys=new Set(items.map(it=>it.category+'|'+it.subject+'|'+it.unit));
let merged = prev.filter(it=> it.unit && !runKeys.has(it.category+'|'+it.subject+'|'+it.unit)).concat(items);
merged.forEach(it=>{ delete it.sample; });
const samplePick = plan.find(s=>s.cat==='수학'||s.cat==='과탐') || plan[0];
const sampleKey = samplePick ? (samplePick.cat+'|'+samplePick.sub+'|'+samplePick.unit+' · 기본') : null;
if(sampleKey) merged.forEach(it=>{ if(it.category+'|'+it.subject+'|'+it.unit===sampleKey) it.sample=true; });
writeFileSync('frontend/tutor_kb.json', JSON.stringify({ updated:new Date().toISOString().slice(0,10), rows:KBROWS }, null, 2));
writeFileSync(MANIFEST, JSON.stringify({ updated:new Date().toISOString().slice(0,10), provenance:'SKY 멘토 × AI 협업 출제', sample:sampleKey, items:merged }, null, 2));
writeFileSync('frontend/materials/_coverage.json', JSON.stringify(COVERAGE, null, 2));

// ---- QC 리포트 ----
const critCount = qc.filter(q=>(q.flags||[]).some(f=>CRIT.includes(f))).length;
const answerFlagged = qc.filter(q=>Array.isArray(q.answerIssues)&&q.answerIssues.length>0).map(q=>q.subject+'/'+q.unit);
writeFileSync('frontend/qc_report.json', JSON.stringify({ generated:new Date().toISOString(), run: ONLY.length?('pilot:'+ONLY.join(',')):'full', sample:sampleKey, subjects_checked:qc.length, critical_flagged:critCount, answer_flagged:answerFlagged, subjects:qc }, null, 2));
console.log(`\n완료: PDF ${items.length}개 / 누적 ${merged.length}개 / QC critical ${critCount} · 정답이슈 ${answerFlagged.length} / 무료샘플 ${sampleKey}`);
if (items.length === 0) { console.error('생성 0개 — 실패로 종료'); process.exit(1); }
