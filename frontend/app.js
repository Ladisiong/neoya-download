/**
 * ============================================================================
 *  너야 — 교육자료 배포 시스템 프론트엔드 로직
 * ============================================================================
 *
 *  Copyright © 2026 김태민
 *  버전: 1.2.0 (v2.3 — 실시간 통계 제거 + QR코드 모바일 접속 추가)
 *
 *  배포 학습자료 운영 형태:
 *   - 사회탐구·과학탐구: 회차별 문제편 + 해설편 (2파일 1세트, O/X 선택형)
 *   - 한국사: 핵심용어 및 사건정리 단일 통합본
 *   - 경제이론요약집: 요약집 단일 통합본
 *
 *  모든 학습자료는 저작권자 김태민이 직접 출제·집필한 교육 저작물입니다.
 * ============================================================================
 */

// ✅ Apps Script 웹앱 URL — Vercel 사이트 정상 작동을 위해 실제 URL 입력
// (폴더 ID·시트 ID는 Code.gs에만 존재하며 깃허브에 노출되지 않음 — 가이드 7-4 보안 정책 부분 준수)
// 봇 트래픽이 의심되면 Apps Script doGet에 Referer 체크 등 추가 방어 가능
//
// ⚠️ URL 갱신 시 주의 (2026-04-29 갱신):
//   1. Apps Script 편집기 → 배포 → 배포 관리 → 활성 배포의 "웹 앱 URL"을 정확히 복사
//   2. 갱신 후 브라우저 Console에서 verifyApiUrl() 함수 자동 호출되어 URL 형식 검증
//   3. 잘못된 URL이면 console.error 출력 (네트워크 호출 전 미리 감지)
const API_URL = 'https://script.google.com/macros/s/AKfycbx30z-z93T4YYSgjwFSXdj5zb0x5PID5FZzO2Byj7gEjnszuWCp0PCyy0NnNb6x5kYWWA/exec';

// 과목 설정 (백엔드와 동일)
// format: 'session' = 회차별 운영 (문제편+해설편 2파일 1세트)
// format: 'summary' = 단일 통합본 (요약집·정리본 형태, 문제·정답 분리 없음)
const SUBJECTS = {
  korean_geography:   { name: '한국지리',     category: '사회탐구', format: 'session' },
  politics_law:       { name: '정치와법',     category: '사회탐구', format: 'session' },
  ethics_thought:     { name: '윤리와사상',   category: '사회탐구', format: 'session' },
  world_geography:    { name: '세계지리',     category: '사회탐구', format: 'session' },
  world_history:      { name: '세계사',       category: '사회탐구', format: 'session' },
  life_ethics:        { name: '생활과윤리',   category: '사회탐구', format: 'session' },
  social_culture:     { name: '사회문화',     category: '사회탐구', format: 'session' },
  east_asian_history: { name: '동아시아사',   category: '사회탐구', format: 'session' },
  economics_social:   { name: '경제',         category: '사회탐구', format: 'session' },
  chemistry1:         { name: '화학1',        category: '과학탐구', format: 'session' },
  earth_science1:     { name: '지구과학1',    category: '과학탐구', format: 'session' },
  biology1:           { name: '생명과학1',    category: '과학탐구', format: 'session' },
  physics1:           { name: '물리학1',      category: '과학탐구', format: 'session' },
  chemistry2:         { name: '화학2',        category: '과학탐구', format: 'session' },
  earth_science2:     { name: '지구과학2',    category: '과학탐구', format: 'session' },
  biology2:           { name: '생명과학2',    category: '과학탐구', format: 'session' },
  physics2:           { name: '물리학2',      category: '과학탐구', format: 'session' },
  korean_history:     { name: '한국사',       category: '기타',     format: 'summary' },
  economic_theory:    { name: '경제이론요약집', category: '기타',  format: 'summary' }
};

let fileData = {};
let currentCategory = 'all';

document.addEventListener('DOMContentLoaded', () => {
  console.log('🌊 너야 시스템 시작 (v2.8 브랜드 교체)');
  console.log('📜 저작권자: 김태민');
  console.log('📚 학습자료: 김태민 본인 출제 교육 저작물');
  verifyApiUrl();                // 🆕 v2.7: API_URL 형식 자가 검증 (네트워크 호출 전 미리 감지)
  generateQRCode();              // ✅ QR 코드 우선 생성 (네트워크 무관, 즉시 렌더)
  initEmptyData();
  startLoadingTimeout();         // ✅ 10초 타임아웃 안전장치 시작
  loadFileList();
  setupCategoryTabs();
});

/**
 * 🆕 v2.7: API_URL 형식 자가 검증
 * 네트워크 호출 전 URL의 기본 형식만 확인 (실제 응답 확인은 loadFileList에서)
 * 잘못된 URL이면 console.error로 즉시 알림 (10초 기다리지 않고 미리 감지)
 */
function verifyApiUrl() {
  const isValid = (
    typeof API_URL === 'string' &&
    API_URL.startsWith('https://script.google.com/macros/s/') &&
    API_URL.endsWith('/exec') &&
    API_URL.length > 80 &&  // 일반적인 Apps Script 배포 URL은 100자 이상
    API_URL !== 'YOUR_APPS_SCRIPT_WEBAPP_URL'
  );
  if (!isValid) {
    console.error('❌ API_URL 형식 오류 — Apps Script 배포 URL을 확인하세요:', API_URL);
    return false;
  }
  console.log('✅ API_URL 형식 정상');
  return true;
}

/**
 * QR 코드 생성 — 모바일 접속용
 * qrcode.js (CDN) 라이브러리 사용. 라이브러리 로드 실패 시 fallback 메시지 표시.
 */
function generateQRCode() {
  const container = document.getElementById('qr-code-box');
  if (!container) return;

  const TARGET_URL = 'https://neoya-download.vercel.app/';

  // qrcode.js 로드 여부 검사
  if (typeof QRCode === 'undefined') {
    console.warn('⚠️ qrcode.js CDN 로드 실패 — fallback 표시');
    container.innerHTML = `
      <div style="text-align:center; padding:16px; color:var(--neoya-text-secondary); font-size:0.85rem;">
        QR 코드를 불러오지 못했습니다.<br>
        직접 접속: <strong>neoya-download.vercel.app</strong>
      </div>
    `;
    return;
  }

  try {
    // 기존 자식 노드 제거 (이중 생성 방지)
    container.innerHTML = '';
    new QRCode(container, {
      text: TARGET_URL,
      width: 196,
      height: 196,
      colorDark: '#1A3A5C',     // SSoT 토큰 --neoya-primary-deep 과 동일 값
      colorLight: '#FFFFFF',    // SSoT 토큰 --neoya-white 와 동일 값
      correctLevel: QRCode.CorrectLevel.H  // 고에러정정 (모바일 카메라 인식 안정성)
    });
    console.log('✅ QR 코드 생성 완료:', TARGET_URL);
  } catch (err) {
    console.error('QR 코드 생성 오류:', err);
    container.innerHTML = `
      <div style="text-align:center; padding:16px; color:var(--neoya-text-secondary); font-size:0.85rem;">
        QR 생성 오류<br>직접 접속: neoya-download.vercel.app
      </div>
    `;
  }
}

/**
 * 10초 타임아웃 안전장치
 * Apps Script 응답이 10초 이상 지연될 경우, 무한 로딩 화면을 강제 해제하고
 * 사용자에게 안내 메시지를 표시한다. (loadFileList 성공 시 clearTimeout으로 취소됨)
 */
let loadingTimeoutId = null;
function startLoadingTimeout() {
  loadingTimeoutId = setTimeout(() => {
    console.warn('⚠️ Apps Script 응답 10초 초과 — 로딩 강제 해제');
    hideLoadingIndicator();
    const msg = document.getElementById('loading-timeout-msg');
    const indicator = document.getElementById('loading-indicator');
    if (msg && indicator) {
      // 인디케이터를 다시 보이되 타임아웃 메시지를 띄움
      indicator.classList.remove('hidden');
      msg.style.display = 'block';
    }
  }, 10000); // 10초
}

function initEmptyData() {
  // 빈 데이터로 초기화 — 모든 과목 카드를 "준비 중" 상태로 먼저 표시
  // 실제 데이터는 loadFileList()가 비동기로 받아와서 덮어씀 (깜빡임 없음)
  fileData = {};
  Object.keys(SUBJECTS).forEach(key => {
    fileData[key] = { problems: [], answers: [] };
  });
  renderSubjects();
}

async function loadFileList() {
  if (API_URL === 'YOUR_APPS_SCRIPT_WEBAPP_URL') {
    console.warn('⚠️ API_URL 미설정 — 데모 데이터 사용 중');
    if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
    hideLoadingIndicator();
    return;
  }

  // JSONP 호출 방식 — Apps Script의 cross-origin 302 리다이렉트를 우회
  // Google Apps Script는 fetch 시 script.googleusercontent.com으로 리다이렉트되어
  // 브라우저 fetch가 차단됨. JSONP는 <script> 태그 로드 방식이라 리다이렉트 자동 따라감.
  return new Promise((resolve) => {
    const callbackName = 'neoyaCb_' + Date.now();
    const script = document.createElement('script');

    // 안전장치: 응답 처리 후 정리
    const cleanup = () => {
      if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
      hideLoadingIndicator();
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
      resolve();
    };

    // Apps Script가 호출할 콜백 함수 정의
    window[callbackName] = function(result) {
      try {
        if (result && result.success) {
          fileData = result.files;
          renderSubjects();
          console.log('✅ 학습자료 목록 로드 완료:', result.files.length, '과목');
        } else {
          console.warn('Apps Script 응답: success=false', result);
        }
      } catch (err) {
        console.error('JSONP 응답 처리 오류:', err);
      } finally {
        cleanup();
      }
    };

    // 네트워크 오류 처리
    script.onerror = function() {
      console.error('파일 목록 로드 실패: JSONP 스크립트 로드 오류');
      cleanup();
    };

    // JSONP 호출 시작
    script.src = `${API_URL}?action=getFileList&callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

function hideLoadingIndicator() {
  const el = document.getElementById('loading-indicator');
  if (el) el.classList.add('hidden');
}

function renderSubjects() {
  const grid = document.getElementById('subject-grid');
  if (!grid) return;
  grid.innerHTML = '';

  Object.keys(SUBJECTS).forEach(key => {
    const subject = SUBJECTS[key];
    if (currentCategory !== 'all' && subject.category !== currentCategory) return;

    const data = fileData[key] || { problems: [], answers: [] };
    const totalFiles = data.problems.length + data.answers.length;
    const isEmpty = totalFiles === 0;
    const isSummary = subject.format === 'summary';

    // 운영 형태별 카운트 배지 분기
    let countsHTML;
    if (isSummary) {
      // 한국사·경제이론요약집 — 단일 통합본 (요약집 형태)
      // 백엔드 Code.gs는 요약집을 problems 배열에 담아서 응답 → 그 개수를 요약집 수로 표시
      countsHTML = `<span class="count-badge summary">📚 요약집 ${data.problems.length}</span>`;
    } else {
      // 사회탐구·과학탐구 — 회차별 (문제편+해설편 2파일 1세트)
      countsHTML = `
        <span class="count-badge">📝 문제 ${data.problems.length}</span>
        <span class="count-badge">✅ 정답 ${data.answers.length}</span>
      `;
    }

    // 파일 목록 또는 "준비 중" 메시지
    let listHTML;
    if (isEmpty) {
      listHTML = `<p class="empty-msg">자료 준비 중입니다.</p>`;
    } else if (isSummary) {
      listHTML = renderFileItems(data.problems, subject.name, 'summary');
    } else {
      listHTML = renderFileItems(data.problems, subject.name, 'problem')
               + renderFileItems(data.answers, subject.name, 'answer');
    }

    const card = document.createElement('div');
    card.className = isEmpty ? 'subject-card empty' : 'subject-card';
    card.innerHTML = `
      <h3 class="subject-title">${subject.name}</h3>
      <div class="subject-counts">
        ${countsHTML}
      </div>
      <div class="file-list">
        ${listHTML}
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderFileItems(files, subjectName, type) {
  if (!files || files.length === 0) return '';
  return files.map(file => `
    <div class="file-item">
      <span>${file.displayName} <small style="color: var(--neoya-text-secondary);">(${file.size || '-'})</small></span>
      <button class="download-btn" onclick="downloadFile('${file.id}', '${file.displayName}', '${subjectName}', '${type}')">
        📥 다운로드
      </button>
    </div>
  `).join('');
}

function setupCategoryTabs() {
  const tabs = document.querySelectorAll('.category-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentCategory = tab.dataset.category;
      renderSubjects();
    });
  });
}

async function downloadFile(fileId, fileName, category, type) {
  console.log(`[너야] 다운로드 시작: ${fileName}`);

  if (fileId.startsWith('demo-')) {
    alert(`🌊 너야 데모 버전입니다.\n\n실제 자료는 Apps Script 배포 후 제공됩니다.\n\n저작권자: 김태민\n학습자료: 김태민 본인 출제`);
    return;
  }

  try {
    // 🆕 v2.7: POST fetch → JSONP GET 전환 (CORS 정책 100% 우회)
    // Apps Script는 OPTIONS preflight를 처리하지 않아 'Content-Type: application/json'
    // 헤더가 있는 fetch POST를 차단함. JSONP는 <script> 태그 동적 삽입 방식이라
    // 브라우저 same-origin 정책 우회 + Apps Script의 jsonpResponse() 함수와 호환.
    // 단점: URL 길이 한도(2000자) — referrer는 200자로 절단해 안전 확보
    await recordDownloadViaJsonp({
      timestamp: new Date().toISOString(),
      fileName, fileId, category, type,
      userAgent: navigator.userAgent.substring(0, 200),
      referrer: (document.referrer || '').substring(0, 200)
    });
  } catch (err) {
    console.warn('로그 기록 실패 (다운로드는 계속 진행):', err);
  }

  window.open(`https://drive.google.com/uc?export=download&id=${fileId}`, '_blank');
}

/**
 * JSONP 방식으로 다운로드 로그 기록 (CORS 우회)
 * @param {Object} data - 로그 데이터 (timestamp, fileName, fileId, category, type, userAgent, referrer)
 * @returns {Promise<void>} 5초 타임아웃 또는 응답 도달 시 resolve
 */
function recordDownloadViaJsonp(data) {
  return new Promise((resolve) => {
    const callbackName = `_neoyaCb_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const params = new URLSearchParams({
      action: 'recordDownload',
      data: JSON.stringify(data),
      callback: callbackName
    });
    const script = document.createElement('script');
    const timer = setTimeout(() => cleanup(), 5000);  // 5초 타임아웃 (다운로드 흐름 차단 방지)

    function cleanup() {
      clearTimeout(timer);
      try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
      resolve();
    }

    window[callbackName] = function(_response) { cleanup(); };
    script.onerror = cleanup;
    script.src = `${API_URL}?${params.toString()}`;
    document.head.appendChild(script);
  });
}
