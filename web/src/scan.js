// AI 없이 글자만 보고 할 일·학사일정·시간표를 뽑는다.
// 프록시(=API 키)가 없거나 응답이 없을 때 이 규칙들이 대신 읽는다.
// 결과 모양은 AI 가 주던 것과 같게 맞춰 두었다. 부르는 쪽이 둘을 구분하지 않아도 되도록.

const KDAY = ["일", "월", "화", "수", "목", "금", "토"];
const pad2 = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parse = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
const add = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const diff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const dowOf = (s) => parse(s).getDay();
const monday = (s) => { const w = dowOf(s); return add(s, w === 0 ? -6 : 1 - w); };
// 없는 날짜(2월 30일 같은)는 빈 값으로 돌려보낸다
const mk = (y, m, d) => { const dt = new Date(y, m - 1, d); return dt.getMonth() + 1 === m && dt.getDate() === d ? iso(dt) : ""; };
const cut = (s, n) => { const v = String(s || "").trim(); return v.length <= n ? v : v.slice(0, n).trim(); };

// 붙여넣은 글은 전각 기호나 겹칸이 섞여 있다. 규칙이 걸리도록 모양부터 고른다.
function norm(s) {
  return String(s || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ 　]/g, " ")
    .replace(/[：]/g, ":")
    .replace(/[．․]/g, ".")
    .replace(/[〜～]/g, "~")
    .replace(/[ \t]{2,}/g, " ");
}

// ── 날짜 찾기 ───────────────────────────────────────────

const YMD = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*(?:일|\.)?/g;
const YMD2 = /'(\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*(?:일|\.)?/g;
const MD = /(\d{1,2})\s*(?:월\s*|\.\s*|\/)(\d{1,2})\s*(?:일|\.)?/g;
const WDAY = /^\s*\(?\s*([월화수목금토일])\s*\)?/;

// 연도가 없으면 오늘에서 가장 가까운 앞날로 본다. 지난달 공문을 내년으로 밀지는 않는다.
function guessYear(today, m, d, weekday) {
  const base = Number(today.slice(0, 4));
  for (const y of [base, base + 1, base - 1]) {
    const v = mk(y, m, d);
    if (!v) continue;
    if (weekday != null && dowOf(v) !== weekday) continue;
    if (diff(today, v) >= -30) return v;
  }
  return mk(base, m, d);
}

function overlaps(list, from, to) {
  return list.some((d) => from < d.to && to > d.from);
}

// 상대 표현. "담주 화까지" 같은 말이 공문보다 메신저에 훨씬 많다.
function findRelatives(t, today) {
  const out = [];
  const push = (from, to, due, exact) => { if (due) out.push({ from, to, due, exact }); };
  const dayIdx = (c) => KDAY.indexOf(c);
  let m;

  const one = /(오늘|금일|내일|명일|익일|모레|글피)/g;
  while ((m = one.exec(t))) {
    const n = { 오늘: 0, 금일: 0, 내일: 1, 명일: 1, 익일: 1, 모레: 2, 글피: 3 }[m[1]];
    push(m.index, m.index + m[0].length, add(today, n), true);
  }

  const nDays = /(\d{1,2})\s*일\s*(?:뒤|후|이내|안)/g;
  while ((m = nDays.exec(t))) push(m.index, m.index + m[0].length, add(today, Number(m[1])), false);

  const nWeeks = /(\d{1,2})\s*주\s*(?:뒤|후|이내)/g;
  while ((m = nWeeks.exec(t))) push(m.index, m.index + m[0].length, add(today, Number(m[1]) * 7), false);

  const week = /(다음|담|차|이번|금|요번)\s*주?\s*([월화수목금토일])\s*요?일?/g;
  while ((m = week.exec(t))) {
    const next = /^(다음|담|차)$/.test(m[1]);
    const base = add(monday(today), next ? 7 : 0);
    const i = dayIdx(m[2]);
    push(m.index, m.index + m[0].length, add(base, i === 0 ? 6 : i - 1), false);
  }

  const monthEnd = /(?:이번\s*달|이달|금월|당월|월)\s*말|말일/g;
  while ((m = monthEnd.exec(t))) {
    const d = parse(today);
    push(m.index, m.index + m[0].length, iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)), false);
  }

  const nextMonth = /(?:다음\s*달|익월|내달)\s*(초|중순|말)?/g;
  while ((m = nextMonth.exec(t))) {
    const d = parse(today);
    const y = d.getFullYear(), mo = d.getMonth() + 1;
    const last = new Date(y, mo + 1, 0).getDate();
    const day = m[1] === "말" ? last : m[1] === "중순" ? 15 : 5;
    push(m.index, m.index + m[0].length, mk(mo === 12 ? y + 1 : y, mo === 12 ? 1 : mo + 1, day), false);
  }
  return out;
}

// 글 안의 날짜를 모두 찾아 자리(from~to)와 함께 돌려준다.
export function findDates(text, today) {
  const t = String(text);
  const out = [];
  let m;

  YMD.lastIndex = 0;
  while ((m = YMD.exec(t))) {
    const v = mk(Number(m[1]), Number(m[2]), Number(m[3]));
    if (v) out.push({ from: m.index, to: m.index + m[0].length, due: v, exact: true });
  }
  YMD2.lastIndex = 0;
  while ((m = YMD2.exec(t))) {
    const v = mk(2000 + Number(m[1]), Number(m[2]), Number(m[3]));
    if (v && !overlaps(out, m.index, m.index + m[0].length)) out.push({ from: m.index, to: m.index + m[0].length, due: v, exact: true });
  }

  MD.lastIndex = 0;
  while ((m = MD.exec(t))) {
    const mo = Number(m[1]), d = Number(m[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    const before = t[m.index - 1] || "";
    const after = t[m.index + m[0].length] || "";
    // 앞뒤가 숫자면 "3-2" 학급이나 전화번호 조각이지 날짜가 아니다
    if (/[\d.\-/:]/.test(before) || /[\d:%]/.test(after)) continue;
    if (overlaps(out, m.index, m.index + m[0].length)) continue;
    const w = WDAY.exec(t.slice(m.index + m[0].length));
    const v = guessYear(today, mo, d, w ? KDAY.indexOf(w[1]) : null);
    if (v) out.push({ from: m.index, to: m.index + m[0].length + (w ? w[0].length : 0), due: v, exact: true });
  }

  for (const r of findRelatives(t, today)) if (!overlaps(out, r.from, r.to)) out.push(r);
  return out.sort((a, b) => a.from - b.from);
}

// ── 마감 고르기 ─────────────────────────────────────────

const DUE_KEY = /(제출\s*기한|제출\s*기일|제출\s*마감|회신\s*기한|회신\s*기일|신청\s*기한|접수\s*기한|등록\s*기한|보고\s*기한|마감\s*일?|제출\s*일자?|기한|기일)/;
const ACTION = /(제출|회신|신청|접수|등록|보고|송부|입력|작성|취합|납부|응답|제작|정리)/;
const EVENT_KEY = /(회의|협의회|연수|행사|공개\s*수업|평가회|간담회|워크숍|설명회|대회|축제|캠프|고사|시험|점검|방문|훈련|상담|공청회|발표회)/;
const LABEL = /^(제출\s*기한|제출\s*기일|회신\s*기한|마감\s*일?|기한|기일|일시|기간|장소|제출\s*방법|제출\s*처|담당자?|문의|관련|근거|수신|참조|발신|붙임|첨부|내용|제목)$/;

function lineStart(t, at) { return t.lastIndexOf("\n", Math.max(0, at - 1)) + 1; }

// 이 날짜가 "내가 내야 하는 날" 로 보이는 정도. 3점부터 마감으로 친다.
function dueScore(t, d) {
  const ls = lineStart(t, d.from);
  const pre = t.slice(Math.max(ls, d.from - 60), d.from);
  const post = t.slice(d.to, d.to + 12);
  let s = 0;
  if (DUE_KEY.test(pre)) s += 3;
  if (/^\s*(?:\([^)]*\)\s*)?(?:\d{1,2}:\d{2}\s*)?(까지|限|이내|전까지|까지임|까지입니다)/.test(post)) s += 3;
  if (ACTION.test(pre)) s += 1;
  if (/까지/.test(pre)) s += 1;
  if (/(행사|일시|기간|실시|개최|운영)\s*[:\-]?\s*$/.test(pre)) s -= 2;
  return s;
}

function cleanTitle(s) {
  return String(s || "")
    .replace(/^[\s\-*·•▶▷◇◆■□○●※→⇒]+/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^[가-힣][.)]\s*/, "")
    .replace(/[「」『』《》【】<>]/g, "")
    .replace(/\[[^\]]{0,12}\]/g, "")
    .replace(/\s*[:\-]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// 마감 종류에 맞춰 "무엇을 한다" 를 붙인다. 목록에서 제목만 잘라 오면 동사가 빠지기 때문.
function withAction(title, pre) {
  const t = cleanTitle(title);
  if (!t) return "";
  const m = ACTION.exec(pre) || EVENT_KEY.exec(pre);
  const verb = m ? (EVENT_KEY.test(m[0]) ? "참석" : m[0]) : "";
  if (verb && !t.includes(verb)) return cut(`${t} ${verb}`, 25);
  return cut(t, 25);
}

function titleAt(t, d, fallback) {
  const upto = t.slice(0, d.from);
  const lines = upto.split("\n");
  const pre = t.slice(Math.max(lineStart(t, d.from), d.from - 60), d.from);
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 5; i--) {
    let c = cleanTitle(lines[i]);
    // "수요조사 제출기한:" 처럼 칸 이름이 뒤에 붙어 있으면 떼어 낸다
    c = c.replace(/\s*(제출\s*기한|제출\s*기일|회신\s*기한|마감\s*일?|기한|기일|일시|기간)\s*$/, "").trim();
    if (c && !LABEL.test(c) && c.length >= 4) return withAction(c, pre);
  }
  return withAction(fallback || "", pre) || cut(fallback || "확인 필요", 25);
}

function evidenceAt(t, d) {
  const ls = lineStart(t, d.from);
  const km = DUE_KEY.exec(t.slice(Math.max(ls, d.from - 60), d.from));
  const from = km ? Math.max(ls, d.from - 60) + km.index : d.from;
  const tail = /^\s*(?:\([^)]*\)\s*)?(?:\d{1,2}:\d{2}\s*)?까지/.exec(t.slice(d.to, d.to + 12));
  return cut(t.slice(from, d.to + (tail ? tail[0].length : 0)).replace(/\s+/g, " "), 30);
}

function docTitle(t) {
  const m = /(?:^|\n)\s*(?:제\s*목|건\s*명)\s*[:\-]\s*([^\n]{2,60})/.exec(t);
  if (m) return cleanTitle(m[1]);
  const br = /[「『【\[]([^」』】\]]{4,40})[」』】\]]/.exec(t);
  if (br) return cleanTitle(br[1]);
  for (const l of t.split("\n")) {
    const c = cleanTitle(l);
    if (c.length >= 4 && !LABEL.test(c)) return cut(c, 40);
  }
  return "";
}

function whoOf(t) {
  const m = /(?:담당자|담당부서|담당|주무관|주관|문의)\s*[:\-]?\s*([^\n,()·]{2,20})/.exec(t);
  if (m) {
    const v = m[1].replace(/\d{2,4}-\d{3,4}-\d{4}/g, "").replace(/\(.*$/, "").trim();
    if (v.length >= 2) return cut(v, 20);
  }
  const dep = /([가-힣]{2,5}(?:부|실|과|위원회))/.exec(t);
  return dep ? dep[1] : "";
}

function noteOf(t) {
  const m = /(?:제출\s*방법|제출\s*처|접수\s*방법|신청\s*방법|회신\s*방법)\s*[:\-]?\s*([^\n]{2,20})/.exec(t);
  return m ? cut(m[1], 20) : "";
}

const DEPT_HINT = [
  [/진로|취업|체험\s*학습|창체/, "진로부"],
  [/생활|안전|학폭|선도|인성/, "생활안전부"],
  [/연구|평가|수업|교육과정|공개수업/, "연구부"],
  [/정보|전산|나이스|NEIS|기자재/, "정보부"],
  [/교무|학사|성적|학적|출결/, "교무부"],
  [/학년|담임/, "학년부"],
];

function deptOf(t, at, depts) {
  const near = t.slice(Math.max(0, at - 300), at + 100);
  for (const scope of [near, t]) {
    for (const d of depts) if (d !== "기타" && scope.includes(d)) return d;
    for (const [re, name] of DEPT_HINT) if (re.test(scope) && depts.includes(name)) return name;
  }
  return "기타";
}

function normDepts(v) {
  const list = Array.isArray(v) ? v : String(v || "").split(/[,·\s]+/);
  const out = list.map((s) => String(s).trim()).filter(Boolean);
  return out.length ? out : ["교무부", "학년부", "진로부", "생활안전부", "연구부", "정보부", "기타"];
}

// 기간을 "~" 로 적으면 앞 날짜는 시작일이다. 마감은 뒤쪽 하나만 남긴다.
function dropRangeStarts(t, hits) {
  return hits.filter((h, i) => {
    const nx = hits[i + 1];
    if (!nx) return true;
    return !/^\s*[~\-–]\s*$/.test(t.slice(h.to, nx.from));
  });
}

// ── 할 일 뽑기 ─────────────────────────────────────────

export function scanTasks(raw, opt = {}) {
  const today = opt.today || iso(new Date());
  const depts = normDepts(opt.depts);
  const t = norm(raw);
  const bare = t.replace(/\s/g, "");
  if (bare.length < 8) return { read: "", quality: "none", reason: "읽은 글자가 없습니다", tasks: [], by: "rule" };

  const dates = findDates(t, today);
  const scored = dates.map((d) => ({ ...d, score: dueScore(t, d) }));
  const hits = dropRangeStarts(t, scored.filter((d) => d.score >= 3));
  const title0 = docTitle(t);
  const who = whoOf(t);
  const note = noteOf(t);

  const tasks = [];
  const seen = new Set();
  const put = (d, sure) => {
    let due = d.due;
    const w = dowOf(due);
    if (w === 6) due = add(due, -1);       // 토요일 마감은 금요일에 내야 한다
    else if (w === 0) due = add(due, -2);
    if (diff(today, due) < -1 || diff(today, due) > 400) return;
    const title = titleAt(t, d, title0);
    if (!title) return;
    const key = `${title}|${due}`;
    if (seen.has(key)) return;
    seen.add(key);
    tasks.push({
      title, who, dept: deptOf(t, d.from, depts), due, note,
      evidence: evidenceAt(t, d), sure: sure && d.exact,
    });
  };

  for (const h of hits) { put(h, h.score >= 4); if (tasks.length >= 12) break; }

  // 마감이 없으면 행사 날짜라도 챙긴다. 참석도 해야 할 일이다.
  if (!tasks.length) {
    for (const d of scored) {
      const line = t.slice(lineStart(t, d.from), t.indexOf("\n", d.to) < 0 ? t.length : t.indexOf("\n", d.to));
      if (!EVENT_KEY.test(line) && !EVENT_KEY.test(title0)) continue;
      put(d, true);
      if (tasks.length >= 6) break;
    }
  }

  const quality = bare.length < 30 ? "poor" : "good";
  const reason = tasks.length ? "" : dates.length ? "마감 날짜를 못 찾았습니다" : "날짜가 없습니다";
  const first = tasks[0];
  const read = tasks.length
    ? cut(`${title0 || first.title} 등 ${tasks.length}건, 가장 이른 마감 ${first.due}`, 80)
    : cut(title0 || t.split("\n").find((l) => l.trim()) || "", 80);

  return { read, quality, reason, tasks, by: "rule" };
}

// ── 학사일정 뽑기 ───────────────────────────────────────

const EV_RULES = [
  [/방학|재량\s*휴업|휴업일|공휴일|개교\s*기념|대체\s*휴일|휴일/, "off"],
  [/중간고사|기말고사|모의고사|학력평가|지필|고사|평가원/, "exam"],
  [/요일\s*변동|요일제|수업\s*교체/, "swap"],
];

export function scanEvents(raw, opt = {}) {
  const today = opt.today || iso(new Date());
  const t = norm(raw);
  const out = [];
  const seen = new Set();

  for (const line of t.split("\n")) {
    const ds = findDates(line, today).filter((d) => d.exact);
    if (!ds.length) continue;
    let name = line;
    for (const d of [...ds].reverse()) name = name.slice(0, d.from) + " " + name.slice(d.to);
    name = cleanTitle(name.replace(/\d{1,2}\s*:\s*\d{2}/g, "").replace(/[~\-–(),.]/g, " "));
    if (name.length < 2) continue;

    let kind = "event", swap;
    for (const [re, k] of EV_RULES) if (re.test(line)) { kind = k; break; }
    if (kind === "swap") { const m = /([월화수목금])\s*요일\s*(?:수업|운영|시간표)/.exec(line); swap = m ? m[1] : "월"; }

    const start = ds[0].due;
    const end = ds.length > 1 && ds[1].due >= start ? ds[1].due : start;
    if (diff(today, start) < -1 || diff(today, start) > 300) continue;
    const key = `${start}|${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ start, end, name: cut(name, 20), kind, ...(kind === "swap" ? { swap } : {}) });
    if (out.length >= 120) break;
  }
  return { read: out.length ? `${out.length}건을 찾았습니다` : "일정을 못 찾았습니다", events: out };
}

// ── 시간표 뽑기 ─────────────────────────────────────────

const DAYS = ["월", "화", "수", "목", "금"];
const CLASS = /(\d)\s*[-–]\s*(\d{1,2})/;

// 엑셀을 글자로 바꾸면 칸이 쉼표나 탭으로 남는다. 요일이 가로로 놓인 표와 세로로 놓인 표를 둘 다 본다.
export function scanTimetable(raw) {
  const rows = norm(raw).split("\n").map((l) => l.split(/[,\t|]/).map((c) => c.trim()));
  const out = { 월: [], 화: [], 수: [], 목: [], 금: [] };
  const cell = (v) => { const m = CLASS.exec(String(v)); return m ? `${m[1]}-${Number(m[2])}` : ""; };

  // 세로로 요일이 놓인 모양: 각 줄 첫 칸이 요일
  let found = 0;
  for (const r of rows) {
    const d = (r[0] || "").replace(/요일/, "").trim();
    if (!DAYS.includes(d) || out[d].length) continue;
    const vals = r.slice(1).map(cell).slice(0, 7);
    if (!vals.some(Boolean)) continue;
    while (vals.length < 7) vals.push("");
    out[d] = vals;
    found++;
  }
  if (found >= 3) return fillTimetable(out);

  // 가로로 요일이 놓인 모양: 머리줄에서 요일 칸 번호를 찾고 아래 줄을 교시로 읽는다
  const head = rows.findIndex((r) => DAYS.filter((d) => r.some((c) => c.replace(/요일/, "").trim() === d)).length >= 3);
  if (head < 0) return null;
  const col = {};
  rows[head].forEach((c, i) => { const d = c.replace(/요일/, "").trim(); if (DAYS.includes(d)) col[d] = i; });
  let period = 0;
  for (let r = head + 1; r < rows.length && period < 7; r++) {
    const row = rows[r];
    if (!row.some((c) => CLASS.test(c))) continue;
    for (const d of DAYS) out[d].push(col[d] != null ? cell(row[col[d]]) : "");
    period++;
  }
  return DAYS.some((d) => out[d].some(Boolean)) ? fillTimetable(out) : null;
}

function fillTimetable(out) {
  const clean = {};
  for (const d of DAYS) {
    const a = (out[d] || []).slice(0, 7);
    while (a.length < 7) a.push("");
    clean[d] = a;
  }
  const n = DAYS.reduce((s, d) => s + clean[d].filter(Boolean).length, 0);
  return { ...clean, read: `수업 ${n}칸을 채웠습니다` };
}
