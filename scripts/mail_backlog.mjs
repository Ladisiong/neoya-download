/**
 * NEOYA 본사 OS — 메일 → 할일 백로그 워커 (5분 무인)
 * 3계정(개인 Gmail·회사 Workspace·네이버) IMAP fetch → 8카테고리 분류 →
 * 액션 필요한 메일만(gov·neoya·fin·legal·edu·sec) Supabase os_backlog upsert.
 * dedup=message-id(thread_id unique, ON CONFLICT DO NOTHING → 재등록·완료상태 보존).
 * 본문 미저장(subject·sender·category·priority만) — 개인정보 최소수집.
 */
import { ImapFlow } from 'imapflow';

const SUPA_URL = process.env.SUPABASE_URL || 'https://iwrblahmszuthemfrhmy.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPA_KEY) { console.log('SKIP: SUPABASE_SERVICE_KEY not set yet (add repo secrets to activate).'); process.exit(0); }

const ACCOUNTS = [
  { name: '개인',  user: process.env.MAIL_PERSONAL_USER, pass: process.env.MAIL_PERSONAL_PASS, host: 'imap.gmail.com' },
  { name: '회사',  user: process.env.MAIL_COMPANY_USER,  pass: process.env.MAIL_COMPANY_PASS,  host: 'imap.gmail.com' },
  { name: '네이버', user: process.env.MAIL_NAVER_USER,    pass: process.env.MAIL_NAVER_PASS,    host: 'imap.naver.com' },
].filter(a => a.user && a.pass);

// 8카테고리 키워드 규칙 [코드, 정규식]. 순서=우선(위에서 먼저 매치).
const RULES = [
  ['sec',   /(로그인|log\s?in|보안 알림|security alert|의심스러운|비정상 로그인|새 기기|new device|2단계|otp|인증코드|verification code)/i],
  ['gov',   /(정부지원|지원사업|창업패키지|예비창업|초기창업|모두의창업|왕중왕|바우처|tips|팁스|중소벤처|중진공|k-?startup|bizinfo|nipa|경기창경|창업진흥|gov\.kr|korea\.kr|선정|협약|사업비)/i],
  ['legal', /(상표|특허|저작권|계약서|법률|변리사|법무|소송|내용증명|kipris|특허청|출원|등록결정|의견제출)/i],
  ['fin',   /(세금|부가세|종합소득세|종소세|법인세|계좌|이체|결제|카드 승인|청구|홈택스|hometax|세무|인보이스|invoice|정산|입금|출금|세금계산서|급여)/i],
  ['edu',   /(대입|수능|입시|모의고사|강의|인강|학원|잇올|여주캠프|교재|성적|원서|수시|정시|학종|멘토링)/i],
  ['neoya', /(너야|neoya|5회독|왕중왕전|supabase|vercel|가비아|gabia|도메인 갱신|배포 실패|deploy failed)/i],
  ['news',  /(뉴스레터|newsletter|매거진|magazine|digest|weekly|구독|unsubscribe|수신거부|프로모션|promotion|할인|세일|\bsale\b|이벤트 안내|광고)/i],
];
const ACTIONABLE = new Set(['sec', 'gov', 'legal', 'fin', 'edu', 'neoya']); // news·etc 제외

function classify(text) {
  for (const [cat, re] of RULES) if (re.test(text)) return cat;
  return 'etc';
}
function priorityOf(cat, subject) {
  if (/(긴급|urgent|마감|기한|즉시|오늘까지|deadline|만료|expire|D-?\d)/i.test(subject || '')) return 'high';
  if (cat === 'sec' || cat === 'gov' || cat === 'legal' || cat === 'fin') return 'high';
  return 'normal';
}

async function upsert(rows) {
  if (!rows.length) return;
  const r = await fetch(SUPA_URL + '/rest/v1/os_backlog?on_conflict=thread_id', {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY, authorization: 'Bearer ' + SUPA_KEY, 'content-type': 'application/json',
      prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) console.error('supabase upsert ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

async function run() {
  const since = new Date(Date.now() - 60 * 60 * 1000); // 최근 60분(중복은 dedup) — 실행 실패해도 놓침 없음
  for (const acc of ACCOUNTS) {
    const client = new ImapFlow({ host: acc.host, port: 993, secure: true, auth: { user: acc.user, pass: acc.pass }, logger: false });
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const rows = [];
        for await (const msg of client.fetch({ since }, { envelope: true })) {
          const env = msg.envelope || {};
          const subject = env.subject || '(제목 없음)';
          const fromObj = (env.from && env.from[0]) || {};
          const from = fromObj.name || fromObj.address || '';
          const cat = classify(subject + ' ' + (fromObj.address || '') + ' ' + from);
          if (!ACTIONABLE.has(cat)) continue; // 액션 메일만 백로그로
          rows.push({
            thread_id: env.messageId || (acc.name + ':' + msg.uid),
            account: acc.name, category: cat,
            subject: String(subject).slice(0, 300),
            sender: String(from || fromObj.address || '').slice(0, 200),
            received_at: env.date ? new Date(env.date).toISOString() : new Date().toISOString(),
            status: 'todo', priority: priorityOf(cat, subject),
          });
        }
        await upsert(rows);
        console.log(acc.name + ': ' + rows.length + ' actionable');
      } finally { lock.release(); }
      await client.logout();
    } catch (e) {
      console.error(acc.name + ' IMAP err: ' + String(e).slice(0, 160));
      try { await client.close(); } catch (_) {}
    }
  }
  console.log('mail-backlog sync done');
}
run();
