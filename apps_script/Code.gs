/**
 * ============================================================================
 *  너야 — 교육자료 배포 시스템
 * ============================================================================
 *
 *  프로젝트명    : 너야
 *  용도         : 교육용 소프트웨어 · 교육자료 배포업
 *  저작권자      : 김태민
 *  상표 출원인    : 김태민
 *  상표 출원번호  : 40-2026-0081306, 40-2026-0081307 (지정상품 9류 / 지정서비스 41류)
 *  상표 표장     : 너야 (국문 문자 상표)
 *  버전         : 1.1.0 (v2.2 정합화)
 *  최초 공개일    : 2026-04-24
 *  라이선스      : © 2026 김태민. All rights reserved.
 *
 *  본 소프트웨어는 대한민국 저작권법에 의해 보호되는 김태민 개인의 저작물이며,
 *  '너야' 상표로 교육자료 배포 서비스에 실제 사용되고 있음.
 *
 * ============================================================================
 *  학습자료 운영 형태 (출원인 단독 창작 입증)
 * ============================================================================
 *
 *  본 시스템이 배포하는 모든 학습자료는 저작권자 김태민이 직접 출제·집필한
 *  수능 대비 교육 저작물이며, 다음과 같은 형태로 운영됩니다.
 *
 *  1) 사회탐구·과학탐구 (회차별 운영)
 *     - 1회차당 문제편 PDF + 해설편 PDF = 2개 파일 1세트
 *     - 폴더 구조: [과목]/문제집/ (문제편) + [과목]/정답지/ (해설편)
 *     - 모든 문제는 O/X 선택형 (기본 40% + 응용 40% + 고난도 20%)
 *     - 출제 범위: 2015 개정 교육과정 + EBS 수능특강·수능완성 100% 연계
 *
 *  2) 한국사 (단일 통합본)
 *     - 핵심용어 및 사건정리 통합본 1개 파일 (회차·해설 분리 없음)
 *     - 파일명: 너야_한국사_핵심용어및사건정리.pdf
 *     - 폴더 구조: 기타/한국사/ 직접 파일 구조
 *
 *  3) 경제이론요약집 (단일 통합본)
 *     - 요약집 형태 1개 파일 (회차·해설 분리 없음)
 *     - 폴더 구조: 기타/경제이론요약집/ 직접 파일 구조
 *
 *  본 getFileList() 함수는 위 두 가지 폴더 구조(분리·직접 파일)를 모두 자동 인식하며,
 *  problems 배열(문제집)과 answers 배열(정답지)을 분리 응답합니다.
 * ============================================================================
 */

// ========================================
// 설정 및 구성
// ========================================

// ⚠️ D-3 작업 시 본인의 실제 ID로 교체 필수.
// 깃허브 공개 코드에는 플레이스홀더 상태로만 푸시하고,
// Apps Script 편집기에서만 실제 값을 사용하세요. (보안 가이드라인)
const FOLDER_ID = '1WqHImkxvkozJnnZnJi9T0vsFkLsUrvjb'; // 너야 전용 구글 드라이브 폴더 ID
const SPREADSHEET_ID = '1uy96xvIUH9xroouvnYG_Rj3TNx8dnjPrGjwsGbQVMJg'; // 너야 다운로드 로그 시트 ID
const BRAND_NAME = '너야';
const COPYRIGHT_HOLDER = '김태민';
const TRADEMARK_APPLICATION = '40-2026-0081306, 40-2026-0081307';

// 과목별 설정 (너야 학습자료 체계 - 김태민 본인 출제)
const SUBJECTS = {
  // 사회탐구
  korean_geography: { name: '한국지리', category: '사회탐구' },
  politics_law: { name: '정치와법', category: '사회탐구' },
  ethics_thought: { name: '윤리와사상', category: '사회탐구' },
  world_geography: { name: '세계지리', category: '사회탐구' },
  world_history: { name: '세계사', category: '사회탐구' },
  life_ethics: { name: '생활과윤리', category: '사회탐구' },
  social_culture: { name: '사회문화', category: '사회탐구' },
  east_asian_history: { name: '동아시아사', category: '사회탐구' },
  economics_social: { name: '경제', category: '사회탐구' },

  // 과학탐구
  chemistry1: { name: '화학1', category: '과학탐구' },
  earth_science1: { name: '지구과학1', category: '과학탐구' },
  biology1: { name: '생명과학1', category: '과학탐구' },
  physics1: { name: '물리학1', category: '과학탐구' },
  chemistry2: { name: '화학2', category: '과학탐구' },
  earth_science2: { name: '지구과학2', category: '과학탐구' },
  biology2: { name: '생명과학2', category: '과학탐구' },
  physics2: { name: '물리학2', category: '과학탐구' },

  // 기타
  korean_history: { name: '한국사', category: '기타' },
  economic_theory: { name: '경제이론요약집', category: '기타' }
};

// ========================================
// 웹앱 메인 엔트리 포인트
// ========================================

/**
 * 웹앱 메인 GET 엔트리 포인트
 *
 * 호출 경로 2가지:
 *  1. HTTP 요청 (정상): ?action=getFileList → e 객체 자동 주입 (e.parameter.action 정상 접근)
 *  2. 편집기 수동 실행 (▶ 실행 버튼): e 매개변수 undefined → 방어 코드로 안전 처리
 *
 * @param {Object} [e] - HTTP 이벤트 객체 (수동 실행 시 undefined 가능)
 * @returns {TextOutput} JSON 또는 JSONP 응답
 */
function doGet(e) {
  // 방어 코드: 편집기 수동 실행 시 e가 undefined인 경우 안전한 기본값 주입
  const params = (e && e.parameter) ? e.parameter : {};
  const action = params.action || 'getBrandInfo';  // 기본 액션: 상표 증거 엔드포인트
  const callback = params.callback;  // JSONP 콜백 (CORS 우회용 옵션)
  try {
    let payload;
    switch (action) {
      case 'getFileList':
        payload = getFileList();
        break;
      case 'getStats':
        payload = getDownloadStats();
        break;
      case 'getBrandInfo':
        payload = getBrandInfo();
        break;
      case 'recordDownload':
        // 🆕 v2.7: JSONP GET 방식 지원 (CORS 우회용)
        // 프론트엔드에서 ?action=recordDownload&data=<JSON>&callback=<cbName> 형식으로 호출
        try {
          const downloadData = params.data ? JSON.parse(params.data) : {};
          recordDownload(downloadData);
          payload = { success: true };
        } catch (parseError) {
          payload = { error: 'Invalid data format: ' + parseError.toString() };
        }
        break;
      default:
        payload = { error: 'Invalid action' };
    }
    return callback ? jsonpResponse(payload, callback) : jsonResponse(payload);
  } catch (error) {
    console.error('doGet 오류:', error);
    const errPayload = { error: error.toString() };
    return callback ? jsonpResponse(errPayload, callback) : jsonResponse(errPayload);
  }
}

/**
 * 웹앱 메인 POST 엔트리 포인트
 *
 * @param {Object} [e] - HTTP 이벤트 객체 (수동 실행 시 undefined 가능)
 * @returns {TextOutput} JSON 응답
 */
function doPost(e) {
  try {
    // 방어 코드: 편집기 수동 실행 시 e 또는 e.postData가 undefined인 경우
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ error: 'POST 데이터가 없습니다 (편집기 수동 실행 시 정상)' });
    }
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'recordDownload') {
      recordDownload(data.data);
      return jsonResponse({ success: true });
    }
    return jsonResponse({ error: 'Invalid action' });
  } catch (error) {
    console.error('doPost 오류:', error);
    return jsonResponse({ error: error.toString() });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * JSONP 응답 — CORS 우회용 폴백
 * Apps Script ContentService는 setHeader()를 지원하지 않으므로,
 * 일부 브라우저 확장이 CORS를 차단할 때를 대비해 JSONP 콜백 응답을 제공한다.
 * 사용법: GET ?action=getFileList&callback=myFunc → myFunc({...JSON...})
 */
function jsonpResponse(obj, callback) {
  // 콜백 이름 검증 (XSS 방어 — 영숫자·언더스코어·점만 허용)
  const safeCallback = String(callback).replace(/[^a-zA-Z0-9_.]/g, '');
  if (!safeCallback) {
    return jsonResponse({ error: 'Invalid callback name' });
  }
  return ContentService
    .createTextOutput(safeCallback + '(' + JSON.stringify(obj) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/**
 * 브랜드 정보 반환 (상표 사용 증거용)
 * 이 엔드포인트는 '너야' 국문 상표가 교육용 소프트웨어에
 * 실제 사용되고 있음을 확인할 수 있는 상표 증거 엔드포인트입니다.
 */
function getBrandInfo() {
  return {
    brand: BRAND_NAME,
    copyright_holder: COPYRIGHT_HOLDER,
    trademark_application: TRADEMARK_APPLICATION,
    trademark_type: '국문 문자 상표',
    service_category: '교육용 소프트웨어 · 교육자료 배포업',
    nice_classes: ['9류 - 교육용 소프트웨어', '41류 - 교육자료 배포업'],
    launched_at: '2026-04-24',
    content_origin: '김태민 본인 출제·집필 수능 대비 학습자료',
    content_format: {
      social_science: '회차별 문제편 + 해설편 (2파일 1세트, O/X 선택형)',
      natural_science: '회차별 문제편 + 해설편 (2파일 1세트, O/X 선택형)',
      korean_history: '핵심용어 및 사건정리 단일 통합본',
      economic_theory: '요약집 단일 통합본'
    },
    folder_structure: {
      problems_separated: '[과목]/문제집/ + [과목]/정답지/ (사회탐구·과학탐구)',
      direct_files: '[과목]/ (한국사·경제이론요약집)'
    },
    description: '너야는 대한민국 고등학생·재수생을 위한 수능 학습자료 배포 시스템이며, 배포되는 모든 문제집·해설·요약집은 저작권자 김태민이 직접 출제·집필한 교육 저작물입니다.'
  };
}

// ========================================
// 파일 목록 관리 (혼합 구조 지원)
// ========================================

function getFileList() {
  // ⚡ 캐시 조회 — 캐시 히트 시 즉시 반환 (응답 7초 → 1초 이내)
  const cache = CacheService.getScriptCache();
  const cached = cache.get('neoya_fileList_v1');
  if (cached) {
    console.log(`⚡ [${BRAND_NAME}] 캐시 히트 — 즉시 응답`);
    return JSON.parse(cached);
  }

  try {
    const mainFolder = DriveApp.getFolderById(FOLDER_ID);
    const fileList = {};
    let lastUpdated = new Date(0);

    console.log(`📁 [${BRAND_NAME}] 파일 목록 조회 시작 (캐시 미스 — Drive 순회)...`);

    Object.keys(SUBJECTS).forEach(subjectKey => {
      const subjectConfig = SUBJECTS[subjectKey];
      fileList[subjectKey] = { problems: [], answers: [] };

      try {
        const categoryFolders = mainFolder.getFoldersByName(subjectConfig.category);
        if (!categoryFolders.hasNext()) return;

        const categoryFolder = categoryFolders.next();
        const subjectFolders = categoryFolder.getFoldersByName(subjectConfig.name);
        if (!subjectFolders.hasNext()) return;

        const subjectFolder = subjectFolders.next();
        const directFiles = subjectFolder.getFiles();
        let hasDirectFiles = false;

        while (directFiles.hasNext()) {
          const file = directFiles.next();
          hasDirectFiles = true;
          fileList[subjectKey].problems.push(buildFileInfo(file));
          if (file.getLastUpdated() > lastUpdated) lastUpdated = file.getLastUpdated();
        }

        if (hasDirectFiles) return;

        const problemFolders = subjectFolder.getFoldersByName('문제집');
        if (problemFolders.hasNext()) {
          const problemFolder = problemFolders.next();
          const problemFiles = problemFolder.getFiles();
          while (problemFiles.hasNext()) {
            const file = problemFiles.next();
            fileList[subjectKey].problems.push(buildFileInfo(file));
            if (file.getLastUpdated() > lastUpdated) lastUpdated = file.getLastUpdated();
          }
        }

        const answerFolders = subjectFolder.getFoldersByName('정답지');
        if (answerFolders.hasNext()) {
          const answerFolder = answerFolders.next();
          const answerFiles = answerFolder.getFiles();
          while (answerFiles.hasNext()) {
            const file = answerFiles.next();
            fileList[subjectKey].answers.push(buildFileInfo(file));
            if (file.getLastUpdated() > lastUpdated) lastUpdated = file.getLastUpdated();
          }
        }
      } catch (subjectError) {
        console.error(`❌ ${subjectConfig.name} 처리 중 오류:`, subjectError);
      }
    });

    let totalFiles = 0;
    Object.keys(fileList).forEach(subject => {
      totalFiles += fileList[subject].problems.length + fileList[subject].answers.length;
    });

    const response = {
      success: true,
      brand: BRAND_NAME,
      owner: COPYRIGHT_HOLDER,
      trademark: TRADEMARK_APPLICATION,
      content_notice: '본 자료는 김태민이 직접 출제·집필한 교육 저작물입니다.',
      files: fileList,
      lastUpdated: lastUpdated.toISOString(),
      timestamp: new Date().toISOString(),
      totalFiles
    };

    // ⚡ 캐시 저장 (10분 = 600초) — 다음 요청부터 1초 이내 응답
    cache.put('neoya_fileList_v1', JSON.stringify(response), 600);
    console.log(`💾 [${BRAND_NAME}] 응답 캐싱 완료 (10분 유효)`);

    return response;
  } catch (error) {
    console.error('❌ 파일 목록 조회 오류:', error);
    return { success: false, error: error.toString(), files: {}, totalFiles: 0 };
  }
}

function buildFileInfo(file) {
  return {
    id: file.getId(),
    name: file.getName(),
    displayName: file.getName().replace(/\.[^/.]+$/, ''),
    size: formatFileSize(file.getSize()),
    lastModified: file.getLastUpdated().toISOString(),
    downloadUrl: file.getDownloadUrl(),
    metadata: extractMetadata(file.getName())
  };
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function extractMetadata(fileName) {
  const metadata = {};
  const problemMatch = fileName.match(/(\d+)[문항제]/);
  if (problemMatch) metadata.problemCount = parseInt(problemMatch[1]);
  const roundMatch = fileName.match(/(\d+)회/);
  if (roundMatch) metadata.round = parseInt(roundMatch[1]);
  const yearMatch = fileName.match(/(\d{4})년/);
  if (yearMatch) metadata.year = parseInt(yearMatch[1]);
  const monthMatch = fileName.match(/(\d{1,2})월/);
  if (monthMatch) metadata.month = parseInt(monthMatch[1]);
  return metadata;
}

// ========================================
// 다운로드 로그
// ========================================

function recordDownload(downloadData) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, 10).setValues([[
        '다운로드 시간', '브랜드', '파일명', '파일ID', '과목',
        '유형', 'IP주소', '브라우저', '리퍼러', '다운로드 URL'
      ]]);
      const headerRange = sheet.getRange(1, 1, 1, 10);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#0A3D62');
      headerRange.setFontColor('white');
    }
    sheet.appendRow([
      new Date(downloadData.timestamp),
      BRAND_NAME,
      downloadData.fileName,
      downloadData.fileId,
      downloadData.category,
      downloadData.type,
      downloadData.ip || 'Unknown',
      downloadData.userAgent || 'Unknown',
      downloadData.referrer || 'Direct',
      `https://drive.google.com/uc?export=download&id=${downloadData.fileId}`
    ]);
    console.log(`✅ [${BRAND_NAME}] 다운로드 기록: ${downloadData.fileName}`);

    // ⚡ 다운로드 기록 시 stats 캐시 즉시 무효화 (다음 호출에 최신 통계 반영)
    CacheService.getScriptCache().remove('neoya_stats_v1');
  } catch (error) {
    console.error('❌ 다운로드 기록 저장 오류:', error);
  }
}

// ========================================
// 캐시 관리 — 새 학습자료 업로드 후 즉시 반영하려면 이 함수를 Apps Script에서 직접 실행
// ========================================
function clearCache() {
  const cache = CacheService.getScriptCache();
  cache.remove('neoya_fileList_v1');
  cache.remove('neoya_stats_v1');
  console.log(`🔄 [${BRAND_NAME}] 캐시 강제 초기화 완료 — 다음 호출 시 Drive에서 새로 조회`);
  return { success: true, message: '캐시 초기화 완료' };
}

function getDownloadStats() {
  // ⚡ 캐시 조회 (1분 짧은 캐시 — 통계는 비교적 자주 갱신)
  const cache = CacheService.getScriptCache();
  const cached = cache.get('neoya_stats_v1');
  if (cached) return JSON.parse(cached);

  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      const empty = { totalDownloads: 0, todayDownloads: 0, thisWeekDownloads: 0, thisMonthDownloads: 0 };
      cache.put('neoya_stats_v1', JSON.stringify(empty), 60);
      return empty;
    }
    const totalDownloads = lastRow - 1;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    let todayDownloads = 0, thisWeekDownloads = 0, thisMonthDownloads = 0;

    data.forEach(row => {
      const downloadDate = new Date(row[0]);
      if (downloadDate >= todayStart) todayDownloads++;
      if (downloadDate >= weekStart) thisWeekDownloads++;
      if (downloadDate >= monthStart) thisMonthDownloads++;
    });

    const response = {
      brand: BRAND_NAME,
      totalDownloads, todayDownloads, thisWeekDownloads, thisMonthDownloads,
      timestamp: new Date().toISOString()
    };

    // ⚡ 캐시 저장 (60초 = 1분)
    cache.put('neoya_stats_v1', JSON.stringify(response), 60);
    return response;
  } catch (error) {
    console.error('❌ 통계 조회 오류:', error);
    return { totalDownloads: 0 };
  }
}

// ========================================
// 개발자 도구
// ========================================

function testGetFileList() {
  console.log(`🧪 [${BRAND_NAME}] 파일 목록 테스트 시작...`);
  const result = getFileList();
  console.log(`📋 성공: ${result.success}, 총 파일: ${result.totalFiles}`);
  return result;
}

function testGetBrandInfo() {
  console.log(`🧪 [${BRAND_NAME}] 브랜드 정보 테스트...`);
  const info = getBrandInfo();
  console.log(JSON.stringify(info, null, 2));
  return info;
}

/**
 * doGet 함수 안전 테스트용 함수
 * 편집기에서 ▶ 실행하면 모의 e 객체를 주입하여 doGet을 안전하게 호출
 * 실제 HTTP 요청과 동일한 응답 검증 가능 (상표 증거 수집 시나리오 대응)
 */
function testDoGet() {
  console.log(`🧪 [${BRAND_NAME}] doGet 테스트 시작...`);
  // 모의 HTTP 이벤트 객체 (실제 HTTP 요청과 동일 구조)
  const mockEvent = {
    parameter: { action: 'getBrandInfo' }
  };
  const result = doGet(mockEvent);
  console.log(`✅ doGet 정상 응답: ${result.getContent()}`);
  return result;
}

/**
 * doPost 함수 안전 테스트용 함수
 */
function testDoPost() {
  console.log(`🧪 [${BRAND_NAME}] doPost 테스트 시작...`);
  // 모의 HTTP POST 이벤트 객체
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: 'recordDownload',
        data: { fileId: 'test-id', fileName: 'test.pdf', userAgent: 'TestRunner' }
      })
    }
  };
  const result = doPost(mockEvent);
  console.log(`✅ doPost 정상 응답: ${result.getContent()}`);
  return result;
}

function checkSystemStatus() {
  console.log(`🔍 [${BRAND_NAME}] 시스템 상태 확인...`);
  try {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    console.log(`✅ 드라이브 폴더: ${folder.getName()}`);
  } catch (error) {
    console.error(`❌ 드라이브 접근 실패: ${error}`);
    return false;
  }
  testGetFileList();
  testGetBrandInfo();
  testDoGet();   // 🆕 doGet HTTP 엔드포인트 안전 테스트
  console.log(`🎉 [${BRAND_NAME}] 시스템 정상 작동`);
  return true;
}

console.log(`🌊 ${BRAND_NAME} 교육자료 배포 시스템 로드 완료`);
console.log(`   저작권자: ${COPYRIGHT_HOLDER} · 상표 출원번호: ${TRADEMARK_APPLICATION}`);
console.log(`   학습자료: 김태민 본인 출제 교육 저작물`);
