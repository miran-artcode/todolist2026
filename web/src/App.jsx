import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { Camera, Check, Hash, Send, Loader, Upload, Calendar, School, PanelRightClose, RefreshCw, X, ChevronLeft, ChevronRight, FileText, AlertTriangle, ClipboardPaste, Plus, Users, Inbox, Pin, Image as ImageIcon } from "lucide-react";

const S = {
  brand: "#3F0E40", brandText: "#BCABBC", brandHover: "#4A184C",
  blue: "#1264A3", blueSoft: "#E3F0F8", blueInk: "#0B4C8C",
  red: "#E01E5A", green: "#007A5A", greenSoft: "#E8F5F0",
  yellow: "#ECB22E", yellowSoft: "#FCF3DD", yellowInk: "#8A6410",
  ink: "#1D1C1D", muted: "#616061", faint: "#9A9A9A",
  line: "#E4E4E4", bg: "#FFFFFF", gray: "#F4F4F4",
};
const KIND_COLOR = { school: "#4A154B", dept: "#1264A3", grade: "#007A5A", subject: "#B8801C" };
const KDAY = ["일", "월", "화", "수", "목", "금", "토"];
const DAYS = ["월", "화", "수", "목", "금"];
const PERIODS = [1, 2, 3, 4, 5, 6, 7];
const DEPTS = ["교무부", "학년부", "진로부", "생활안전부", "연구부", "정보부", "기타"];
const DEFAULT_TT = {
  월: ["3-2", "3-5", "", "2-1", "3-2", "", "1-3"], 화: ["2-4", "", "3-1", "3-5", "2-1", "1-3", ""],
  수: ["3-5", "2-1", "3-2", "", "1-3", "", "2-4"], 목: ["3-1", "3-2", "", "2-4", "", "3-5", "1-3"],
  금: ["", "2-1", "3-5", "3-2", "2-4", "", "3-1"],
};

const EV_KIND = {
  off:   { label: "휴업", color: "#8A6410", bg: "#FBF2DF", teach: false },
  exam:  { label: "고사", color: "#9B1740", bg: "#FCE7EE", teach: false },
  swap:  { label: "요일변동", color: "#0B4C8C", bg: "#E3F0F8", teach: true },
  event: { label: "행사", color: "#4A154B", bg: "#F1E9F1", teach: true },
};

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseISO = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const fmtK = (s) => { const d = parseISO(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${KDAY[d.getDay()]}`; };
const fmtShort = (s) => { const d = parseISO(s); return `${d.getMonth() + 1}/${d.getDate()} ${KDAY[d.getDay()]}`; };
const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const TODAY = iso(new Date());
const startOfWeek = (s2) => { const w = parseISO(s2).getDay(); return addDays(s2, w === 0 ? -6 : 1 - w); };
const rel = (d) => { const n = diffDays(TODAY, d); return n < 0 ? "지남" : n === 0 ? "오늘" : n === 1 ? "내일" : `${n}일 뒤`; };
const slug = (s) => String(s).replace(/[^가-힣a-zA-Z0-9]/g, "").slice(0, 20);
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function buildGroups(p) {
  if (!p || !p.school) return [];
  const sc = slug(p.school);
  const g = [{ id: `sch-${sc}`, label: `${p.school} 전체`, kind: "school" }];
  if (p.dept) g.push({ id: `dep-${sc}-${slug(p.dept)}`, label: p.dept, kind: "dept" });
  if (p.homeroom && p.grade) g.push({ id: `hrm-${sc}-${p.grade}`, label: `${p.grade}학년 담임`, kind: "grade" });
  if (p.subject) g.push({ id: `sub-${sc}-${slug(p.subject)}`, label: `${p.subject}과`, kind: "subject" });
  return g;
}

function roleLabel(p) {
  if (!p) return "";
  if (p.homeroom && p.grade && p.classNo) return `${p.grade}-${p.classNo} 담임`;
  if (p.homeroom && p.grade) return `${p.grade}학년 담임`;
  return "비담임";
}

const REG_KEY = "school-registry-v1";
const SEED_REG = {
  서울미술고등학교: { depts: ["교무부", "학년부", "진로부", "생활안전부"], subjects: ["미술", "국어", "지리"], count: 4 },
};

async function loadRegistry() {
  try {
    const r = await window.storage.get(REG_KEY, true);
    const parsed = r ? JSON.parse(r.value) : null;
    if (parsed && Object.keys(parsed).length) return parsed;
  } catch (e) { /* 아직 명부가 없음 */ }
  try { await window.storage.set(REG_KEY, JSON.stringify(SEED_REG), true); } catch (e) { /* 무시 */ }
  return SEED_REG;
}

async function joinRegistry({ school, dept, subject }) {
  if (!school) return;
  let reg = {};
  try { const r = await window.storage.get(REG_KEY, true); reg = r ? JSON.parse(r.value) : {}; } catch (e) { reg = {}; }
  const cur = reg[school] || { depts: [], subjects: [], count: 0 };
  cur.depts = cur.depts || [];
  cur.subjects = cur.subjects || [];
  if (dept && !cur.depts.includes(dept)) cur.depts.push(dept);
  if (subject && !cur.subjects.includes(subject)) cur.subjects.push(subject);
  cur.count = (cur.count || 0) + 1;
  reg[school] = cur;
  try { await window.storage.set(REG_KEY, JSON.stringify(reg), true); } catch (e) { /* 무시 */ }
}

function fileKind(file) {
  const n = (file.name || "").toLowerCase();
  if (/\.(hwp|hwpx)$/.test(n)) return "hwp";
  if (/\.(xlsx|xlsm|xls)$/.test(n)) return "excel";
  if (/\.docx$/.test(n)) return "word";
  if (/\.(doc|ppt|pptx|zip)$/.test(n)) return "office";
  if (file.type === "application/pdf") return "pdf";
  if (file.type && file.type.startsWith("image/")) return "image";
  if ((file.type && file.type.startsWith("text/")) || /\.(txt|csv|md|json)$/.test(n)) return "text";
  return "unknown";
}

async function excelToText(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  return wb.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
    return `[시트: ${name}]\n${rows}`;
  }).join("\n\n").slice(0, 20000);
}

async function wordToText(file) {
  const buf = await file.arrayBuffer();
  const r = await mammoth.extractRawText({ arrayBuffer: buf });
  return String(r.value || "").slice(0, 20000);
}

function imgSize(file) {
  return new Promise((res) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { res({ w: im.naturalWidth, h: im.naturalHeight }); URL.revokeObjectURL(url); };
    im.onerror = () => { res(null); URL.revokeObjectURL(url); };
    im.src = url;
  });
}

async function inspect(file) {
  const kind = fileKind(file);
  const info = { file, kind, name: file.name || "캡처 이미지", ok: true, msg: "" };
  if (kind === "hwp") { info.ok = false; info.msg = "한글파일은 읽을 수 없습니다"; return info; }
  if (kind === "office") { info.ok = false; info.msg = "이 형식은 읽을 수 없습니다"; return info; }
  if (kind === "excel" || kind === "word") return info;
  if (kind === "unknown") { info.ok = false; info.msg = "지원하지 않는 형식입니다"; return info; }
  if (kind === "image") {
    const sz = await imgSize(file);
    if (!sz) { info.ok = false; info.msg = "이미지를 열지 못했습니다"; return info; }
    info.size = sz;
    const longSide = Math.max(sz.w, sz.h);
    if (longSide < 500) { info.warn = "너무 작아 글자가 안 보일 수 있습니다"; }
  }
  return info;
}

async function toBlock(file) {
  const k = fileKind(file);
  if (k === "excel") return { kind: "text", text: await excelToText(file), name: file.name };
  if (k === "word") return { kind: "text", text: await wordToText(file), name: file.name };
  if (k === "text") return { kind: "text", text: await file.text(), name: file.name };
  const b64 = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("실패"));
    r.readAsDataURL(file);
  });
  if (file.type === "application/pdf")
    return { kind: "doc", name: file.name, block: { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } } };
  if (file.type.startsWith("image/"))
    return { kind: "image", name: file.name, url: URL.createObjectURL(file), block: { type: "image", source: { type: "base64", media_type: file.type, data: b64 } } };
  return { kind: "unsupported", name: file.name };
}

function verify(x) {
  const warn = [];
  let sure = x.sure !== false;
  const due = String(x.due || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) { warn.push("날짜 형식이 이상합니다"); sure = false; }
  else {
    const n = diffDays(TODAY, due);
    if (n < 0) { warn.push("지난 날짜입니다"); sure = false; }
    else if (n > 365) { warn.push("1년보다 먼 날짜입니다"); sure = false; }
    const w = parseISO(due).getDay();
    if (w === 0 || w === 6) { warn.push("주말입니다"); sure = false; }
  }
  if (!x.evidence) { warn.push("원문에서 근거를 못 찾았습니다"); sure = false; }
  if (!x.title || String(x.title).trim().length < 2) { warn.push("내용이 비었습니다"); sure = false; }
  return { sure, _warn: warn };
}

async function askClaude(parts) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content: parts }] }),
  });
  const data = await res.json();
  const raw = data.content.filter((c) => c.type === "text").map((c) => c.text).join("");
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

export default function App() {
  const [me, setMe] = useState(null);
  const [tt, setTt] = useState(DEFAULT_TT);
  const [items, setItems] = useState([]);
  const [events, setEvents] = useState([]);
  const [feed, setFeed] = useState([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState("clip");
  const [sel, setSel] = useState(null);
  const [widget, setWidget] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const pop = usePopOut();

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("teacher-desk2");
        if (r) { const s = JSON.parse(r.value); setMe(s.me || null); setTt(s.tt || DEFAULT_TT); setItems(s.items || []); setEvents(s.events || []); }
      } catch (e) { /* 첫 실행 */ }
      setReady(true);
    })();
  }, []);
  useEffect(() => { if (ready) window.storage.set("teacher-desk2", JSON.stringify({ me, tt, items, events })).catch(() => {}); }, [me, tt, items, events, ready]);

  const dayInfo = useMemo(() => (d) => {
    const w = parseISO(d).getDay();
    if (w === 0 || w === 6) return { row: null, kind: "weekend", label: "주말" };
    const hits = events.filter((e) => d >= e.start && d <= (e.end || e.start));
    const pick = hits.find((e) => e.kind === "off") || hits.find((e) => e.kind === "exam")
      || hits.find((e) => e.kind === "swap") || hits[0];
    if (!pick) return { row: tt[KDAY[w]], kind: "normal", label: "" };
    if (pick.kind === "off" || pick.kind === "exam") return { row: null, kind: pick.kind, label: pick.name };
    if (pick.kind === "swap" && pick.swap && tt[pick.swap]) return { row: tt[pick.swap], kind: "swap", label: pick.name };
    return { row: tt[KDAY[w]], kind: "event", label: pick.name };
  }, [tt, events]);

  const groups = useMemo(() => buildGroups(me), [me]);
  const [deptHint, setDeptHint] = useState(DEPTS.join(", "));
  useEffect(() => {
    if (!me) return;
    loadRegistry().then((reg) => {
      const e = reg[me.school];
      const list = e && e.depts && e.depts.length ? e.depts : DEPTS;
      setDeptHint([...new Set([...list, me.dept])].join(", "));
    });
  }, [me]);
  const feedKey = me ? `feed2-${slug(me.school)}` : null;

  const pull = useCallback(async () => {
    if (!feedKey) return;
    setSyncing(true);
    try { const r = await window.storage.get(feedKey, true); setFeed(r ? JSON.parse(r.value) : []); } catch (e) { setFeed([]); }
    setSyncing(false);
  }, [feedKey]);

  useEffect(() => { pull(); }, [pull]);
  useEffect(() => { if (!feedKey) return; const t = setInterval(pull, 20000); return () => clearInterval(t); }, [feedKey, pull]);

  async function push(msg) {
    if (!feedKey) return;
    let cur = [];
    try { const r = await window.storage.get(feedKey, true); cur = r ? JSON.parse(r.value) : []; } catch (e) { cur = []; }
    const next = [msg, ...cur].slice(0, 80);
    await window.storage.set(feedKey, JSON.stringify(next), true);
    setFeed(next);
  }

  const addItems = (arr) => setItems((p) => [...p, ...arr]);

  if (!ready) return <Shell><p style={{ padding: 40, color: S.muted }}>불러오는 중</p></Shell>;
  if (!me) return <Setup onDone={(p) => { joinRegistry(p); setMe(p); }} />;

  const myIds = new Set(groups.map((g) => g.id));
  const inbox = feed.filter((m) => myIds.has(m.gid) && m.from !== me.nick);
  const sent = feed.filter((m) => m.from === me.nick);
  const shown = sel ? inbox.filter((m) => m.gid === sel) : inbox;
  const pending = inbox.filter((m) => !items.some((i) => i.src === m.id)).length;

  if (widget || pop.out) {
    return (
      <Shell>
        <div ref={pop.slot}>
          <div ref={pop.holder}>
            <WidgetPanel dayInfo={dayInfo} items={items} inbox={inbox} setItems={setItems} pinned={pop.out} />
          </div>
        </div>
        {pop.out ? (
          <div style={{ padding: 36, textAlign: "center", maxWidth: 360 }}>
            <Pin size={22} color={S.green} />
            <p style={{ fontSize: 15, fontWeight: 700, margin: "10px 0 6px" }}>작은 창으로 띄웠습니다</p>
            <p style={{ fontSize: 13, color: S.muted, margin: "0 0 18px", lineHeight: 1.6 }}>
              그 창은 나이스나 업무포털 위에 계속 떠 있습니다. 창을 닫으면 이 자리로 돌아옵니다.
            </p>
            <button onClick={() => setWidget(false)} style={ghostBtn}>전체 화면으로</button>
          </div>
        ) : (
          <div style={{ padding: "4px 13px 18px", width: 320 }}>
            {typeof window !== "undefined" && window.desk && window.desk.isElectron ? (
              <button onClick={() => window.desk.toggleTop()} style={{ ...primaryBtn, width: "100%" }}>
                <Pin size={15} /><span style={{ marginLeft: 7 }}>항상 위에 두기 켜고 끄기</span>
              </button>
            ) : (
              <button
                onClick={async () => { const done = await pop.open(); if (!done) alert("이 브라우저에서는 안 됩니다. 크롬이나 엣지 최신 버전에서 열어 주세요."); }}
                disabled={!pop.supported}
                style={{ ...primaryBtn, width: "100%", opacity: pop.supported ? 1 : 0.45 }}>
                <Pin size={15} /><span style={{ marginLeft: 7 }}>{pop.supported ? "항상 위에 띄우기" : "이 브라우저는 지원 안 함"}</span>
              </button>
            )}
            <button onClick={() => setWidget(false)} style={{ ...ghostBtn, width: "100%", marginTop: 8, justifyContent: "center" }}>전체 화면으로</button>
          </div>
        )}
      </Shell>
    );
  }

  return (
    <Shell>
      <div style={{ display: "flex", height: "100vh", minHeight: 640 }}>
        <Sidebar me={me} groups={groups} sel={sel} setSel={setSel} view={view} setView={setView} pending={pending} feed={feed} onReset={() => setMe(null)} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <TopBar me={me} dayInfo={dayInfo} onWidget={() => setWidget(true)} onSync={pull} syncing={syncing} />
          <div style={{ flex: 1, overflowY: "auto", background: S.bg }}>
            {view === "clip" && <CaptureView addItems={addItems} goCal={() => setView("cal")} deptHint={deptHint} />}
            {view === "inbox" && <InboxView msgs={shown} items={items} setItems={setItems} groups={groups} sel={sel} />}
            {view === "send" && <Composer me={me} groups={groups} push={push} onSent={() => setView("sent")} />}
            {view === "sent" && <SentList msgs={sent} groups={groups} />}
            {view === "cal" && <CalView items={items} setItems={setItems} dayInfo={dayInfo} events={events} />}
            {view === "tt" && <SchoolTab tt={tt} setTt={setTt} events={events} setEvents={setEvents} />}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function CaptureView({ addItems, goCal, deptHint }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [found, setFound] = useState(null);
  const [meta, setMeta] = useState(null);
  const [diag, setDiag] = useState(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef();

  const addFiles = useCallback(async (list) => {
    const arr = Array.from(list).filter((f) => f.size < 12_000_000);
    if (!arr.length) return;
    const infos = await Promise.all(arr.map(inspect));
    setFiles((p) => [...p, ...infos]);
    setErr("");
  }, []);

  useEffect(() => {
    const h = (e) => {
      const cd = e.clipboardData;
      if (!cd) return;
      const imgs = [];
      for (const it of cd.items || []) if (it.type && it.type.startsWith("image/")) { const f = it.getAsFile(); if (f) imgs.push(f); }
      if (imgs.length) { e.preventDefault(); addFiles(imgs); return; }
      const t = cd.getData("text");
      const tag = e.target && e.target.tagName;
      if (t && tag !== "TEXTAREA" && tag !== "INPUT") { e.preventDefault(); setText((p) => (p ? `${p}\n\n${t}` : t)); }
    };
    document.addEventListener("paste", h);
    return () => document.removeEventListener("paste", h);
  }, [addFiles]);

  async function run() {
    if (!text.trim() && files.length === 0) return setErr("붙여넣거나 파일을 넣으세요");
    setErr(""); setDiag(null); setBusy(true);
    try {
      const parts = [];
      let body = text;
      const usable = files.filter((f) => f.ok);
      if (!text.trim() && usable.length === 0) {
        setErr("읽을 수 있는 자료가 없습니다. 내용을 복사해서 붙여넣어 보세요.");
        setBusy(false); return;
      }
      for (const f of usable) {
        const b = await toBlock(f.file);
        if (b.kind === "text") body += `\n\n[${b.name}]\n${b.text}`;
        else if (b.block) parts.push(b.block);
      }
      parts.push({ type: "text", text: `아래 자료는 한국 고등학교 교사가 받은 공문, 학교 메신저 내용, 카톡, 또는 그 캡처다.
오늘은 ${TODAY} (${KDAY[parseISO(TODAY).getDay()]}요일).
이 학교에 등록된 부서: ${deptHint}

이 교사가 해야 할 일을 모두 뽑아라. 공문 한 장에 여러 건이 들어 있을 수 있으니 빠짐없이.

한국 공문은 보통 이런 칸을 갖는다. 마감은 "제출기한", "제출기일", "회신기한", "까지" 부근에서 찾는다.
  제목 / 관련 / 내용 / 제출기한 / 제출방법 / 담당자 / 붙임
본문에 여러 날짜가 있으면 행사일이 아니라 이 교사가 제출해야 하는 날짜를 고른다.

JSON 객체 하나만 출력. 설명이나 마크다운 없이.
{"read":"자료에서 실제로 읽어낸 글자를 80자 이내로 요약. 아무것도 못 읽었으면 빈 문자열","quality":"good 또는 poor 또는 none","reason":"할 일을 못 뽑았을 때만 그 이유를 20자 이내로","tasks":[{"title":"할 일 25자 이내","who":"요청 주체","dept":"부서명","due":"YYYY-MM-DD","note":"제출처나 양식 20자 이내","evidence":"마감을 찾은 원문 한 조각 30자 이내","sure":true}]}

quality 기준
- good: 글자가 또렷하게 읽힘
- poor: 흐리거나 잘려서 일부만 읽힘
- none: 글자를 전혀 읽지 못함

규칙
- 상대 표현("다음 주 화요일", "이번 달 말", "기말고사 전까지")은 실제 날짜로 바꾼다
- 연도가 없으면 오늘 기준 가장 가까운 미래로 본다
- 마감이 토·일이면 직전 금요일로 당긴다
- evidence에는 마감 근거가 된 원문을 그대로 짧게 옮긴다. 추측이면 빈 문자열
- 마감을 확실히 알 수 없으면 sure를 false, due는 추정값
- dept는 위 등록된 부서 중에서 고르고, 없으면 기타
- 단순 안내이고 할 일이 없으면 tasks는 빈 배열, reason에 이유를 적는다

예시 1
입력: "[공문] 2026학년도 진로체험 수요조사 제출\\n제출기한: 2026. 9. 11.(금) 16:00\\n제출방법: 업무포털 첨부\\n담당: 진로부 김OO"
출력: {"read":"진로체험 수요조사 제출 공문, 제출기한 9월 11일","quality":"good","reason":"","tasks":[{"title":"진로체험 수요조사 제출","who":"진로부 김OO","dept":"진로부","due":"2026-09-11","note":"업무포털 첨부","evidence":"제출기한: 2026. 9. 11.(금)","sure":true}]}

예시 2
입력: "샘 담주 화까지 우리 반 봉사시간 정리해서 저한테 주실 수 있어요? 학년부에서 취합한대요"
출력: {"read":"봉사시간 정리 요청 메시지","quality":"good","reason":"","tasks":[{"title":"학급 봉사시간 정리","who":"학년부","dept":"학년부","due":"(다음 주 화요일 날짜)","note":"학년부 취합","evidence":"담주 화까지","sure":true}]}

예시 3 (마감이 없는 경우)
입력: "9월 교직원 협의회 안내 - 9월 3일 15시 시청각실"
출력: {"read":"9월 교직원 협의회 안내, 9월 3일 15시","quality":"good","reason":"","tasks":[{"title":"교직원 협의회 참석","who":"교무부","dept":"교무부","due":"2026-09-03","note":"15시 시청각실","evidence":"9월 3일 15시","sure":true}]}

자료:
${body || "(첨부만 있음)"}` });
      const res = await askClaude(parts);
      const arr = Array.isArray(res) ? res : (res && Array.isArray(res.tasks) ? res.tasks : []);
      const meta = Array.isArray(res) ? { quality: "good", read: "", reason: "" } : (res || {});
      if (meta.quality === "none" || (!meta.read && arr.length === 0)) {
        setDiag({ kind: "none", read: meta.read || "", reason: meta.reason || "" });
        setBusy(false); return;
      }
      if (arr.length === 0) {
        setDiag({ kind: "empty", read: meta.read || "", reason: meta.reason || "" });
        setBusy(false); return;
      }
      const snippet = (body || "").slice(0, 400);
      setDiag(null);
      setMeta(meta);
      setFound(arr.map((x) => {
        const v = verify(x);
        return { ...x, ...v, _id: uid(), _on: v.sure !== false && meta.quality !== "poor", _raw: snippet };
      }));
    } catch (e) { setErr("읽지 못했습니다. 다시 시도해 주세요."); }
    setBusy(false);
  }

  function commit() {
    const picked = found.filter((f) => f._on);
    addItems(picked.map((f) => ({ id: uid(), title: f.title, who: f.who || "미상", dept: f.dept || "기타", due: f.due, note: f.note || "", evidence: f.evidence || "", raw: f._raw || "", done: false })));
    setFound(null); setMeta(null); setText(""); setFiles([]); goCal();
  }

  if (found)
    return (
      <div style={{ padding: "22px 20px", maxWidth: 720 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{found.length}건을 찾았습니다</h2>
          <button onClick={() => { setFound(null); setMeta(null); }} style={{ ...ghostBtn, marginLeft: "auto", padding: "6px 12px", fontSize: 12.5 }}>
            <X size={13} style={{ marginRight: 4 }} />다시
          </button>
        </div>
        <p style={{ fontSize: 13, color: S.muted, margin: "0 0 14px" }}>확인하고 고칠 것만 고친 뒤 등록하세요.</p>

        {meta && meta.read && (
          <div style={{
            padding: "11px 13px", borderRadius: 8, marginBottom: 16,
            background: meta.quality === "poor" ? S.yellowSoft : S.gray,
          }}>
            <p style={{ fontSize: 11.5, fontWeight: 700, color: meta.quality === "poor" ? S.yellowInk : S.muted, margin: "0 0 5px" }}>
              {meta.quality === "poor" ? "일부만 읽혔습니다" : "이렇게 읽었습니다"}
            </p>
            <p style={{ fontSize: 12.5, color: S.ink, margin: 0, lineHeight: 1.6 }}>{meta.read}</p>
            {meta.quality === "poor" && (
              <p style={{ fontSize: 12, color: S.yellowInk, margin: "7px 0 0", lineHeight: 1.6 }}>
                흐리거나 잘려서 놓친 게 있을 수 있습니다. 전부 확인해 주세요.
              </p>
            )}
          </div>
        )}

        {found.map((f, idx) => (
          <div key={f._id} style={{ border: `1px solid ${f._on ? S.line : "#EFEFEF"}`, borderRadius: 8, padding: 14, marginBottom: 10, background: f._on ? S.bg : "#FCFCFC", opacity: f._on ? 1 : 0.6 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
              <button onClick={() => setFound((p) => p.map((x, i) => (i === idx ? { ...x, _on: !x._on } : x)))}
                style={{ width: 20, height: 20, borderRadius: 4, border: `1.5px solid ${f._on ? S.green : "#C0C0C0"}`, background: f._on ? S.green : S.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, marginTop: 2, flexShrink: 0 }}
                aria-label="선택">{f._on && <Check size={13} color="#fff" strokeWidth={3.5} />}</button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input value={f.title} onChange={(e) => setFound((p) => p.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))}
                  style={{ ...bare, fontSize: 15, fontWeight: 600, width: "100%" }} />
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                  <input value={f.who} onChange={(e) => setFound((p) => p.map((x, i) => (i === idx ? { ...x, who: e.target.value } : x)))}
                    style={{ ...bare, fontSize: 12.5, color: S.muted, width: 100 }} />
                  <span style={{ fontSize: 11.5, color: KIND_COLOR.dept, display: "flex", alignItems: "center", gap: 1, fontWeight: 600 }}>
                    <Hash size={10} strokeWidth={2.5} />{f.dept}
                  </span>
                  <input type="date" value={f.due} onChange={(e) => setFound((p) => p.map((x, i) => (i === idx ? { ...x, due: e.target.value, sure: true, _warn: [] } : x)))}
                    style={{ ...inputStyle, width: 148, padding: "5px 8px", fontSize: 12.5 }} />
                  <span style={{ fontSize: 11.5, color: diffDays(TODAY, f.due) <= 1 ? S.red : S.faint, fontWeight: 600 }}>{rel(f.due)}</span>
                  {f.sure === false && (
                    <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11.5, padding: "3px 8px", borderRadius: 4, background: S.yellowSoft, color: S.yellowInk, fontWeight: 600 }}>
                      <AlertTriangle size={11} />날짜 확인 필요
                    </span>
                  )}
                </div>
                {f.evidence && (
                  <p style={{ fontSize: 11.5, color: S.muted, margin: "8px 0 0", background: S.gray, borderRadius: 4, padding: "5px 8px", display: "inline-block" }}>
                    근거 · {f.evidence}
                  </p>
                )}
                {f._warn && f._warn.length > 0 && (
                  <p style={{ fontSize: 11.5, color: S.yellowInk, margin: "6px 0 0" }}>{f._warn.join(" · ")}</p>
                )}
                {f.note && <p style={{ fontSize: 12, color: S.faint, margin: "7px 0 0" }}>{f.note}</p>}
              </div>
            </div>
          </div>
        ))}

        <button onClick={commit} disabled={!found.some((f) => f._on)} style={{ ...primaryBtn, marginTop: 8, opacity: found.some((f) => f._on) ? 1 : 0.45 }}>
          <Calendar size={15} /><span style={{ marginLeft: 7 }}>선택한 {found.filter((f) => f._on).length}건 일정 등록</span>
        </button>
      </div>
    );

  return (
    <div style={{ padding: "22px 20px", maxWidth: 720 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 5px" }}>담기</h2>
      <p style={{ fontSize: 13, color: S.muted, margin: "0 0 18px", lineHeight: 1.6 }}>
        공문, 카톡, 캡처, 한글파일, PDF 아무거나. 여러 건이 들어 있어도 전부 뽑아냅니다.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current.click()}
        style={{
          border: `2px dashed ${drag ? S.green : "#CFCFCF"}`, borderRadius: 10, padding: "34px 20px", textAlign: "center",
          background: drag ? S.greenSoft : "#FCFCFC", cursor: "pointer", marginBottom: 14, transition: "all .12s",
        }}
      >
        <ClipboardPaste size={26} color={drag ? S.green : S.faint} />
        <p style={{ fontSize: 14.5, fontWeight: 600, margin: "10px 0 4px" }}>
          {drag ? "여기에 놓으세요" : "Ctrl+V 로 붙여넣기"}
        </p>
        <p style={{ fontSize: 12.5, color: S.muted, margin: 0 }}>파일을 끌어다 놓거나 눌러서 고르기</p>
        <input ref={inputRef} type="file" multiple accept="image/*,.pdf,.txt,.csv,.hwp,.hwpx,.docx" onClick={(e) => e.stopPropagation()}
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
      </div>

      {files.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {files.map((f, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", borderRadius: 6, fontSize: 12.5,
                background: f.ok ? S.gray : "#FDECEC", border: f.ok ? "none" : "1px solid #F2C4C4",
              }}>
                {f.kind === "image" ? <ImageIcon size={13} color={f.ok ? S.blue : S.red} /> : <FileText size={13} color={f.ok ? S.muted : S.red} />}
                <span style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: f.ok ? S.ink : S.red }}>{f.name}</span>
                {f.size && <span style={{ fontSize: 11, color: S.faint }}>{f.size.w}×{f.size.h}</span>}
                <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} style={{ ...iconBtn, width: 18, height: 18 }} aria-label="빼기">
                  <X size={12} color={S.faint} />
                </button>
              </div>
            ))}
          </div>
          {files.filter((f) => !f.ok).map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7, marginTop: 9, padding: "9px 11px", background: "#FDECEC", borderRadius: 6 }}>
              <AlertTriangle size={14} color={S.red} style={{ marginTop: 1, flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: S.red, margin: 0 }}>{f.name} · {f.msg}</p>
                {f.kind === "hwp" && (
                  <p style={{ fontSize: 12, color: S.muted, margin: "4px 0 0", lineHeight: 1.6 }}>
                    한글에서 문서를 연 뒤 Ctrl+A → Ctrl+C 하고, 아래 칸에 Ctrl+V 하세요.<br />
                    또는 한글에서 PDF로 저장한 뒤 그 파일을 넣으세요.
                  </p>
                )}
              </div>
            </div>
          ))}
          {files.filter((f) => f.ok && f.warn).map((f, i) => (
            <p key={i} style={{ fontSize: 12, color: S.yellowInk, background: S.yellowSoft, borderRadius: 6, padding: "8px 11px", margin: "9px 0 0" }}>
              {f.name} · {f.warn}. 더 크게 캡처하면 정확해집니다.
            </p>
          ))}
        </div>
      )}

      <textarea value={text} onChange={(e) => { setText(e.target.value); setErr(""); }}
        placeholder="글자를 복사해서 여기 붙여넣어도 됩니다"
        style={{ ...inputStyle, minHeight: 120, lineHeight: 1.65, resize: "vertical", padding: 12 }} />

      {err && <p style={{ fontSize: 12.5, color: S.red, margin: "10px 0 0" }}>{err}</p>}

      {diag && (
        <div style={{ marginTop: 13, padding: "14px 15px", background: "#FDECEC", borderRadius: 8, border: "1px solid #F2C4C4" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
            <AlertTriangle size={15} color={S.red} />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: S.red }}>
              {diag.kind === "none" ? "글자를 읽지 못했습니다" : "할 일을 찾지 못했습니다"}
            </span>
          </div>
          {diag.read && (
            <p style={{ fontSize: 12.5, color: S.muted, margin: "0 0 8px", lineHeight: 1.6 }}>
              읽은 내용 · {diag.read}
            </p>
          )}
          {diag.reason && <p style={{ fontSize: 12.5, color: S.muted, margin: "0 0 8px" }}>{diag.reason}</p>}
          <p style={{ fontSize: 12.5, color: S.ink, margin: 0, lineHeight: 1.75 }}>
            {diag.kind === "none"
              ? "캡처를 더 크게 다시 찍거나, 글자를 직접 복사해서 아래 칸에 붙여넣어 보세요."
              : "안내문이라 마감이 없을 수 있습니다. 달력에서 직접 등록하셔도 됩니다."}
          </p>
        </div>
      )}

      <button onClick={run} disabled={busy} style={{ ...primaryBtn, marginTop: 13 }}>
        {busy ? <Loader size={15} /> : <Camera size={15} />}
        <span style={{ marginLeft: 7 }}>{busy ? "읽는 중" : "읽어서 일정 만들기"}</span>
      </button>

      <div style={{ marginTop: 26, padding: "13px 15px", background: S.gray, borderRadius: 8 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: S.muted, margin: "0 0 7px" }}>이렇게 쓰면 빠릅니다</p>
        <p style={{ fontSize: 12.5, color: S.muted, margin: 0, lineHeight: 1.75 }}>
          공문 화면에서 캡처(Win+Shift+S) 후 이 창에서 Ctrl+V<br />
          카톡 대화 여러 줄을 긁어서 Ctrl+V<br />
          PDF는 그대로 끌어다 놓기<br />
          한글파일은 Ctrl+A → Ctrl+C 해서 붙여넣기
        </p>
      </div>
    </div>
  );
}

function usePopOut() {
  const holder = useRef(null);
  const slot = useRef(null);
  const [out, setOut] = useState(false);
  const supported = typeof window !== "undefined" && "documentPictureInPicture" in window;

  const open = useCallback(async () => {
    if (!supported || !holder.current) return false;
    try {
      const pip = await window.documentPictureInPicture.requestWindow({ width: 360, height: 660 });
      const link = pip.document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css";
      pip.document.head.appendChild(link);
      pip.document.body.style.margin = "0";
      pip.document.body.style.background = "#fff";
      pip.document.body.style.fontFamily = "Pretendard, -apple-system, sans-serif";
      pip.document.title = "오늘 업무";
      pip.document.body.append(holder.current);
      setOut(true);
      pip.addEventListener("pagehide", () => {
        if (slot.current && holder.current) slot.current.append(holder.current);
        setOut(false);
      });
      return true;
    } catch (e) { return false; }
  }, [supported]);

  return { holder, slot, out, open, supported };
}

function PeriodBar({ info, h = 34, max = 86 }) {
  if (!info.row) {
    const k = EV_KIND[info.kind];
    return (
      <div style={{
        padding: "10px 13px", borderRadius: 6, fontSize: 12.5, fontWeight: 600,
        background: k ? k.bg : S.gray, color: k ? k.color : S.faint,
      }}>
        {info.label || "수업 없음"}{k ? ` · 수업 없음` : ""}
      </div>
    );
  }
  return (
    <div>
      {info.label && (
        <p style={{ fontSize: 11.5, fontWeight: 600, margin: "0 0 5px", color: (EV_KIND[info.kind] || {}).color || S.muted }}>
          {info.label}
        </p>
      )}
      <div style={{ display: "flex", gap: 3 }}>
        {info.row.map((v, i) => (
          <div key={i} style={{
            flex: 1, maxWidth: max, height: h, borderRadius: 4, background: v ? S.blueSoft : S.gray,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 9, color: v ? "#6E9CC0" : S.faint }}>{PERIODS[i]}</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: v ? S.blueInk : S.faint }}>{v || "·"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div style={{ fontFamily: "Pretendard, -apple-system, sans-serif", color: S.ink, background: S.gray }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
      {children}
    </div>
  );
}

function Setup({ onDone }) {
  const [f, setF] = useState({ school: "", dept: "", homeroom: true, grade: "3", classNo: "", subject: "", nick: "" });
  const [reg, setReg] = useState(null);
  const [newDept, setNewDept] = useState("");
  const [adding, setAdding] = useState(false);
  const ok = f.school.trim() && f.dept.trim() && f.nick.trim() && (!f.homeroom || (f.grade && f.classNo));

  useEffect(() => { loadRegistry().then(setReg); }, []);

  const typed = f.school.trim();
  const schools = reg ? Object.keys(reg) : [];
  const suggestions = typed ? schools.filter((s) => s.includes(typed) && s !== typed) : schools;
  const entry = reg && reg[typed] ? reg[typed] : null;
  const knownDepts = entry && entry.depts && entry.depts.length ? entry.depts : null;
  const deptList = knownDepts || DEPTS;
  const knownSubjects = entry && entry.subjects ? entry.subjects : [];

  function pickSchool(s) { setF((p) => ({ ...p, school: s, dept: "" })); setAdding(false); }

  return (
    <Shell>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: 430, background: S.bg, borderRadius: 10, padding: 30, border: `1px solid ${S.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
            <School size={20} color={S.brand} />
            <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>처음 설정</h1>
          </div>
          <p style={{ fontSize: 13, color: S.muted, margin: "0 0 22px", lineHeight: 1.6 }}>
            입력한 내용으로 그룹이 자동으로 만들어집니다. 그룹을 따로 만들거나 초대할 필요가 없습니다.
          </p>

          <div style={{ marginBottom: 6 }}>
            <L>학교명</L>
            <input value={f.school} onChange={(e) => setF({ ...f, school: e.target.value, dept: "" })} placeholder="예: 서울미술고등학교" style={inputStyle} />
          </div>

          {reg === null && <p style={{ fontSize: 12, color: S.faint, margin: "0 0 14px" }}>등록된 학교 불러오는 중</p>}
          {reg !== null && suggestions.length > 0 && (
            <div style={{ margin: "0 0 14px" }}>
              <p style={{ fontSize: 11.5, color: S.faint, margin: "0 0 6px" }}>이미 쓰고 있는 학교</p>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {suggestions.slice(0, 6).map((s) => (
                  <button key={s} onClick={() => pickSchool(s)} style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 14, fontSize: 12.5,
                    border: `1px solid ${S.line}`, background: S.bg, color: S.ink, cursor: "pointer", fontFamily: "inherit",
                  }}>
                    <School size={12} color={S.brand} />{s}
                    <span style={{ fontSize: 11, color: S.faint }}>{reg[s].count || 0}명</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {reg !== null && typed && entry && (
            <p style={{ fontSize: 11.5, color: S.green, fontWeight: 600, margin: "0 0 14px" }}>
              이 학교에 {entry.count || 0}명이 이미 쓰고 있습니다
            </p>
          )}
          {reg !== null && typed && !entry && (
            <p style={{ fontSize: 11.5, color: S.muted, margin: "0 0 14px" }}>새 학교입니다. 첫 번째 사용자가 됩니다.</p>
          )}

          <div style={{ marginBottom: 14 }}>
            <L>{knownDepts ? "이 학교에 등록된 부서" : "부서"}</L>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {deptList.map((d) => <Chip key={d} label={d} on={f.dept === d} onClick={() => { setF({ ...f, dept: d }); setAdding(false); }} color={S.blue} />)}
              {!adding && (
                <button onClick={() => setAdding(true)} style={{
                  padding: "5px 11px", borderRadius: 14, fontSize: 12.5, fontWeight: 600, border: `1px dashed #B8B8B8`,
                  background: S.bg, color: S.muted, cursor: "pointer", fontFamily: "inherit",
                }}>+ 직접 입력</button>
              )}
            </div>
            {adding && (
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="새 부서 이름"
                  onKeyDown={(e) => { if (e.key === "Enter" && newDept.trim()) { setF({ ...f, dept: newDept.trim() }); setAdding(false); setNewDept(""); } }}
                  style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => { if (newDept.trim()) { setF({ ...f, dept: newDept.trim() }); setAdding(false); setNewDept(""); } }}
                  style={{ ...ghostBtn, padding: "9px 14px" }}>추가</button>
              </div>
            )}
            {f.dept && !deptList.includes(f.dept) && (
              <p style={{ fontSize: 11.5, color: S.green, fontWeight: 600, margin: "8px 0 0" }}>
                새 부서 &ldquo;{f.dept}&rdquo; 를 만듭니다. 다음 사람부터 목록에 뜹니다.
              </p>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <L>담임 여부</L>
            <div style={{ display: "flex", gap: 6 }}>
              <Seg2 label="담임" on={f.homeroom} onClick={() => setF({ ...f, homeroom: true })} />
              <Seg2 label="비담임" on={!f.homeroom} onClick={() => setF({ ...f, homeroom: false, grade: "", classNo: "" })} />
            </div>
          </div>

          {f.homeroom && (
            <div style={{ background: S.gray, borderRadius: 8, padding: "13px 14px", marginBottom: 14 }}>
              <L>담임 학년</L>
              <div style={{ display: "flex", gap: 6, marginBottom: 13 }}>
                {["1", "2", "3"].map((g) => (
                  <button key={g} onClick={() => setF({ ...f, grade: g })} style={numBtn(f.grade === g, 54)}>{g}학년</button>
                ))}
              </div>
              <L>담임 반</L>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((c) => (
                  <button key={c} onClick={() => setF({ ...f, classNo: c })} style={numBtn(f.classNo === c, 36)}>{c}</button>
                ))}
              </div>
              {f.grade && f.classNo && (
                <p style={{ fontSize: 12.5, fontWeight: 700, color: S.green, margin: "12px 0 0" }}>
                  {f.grade}학년 {f.classNo}반 담임
                </p>
              )}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <L>교과</L>
            <input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="예: 미술" style={inputStyle} />
            {knownSubjects.length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
                {knownSubjects.slice(0, 8).map((s) => (
                  <button key={s} onClick={() => setF({ ...f, subject: s })} style={{
                    padding: "4px 10px", borderRadius: 12, fontSize: 12, border: `1px solid ${S.line}`,
                    background: f.subject === s ? S.blueSoft : S.bg, color: f.subject === s ? S.blueInk : S.muted,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>{s}</button>
                ))}
              </div>
            )}
          </div>

          <F label="별명" v={f.nick} on={(v) => setF({ ...f, nick: v })} ph="이름 대신 쓸 별명" />
          {f.school && (
            <div style={{ background: S.gray, borderRadius: 7, padding: "12px 14px", margin: "6px 0 18px" }}>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: S.muted, margin: "0 0 8px" }}>자동으로 들어갈 그룹</p>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {buildGroups(f).map((g) => (
                  <span key={g.id} style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 12, padding: "3px 9px 3px 6px", borderRadius: 12, background: S.bg, color: KIND_COLOR[g.kind], fontWeight: 600 }}>
                    <Hash size={11} strokeWidth={2.5} />{g.label}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p style={{ fontSize: 11.5, color: S.yellowInk, background: S.yellowSoft, padding: "9px 11px", borderRadius: 6, lineHeight: 1.55, margin: "0 0 16px" }}>
            그룹으로 주고받는 내용은 이 앱을 쓰는 다른 사람에게도 보입니다. 학생 이름이나 개인정보는 넣지 마세요. 캡처로 담은 내 일정은 나만 봅니다.
          </p>
          <button disabled={!ok} onClick={() => onDone({ ...f, school: f.school.trim(), dept: f.dept.trim(), subject: f.subject.trim(), nick: f.nick.trim() })}
            style={{ ...primaryBtn, width: "100%", opacity: ok ? 1 : 0.45 }}>시작하기</button>
        </div>
      </div>
    </Shell>
  );
}

function Sidebar({ me, groups, sel, setSel, view, setView, pending, feed, onReset }) {
  const nav = [
    { k: "clip", label: "담기", Icon: Camera },
    { k: "cal", label: "내 일정", Icon: Calendar },
    { k: "inbox", label: "받은 요청", Icon: Inbox, badge: pending },
    { k: "send", label: "보내기", Icon: Send },
    { k: "sent", label: "보낸 요청", Icon: Users },
    { k: "tt", label: "시간표", Icon: School },
  ];
  return (
    <div style={{ width: 218, background: S.brand, color: "#fff", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div data-drag style={{ padding: "15px 16px 13px", borderBottom: `1px solid ${S.brandHover}` }}>
        <p style={{ fontSize: 14.5, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.school}</p>
        <p style={{ fontSize: 12, color: S.brandText, margin: "3px 0 0" }}>{me.nick} · {me.dept}</p>
        <p style={{ fontSize: 11.5, color: S.brandText, opacity: 0.75, margin: "2px 0 0" }}>{roleLabel(me)}</p>
      </div>
      <div style={{ padding: "10px 8px", flex: 1, overflowY: "auto" }}>
        {nav.map(({ k, label, Icon, badge }) => (
          <button key={k} onClick={() => { setView(k); if (k !== "inbox") setSel(null); }}
            style={{ ...navItem, background: view === k ? S.blue : "transparent", color: view === k ? "#fff" : S.brandText }}>
            <Icon size={15} /><span style={{ flex: 1, textAlign: "left" }}>{label}</span>
            {badge > 0 && <span style={badgeStyle}>{badge}</span>}
          </button>
        ))}
        <p style={{ fontSize: 11, fontWeight: 700, color: S.brandText, margin: "16px 0 6px", padding: "0 10px" }}>내 그룹</p>
        {groups.map((g) => {
          const n = feed.filter((m) => m.gid === g.id && m.from !== me.nick).length;
          const on = view === "inbox" && sel === g.id;
          return (
            <button key={g.id} onClick={() => { setView("inbox"); setSel(sel === g.id ? null : g.id); }}
              style={{ ...navItem, background: on ? S.blue : "transparent", color: on ? "#fff" : S.brandText }}>
              <Hash size={14} strokeWidth={2.5} />
              <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
              {n > 0 && <span style={{ fontSize: 11, opacity: 0.7 }}>{n}</span>}
            </button>
          );
        })}
      </div>
      <button onClick={onReset} style={{ ...navItem, margin: 8, color: S.brandText, fontSize: 12 }}>설정 다시 하기</button>
    </div>
  );
}

function TopBar({ me, dayInfo, onWidget, onSync, syncing }) {
  const info = dayInfo(TODAY);
  return (
    <div style={{ borderBottom: `1px solid ${S.line}`, background: S.bg, padding: "10px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{fmtK(TODAY)}</span>
        <span style={{ fontSize: 12.5, color: S.muted }}>{roleLabel(me)}{me.subject ? ` · ${me.subject}과` : ""}</span>
        <button onClick={onSync} style={{ ...iconBtn, marginLeft: "auto" }} aria-label="새로고침"><RefreshCw size={15} color={syncing ? S.blue : S.muted} /></button>
        <button onClick={onWidget} style={iconBtn} aria-label="위젯 모드"><PanelRightClose size={15} color={S.muted} /></button>
      </div>
      <PeriodBar info={info} />
    </div>
  );
}

function InboxView({ msgs, items, setItems, groups, sel }) {
  const g = (id) => groups.find((x) => x.id === id) || { label: "", kind: "school" };
  if (msgs.length === 0) return <Empty title="받은 요청이 없습니다" sub={sel ? "이 그룹에 아직 아무도 보내지 않았습니다." : "같은 학교 선생님이 보내면 여기에 도착합니다."} />;
  return (
    <div style={{ padding: "8px 0" }}>
      {msgs.map((m) => {
        const reg = items.find((i) => i.src === m.id);
        const gg = g(m.gid);
        return (
          <div key={m.id} style={{ display: "flex", gap: 11, padding: "12px 18px", borderBottom: `1px solid ${S.line}` }}>
            <div style={{ width: 36, height: 36, borderRadius: 6, background: KIND_COLOR[gg.kind], color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{m.from.slice(0, 1)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{m.from}</span>
                {m.role && <span style={{ fontSize: 11.5, color: S.muted }}>{m.role}</span>}
                <span style={{ fontSize: 11.5, color: KIND_COLOR[gg.kind], display: "flex", alignItems: "center", gap: 1, fontWeight: 600 }}><Hash size={10} strokeWidth={2.5} />{gg.label}</span>
                <span style={{ fontSize: 11.5, color: S.faint, marginLeft: "auto" }}>{m.due ? `${fmtShort(m.due)} 마감` : "마감 없음"}</span>
              </div>
              <p style={{ fontSize: 14.5, fontWeight: 600, margin: "3px 0 0" }}>{m.title}</p>
              {m.body && <p style={{ fontSize: 13.5, color: S.muted, margin: "3px 0 0", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{m.body}</p>}
              <div style={{ marginTop: 9 }}>
                {reg ? <span style={{ fontSize: 12, color: S.green, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}><Check size={13} strokeWidth={3} /> 내 일정에 등록됨</span>
                  : <button onClick={() => setItems((p) => [...p, { id: uid(), src: m.id, title: m.title, who: m.from, dept: gg.label, due: m.due || TODAY, done: false }])} style={actBtnGreen}><Calendar size={13} /> 일정으로 등록</button>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Composer({ me, groups, push, onSent }) {
  const [gid, setGid] = useState(groups[0] ? groups[0].id : "");
  const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  const [due, setDue] = useState(addDays(TODAY, 3)); const [busy, setBusy] = useState(false);
  async function send() {
    if (!title.trim() || !gid) return;
    setBusy(true);
    await push({ id: uid(), gid, from: me.nick, role: me.dept, title: title.trim(), body: body.trim(), due, at: new Date().toISOString() });
    setTitle(""); setBody(""); setBusy(false); onSent();
  }
  return (
    <div style={{ padding: "22px 20px", maxWidth: 620 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 5px" }}>요청 보내기</h2>
      <p style={{ fontSize: 13, color: S.muted, margin: "0 0 20px", lineHeight: 1.6 }}>마감일이 필수입니다. 받는 쪽에서는 한 번 눌러 바로 일정이 됩니다.</p>
      <L>어느 그룹으로</L>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {groups.map((g) => <Chip key={g.id} label={g.label} on={gid === g.id} onClick={() => setGid(g.id)} color={KIND_COLOR[g.kind]} />)}
      </div>
      <F label="요청 내용" v={title} on={setTitle} ph="예: 진로희망 조사 명단 취합" />
      <div style={{ marginBottom: 14 }}>
        <L>덧붙일 말 (선택)</L>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="양식이나 제출처 등" style={{ ...inputStyle, minHeight: 84, lineHeight: 1.6, resize: "vertical" }} />
      </div>
      <div style={{ marginBottom: 20, maxWidth: 220 }}>
        <L>마감 · {rel(due)}</L>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={inputStyle} />
      </div>
      <button onClick={send} disabled={busy || !title.trim()} style={{ ...primaryBtn, opacity: title.trim() ? 1 : 0.45 }}>
        {busy ? <Loader size={15} /> : <Send size={15} />}<span style={{ marginLeft: 7 }}>보내기</span>
      </button>
    </div>
  );
}

function SentList({ msgs, groups }) {
  const gname = (id) => (groups.find((g) => g.id === id) || {}).label || "다른 그룹";
  if (msgs.length === 0) return <Empty title="보낸 요청이 없습니다" sub="보내기에서 그룹을 골라 요청을 보내보세요." />;
  return (
    <div style={{ padding: "8px 0" }}>
      {msgs.map((m) => (
        <div key={m.id} style={{ padding: "12px 18px", borderBottom: `1px solid ${S.line}` }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 11.5, color: S.blue, fontWeight: 600, display: "flex", alignItems: "center", gap: 1 }}><Hash size={10} strokeWidth={2.5} />{gname(m.gid)}</span>
            <span style={{ fontSize: 11.5, color: S.faint, marginLeft: "auto" }}>{m.due ? `${fmtShort(m.due)} 마감` : ""}</span>
          </div>
          <p style={{ fontSize: 14.5, fontWeight: 600, margin: "4px 0 0" }}>{m.title}</p>
          {m.body && <p style={{ fontSize: 13, color: S.muted, margin: "3px 0 0" }}>{m.body}</p>}
        </div>
      ))}
    </div>
  );
}

function CalView({ items, setItems, dayInfo, events }) {
  const [mode, setMode] = useState("week");
  const [cur, setCur] = useState(TODAY);
  const [sel, setSel] = useState(TODAY);
  const [adding, setAdding] = useState(null);
  const open = items.filter((i) => !i.done);
  const on = (d) => open.filter((i) => i.due === d);


  const b = parseISO(cur), y = b.getFullYear(), m = b.getMonth();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const cells = Array(lead).fill(null);
  const last = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= last; d++) cells.push(iso(new Date(y, m, d)));
  const ws = startOfWeek(cur);
  const weekDays = [0, 1, 2, 3, 4].map((n) => addDays(ws, n));

  function add(date, o) {
    setItems((p) => [...p, { id: uid(), title: o.title, who: o.who || "직접 입력", dept: o.dept || "기타", due: date, done: false }]);
    setAdding(null);
  }

  return (
    <div style={{ padding: "18px 20px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 5 }}>
          <Seg3 label="주별" on={mode === "week"} onClick={() => setMode("week")} />
          <Seg3 label="월별" on={mode === "month"} onClick={() => setMode("month")} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <button onClick={() => setCur(mode === "week" ? addDays(cur, -7) : iso(new Date(y, m - 1, 1)))} style={iconBtn} aria-label="이전"><ChevronLeft size={16} /></button>
          <span style={{ fontSize: 14.5, fontWeight: 700, minWidth: 148, textAlign: "center" }}>
            {mode === "week" ? `${fmtShort(ws)} ~ ${fmtShort(addDays(ws, 4))}` : `${y}년 ${m + 1}월`}
          </span>
          <button onClick={() => setCur(mode === "week" ? addDays(cur, 7) : iso(new Date(y, m + 1, 1)))} style={iconBtn} aria-label="다음"><ChevronRight size={16} /></button>
          <button onClick={() => { setCur(TODAY); setSel(TODAY); }} style={{ ...ghostBtn, padding: "6px 13px", fontSize: 12.5, marginLeft: 4 }}>오늘</button>
        </div>
      </div>

      {mode === "week" ? (
        <div style={{ maxWidth: 780 }}>
          {weekDays.map((d) => {
            const list = on(d);
            const info = dayInfo(d);
            const isT = d === TODAY;
            return (
              <div key={d} style={{ border: `1px solid ${isT ? S.blue : S.line}`, borderRadius: 9, padding: 14, marginBottom: 10, background: S.bg }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: isT ? S.blue : S.ink }}>{fmtK(d)}</span>
                  {isT && <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: S.blue, padding: "2px 7px", borderRadius: 4 }}>오늘</span>}
                  {list.length > 0 && <span style={{ fontSize: 11.5, color: S.red, fontWeight: 600 }}>마감 {list.length}건</span>}
                  <button onClick={() => setAdding(adding === d ? null : d)} style={{ ...actBtnGreen, marginLeft: "auto" }}>
                    <Plus size={13} /> 일정 추가
                  </button>
                </div>
                <div style={{ marginBottom: list.length || adding === d ? 11 : 0 }}>
                  <PeriodBar info={info} />
                </div>
                {list.map((it) => <Row key={it.id} it={it} setItems={setItems} />)}
                {adding === d && <AddInline date={d} onAdd={add} onClose={() => setAdding(null)} />}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div style={{ width: 480 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
              {["월", "화", "수", "목", "금", "토", "일"].map((d, i) => (
                <div key={d} style={{ textAlign: "center", fontSize: 11.5, fontWeight: 700, color: i > 4 ? S.faint : S.muted, padding: "6px 0" }}>{d}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
              {cells.map((d, i) => !d ? <div key={i} style={{ height: 74 }} /> : (
                <button key={i} onClick={() => setSel(d)} style={{
                  height: 74, border: `1.5px solid ${d === sel ? S.blue : "transparent"}`, borderRadius: 7, cursor: "pointer",
                  fontFamily: "inherit", padding: "5px 4px", background: d === TODAY ? S.blueSoft : S.bg,
                  display: "flex", flexDirection: "column", alignItems: "stretch", gap: 3, overflow: "hidden",
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 3, paddingLeft: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: d === TODAY ? 700 : 500, color: parseISO(d).getDay() % 6 === 0 ? S.faint : S.ink }}>
                      {parseISO(d).getDate()}
                    </span>
                    {(() => { const k = dayInfo(d).kind; const m2 = EV_KIND[k];
                      return m2 && k !== "event" ? <span style={{ fontSize: 8.5, fontWeight: 700, color: m2.color, background: m2.bg, borderRadius: 3, padding: "1px 3px" }}>{m2.label}</span> : null; })()}
                  </span>
                  {on(d).slice(0, 2).map((it) => (
                    <span key={it.id} style={{ fontSize: 10, background: "#FCE7EE", color: "#9B1740", borderRadius: 3, padding: "2px 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>
                      {it.title}
                    </span>
                  ))}
                  {on(d).length > 2 && <span style={{ fontSize: 9.5, color: S.faint, textAlign: "left", paddingLeft: 3 }}>+{on(d).length - 2}</span>}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 11 }}>
              <span style={{ fontSize: 14.5, fontWeight: 700 }}>{fmtK(sel)}</span>
              <button onClick={() => setAdding(adding === sel ? null : sel)} style={{ ...actBtnGreen, marginLeft: "auto" }}>
                <Plus size={13} /> 일정 추가
              </button>
            </div>
            <div style={{ marginBottom: 12 }}><PeriodBar info={dayInfo(sel)} h={32} max={999} /></div>
            {adding === sel && <AddInline date={sel} onAdd={add} onClose={() => setAdding(null)} />}
            {on(sel).length === 0 && adding !== sel && <p style={{ fontSize: 13, color: S.faint }}>일정 없음</p>}
            {on(sel).map((it) => <Row key={it.id} it={it} setItems={setItems} />)}

            <p style={{ fontSize: 13, fontWeight: 700, margin: "24px 0 8px" }}>다가오는 일정 {open.length}건</p>
            {[...open].sort((a, b2) => a.due.localeCompare(b2.due)).slice(0, 10).map((it) => <Row key={it.id} it={it} setItems={setItems} compact />)}
          </div>
        </div>
      )}
    </div>
  );
}

function AddInline({ date, onAdd, onClose }) {
  const [title, setTitle] = useState("");
  const [who, setWho] = useState("");
  const [dept, setDept] = useState("기타");
  return (
    <div style={{ background: S.gray, borderRadius: 8, padding: 13, margin: "4px 0 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: S.muted }}>{fmtK(date)}에 추가</span>
        <button onClick={onClose} style={{ ...iconBtn, marginLeft: "auto", width: 22, height: 22 }} aria-label="닫기"><X size={13} color={S.faint} /></button>
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="할 일"
        onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) onAdd(date, { title: title.trim(), who, dept }); }}
        style={{ ...inputStyle, marginBottom: 8 }} autoFocus />
      <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="요청자 (선택)" style={{ ...inputStyle, marginBottom: 9 }} />
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 11 }}>
        {DEPTS.map((d) => <Chip key={d} label={d} on={dept === d} onClick={() => setDept(d)} color={S.blue} />)}
      </div>
      <button onClick={() => title.trim() && onAdd(date, { title: title.trim(), who, dept })}
        style={{ ...primaryBtn, padding: "9px 18px", fontSize: 13.5, opacity: title.trim() ? 1 : 0.45 }}>추가</button>
    </div>
  );
}

function Row({ it, setItems, compact }) {
  const soon = diffDays(TODAY, it.due) <= 1;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: compact ? "none" : `1px solid ${S.line}` }}>
      {compact && <span style={{ fontSize: 11.5, fontWeight: 700, color: soon ? S.red : S.muted, width: 50 }}>{fmtShort(it.due)}</span>}
      {!compact && <span style={{ width: 5, height: 5, borderRadius: 3, background: S.red, flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, margin: 0, fontWeight: soon ? 600 : 400 }}>{it.title}</p>
        <p style={{ fontSize: 11.5, color: S.faint, margin: "2px 0 0" }}>{it.who}{it.dept ? ` · ${it.dept}` : ""}{it.note ? ` · ${it.note}` : ""}</p>
      </div>
      <button onClick={() => setItems((p) => p.map((x) => (x.id === it.id ? { ...x, done: true } : x)))} style={iconBtn} aria-label="완료">
        <Check size={14} color={S.green} strokeWidth={3} />
      </button>
    </div>
  );
}

function Seg3({ label, on, onClick }) {
  return <button onClick={onClick} style={{
    padding: "7px 16px", borderRadius: 16, fontSize: 12.5, fontWeight: on ? 700 : 500,
    border: `1px solid ${on ? S.ink : S.line}`, background: on ? S.ink : S.bg,
    color: on ? "#fff" : S.muted, cursor: "pointer", fontFamily: "inherit",
  }}>{label}</button>;
}

function SchoolTab({ tt, setTt, events, setEvents }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [read, setRead] = useState("");
  const ttRef = useRef();
  const calRef = useRef();

  async function sync(file, what) {
    setBusy(what); setErr(""); setRead("");
    const info = await inspect(file);
    if (!info.ok) {
      setErr(`${info.name} · ${info.msg}${info.kind === "hwp" ? ". 한글에서 Ctrl+A → Ctrl+C 한 뒤 PDF로 저장하거나, 엑셀·워드로 바꿔서 넣어 주세요." : ""}`);
      setBusy(""); return;
    }
    try {
      const b = await toBlock(file);
      const parts = [];
      let extra = "";
      if (b.kind === "text") extra = `\n\n자료:\n${b.text}`;
      else if (b.block) parts.push(b.block);

      if (what === "tt") {
        parts.push({ type: "text", text: `한국 고등학교 교사의 개인 주간 시간표다. 월~금 각 요일 1~7교시에 담당 학급을 "학년-반" 형식으로 넣어라. 수업 없는 교시는 빈 문자열.

JSON 객체 하나만. 설명 없이.
{"read":"읽어낸 내용 60자 이내","월":["3-2","","2-1","","","1-4",""],"화":[],"수":[],"목":[],"금":[]}
각 요일 배열은 정확히 7개 문자열.${extra}` });
        const p2 = await askClaude(parts);
        const clean = {};
        DAYS.forEach((d) => {
          const a = Array.isArray(p2[d]) ? p2[d].slice(0, 7) : [];
          while (a.length < 7) a.push("");
          clean[d] = a.map((v) => String(v || "").slice(0, 6));
        });
        setTt(clean);
        setRead(p2.read || "시간표를 채웠습니다");
      } else {
        parts.push({ type: "text", text: `한국 고등학교 학사일정표다. 오늘은 ${TODAY}. 오늘부터 300일 안의 일정만 뽑아라.

JSON 객체 하나만. 설명 없이.
{"read":"읽어낸 내용 60자 이내","events":[{"start":"YYYY-MM-DD","end":"YYYY-MM-DD","name":"일정명 20자 이내","kind":"off","swap":"수"}]}

kind 는 아래 넷 중 하나
- off: 방학, 재량휴업일, 공휴일, 개교기념일 등 학교에 나오지 않는 날
- exam: 중간고사, 기말고사, 모의고사 등 정규 시간표가 아닌 날
- swap: 요일변동일. 그날 운영하는 요일을 swap 에 월/화/수/목/금 중 하나로
- event: 그 밖의 행사. 수업은 정상 운영

규칙
- 방학처럼 기간이면 start 와 end 를 모두 채운다. 하루면 end 를 start 와 같게
- 연도가 없으면 오늘 기준 가장 가까운 미래로
- swap 이 아니면 swap 키는 넣지 않는다${extra}` });
        const p2 = await askClaude(parts);
        const list = Array.isArray(p2) ? p2 : (p2.events || []);
        const ok = list.filter((e) => e && e.start && e.name)
          .map((e) => ({ start: e.start, end: e.end || e.start, name: String(e.name).slice(0, 20), kind: EV_KIND[e.kind] ? e.kind : "event", swap: e.swap }));
        setEvents(ok);
        setRead(p2.read || `${ok.length}건을 넣었습니다`);
      }
    } catch (e) { setErr("읽지 못했습니다. 다른 형식으로 넣어 보세요."); }
    setBusy("");
  }

  const upcoming = [...events].sort((a, b) => a.start.localeCompare(b.start));

  return (
    <div style={{ padding: "22px 20px", maxWidth: 660 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 5px" }}>주간 시간표</h2>
      <p style={{ fontSize: 12.5, color: S.muted, margin: "0 0 14px" }}>칸을 눌러 직접 고치거나, 시간표 파일을 넣으세요.</p>
      <div style={{ display: "flex", gap: 4, marginBottom: 5, paddingLeft: 24 }}>
        {PERIODS.map((p) => <div key={p} style={{ flex: 1, textAlign: "center", fontSize: 11, color: S.faint }}>{p}</div>)}
      </div>
      {DAYS.map((d) => (
        <div key={d} style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 4 }}>
          <div style={{ width: 20, fontSize: 12, fontWeight: 600, color: S.muted }}>{d}</div>
          {tt[d].map((v, pi) => (
            <input key={pi} value={v} maxLength={6} placeholder="·"
              onChange={(e) => setTt((prev) => ({ ...prev, [d]: prev[d].map((x, i) => (i === pi ? e.target.value : x)) }))}
              style={{ flex: 1, minWidth: 0, height: 38, borderRadius: 5, border: "none", textAlign: "center", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", background: v ? S.blueSoft : S.gray, color: v ? S.blueInk : S.faint, padding: 0 }}
              aria-label={`${d}요일 ${pi + 1}교시`} />
          ))}
        </div>
      ))}
      <FileBtn inputRef={ttRef} onPick={(f) => sync(f, "tt")} loading={busy === "tt"} text="시간표 파일 넣기" />

      <div style={{ height: 30 }} />

      <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 5px" }}>학사일정</h2>
      <p style={{ fontSize: 12.5, color: S.muted, margin: "0 0 14px", lineHeight: 1.6 }}>
        PDF, 엑셀, 워드, 캡처 모두 됩니다. 방학과 고사 기간은 시간표가 나오지 않게 처리됩니다.
      </p>
      {upcoming.length === 0 && <p style={{ fontSize: 13, color: S.faint, margin: "0 0 10px" }}>등록된 일정이 없습니다</p>}
      {upcoming.map((e, i) => {
        const k = EV_KIND[e.kind] || EV_KIND.event;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${S.line}` }}>
            <span style={{ fontSize: 12, color: S.muted, width: 104, fontVariantNumeric: "tabular-nums" }}>
              {fmtShort(e.start)}{e.end && e.end !== e.start ? ` ~ ${fmtShort(e.end)}` : ""}
            </span>
            <span style={{ fontSize: 13.5, flex: 1 }}>{e.name}</span>
            {e.swap && <span style={{ fontSize: 11, color: S.blueInk, background: S.blueSoft, borderRadius: 4, padding: "2px 7px", fontWeight: 600 }}>{e.swap}요일</span>}
            <span style={{ fontSize: 11, color: k.color, background: k.bg, borderRadius: 4, padding: "2px 8px", fontWeight: 700 }}>{k.label}</span>
            <button onClick={() => setEvents((p) => p.filter((_, j) => j !== i))} style={{ ...iconBtn, width: 22, height: 22 }} aria-label="빼기">
              <X size={12} color={S.faint} />
            </button>
          </div>
        );
      })}
      <FileBtn inputRef={calRef} onPick={(f) => sync(f, "cal")} loading={busy === "cal"} text="학사일정 파일 넣기" />

      {read && <p style={{ fontSize: 12.5, color: S.green, background: "#E8F5F0", borderRadius: 6, padding: "9px 12px", margin: "11px 0 0" }}>읽은 내용 · {read}</p>}
      {err && <p style={{ fontSize: 12.5, color: S.red, background: "#FDECEC", borderRadius: 6, padding: "9px 12px", margin: "11px 0 0", lineHeight: 1.6 }}>{err}</p>}
      <p style={{ fontSize: 12, color: S.faint, marginTop: 16, lineHeight: 1.6 }}>
        실제 앱에서는 나이스 API가 시간표와 학사일정을 자동으로 채웁니다.
      </p>
    </div>
  );
}

function FileBtn({ onPick, inputRef, loading, text }) {
  return (
    <>
      <input ref={inputRef} type="file" accept="image/*,.pdf,.xlsx,.xls,.docx,.txt,.csv,.hwp"
        onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onPick(f); e.target.value = ""; }} style={{ display: "none" }} />
      <button onClick={() => inputRef.current.click()} disabled={loading}
        style={{ ...ghostBtn, width: "100%", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
        {loading ? <Loader size={15} /> : <Upload size={15} />}{loading ? "읽는 중" : text}
      </button>
    </>
  );
}

function WidgetPanel({ dayInfo, items, inbox, setItems, pinned }) {
  const info = dayInfo(TODAY);
  const open = [...items.filter((i) => !i.done)].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
  const pend = inbox.filter((m) => !items.some((i) => i.src === m.id));
  return (
    <Shell>
      <div style={{ width: 320, minHeight: "100vh", background: S.bg, borderRight: `1px solid ${S.line}` }}>
        <div data-drag style={{ background: S.brand, color: "#fff", padding: "11px 13px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{fmtK(TODAY)}</span>
          {pinned && <Pin size={13} color="#CFC3CF" style={{ marginLeft: "auto" }} />}
        </div>
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${S.line}` }}>
          <PeriodBar info={info} h={32} max={999} />
        </div>
        {pend.length > 0 && (
          <div style={{ padding: "11px 13px", borderBottom: `1px solid ${S.line}`, background: "#FFF9F0" }}>
            <p style={{ fontSize: 11.5, fontWeight: 700, color: S.yellowInk, margin: "0 0 8px" }}>등록 안 한 요청 {pend.length}건</p>
            {pend.slice(0, 3).map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                <span style={{ fontSize: 12.5, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</span>
                <button onClick={() => setItems((p) => [...p, { id: uid(), src: m.id, title: m.title, who: m.from, dept: m.role || "", due: m.due || TODAY, done: false }])}
                  style={{ ...actBtnGreen, padding: "3px 8px", fontSize: 11 }}>등록</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ padding: "11px 13px" }}>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: S.muted, margin: "0 0 9px" }}>다가오는 일정</p>
          {open.length === 0 && <p style={{ fontSize: 12.5, color: S.faint, margin: 0 }}>없습니다</p>}
          {open.map((it) => {
            const soon = diffDays(TODAY, it.due) <= 1;
            return (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: soon ? S.red : S.muted, width: 42 }}>{rel(it.due)}</span>
                <span style={{ fontSize: 12.5, flex: 1, fontWeight: soon ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
                <button onClick={() => setItems((p) => p.map((x) => (x.id === it.id ? { ...x, done: true } : x)))} style={iconBtn} aria-label="완료">
                  <Check size={13} color={S.green} strokeWidth={3} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}

function Empty({ title, sub }) {
  return <div style={{ textAlign: "center", padding: "70px 24px" }}>
    <p style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>{title}</p>
    <p style={{ fontSize: 13, color: S.muted, margin: 0 }}>{sub}</p>
  </div>;
}
function L({ children }) { return <p style={{ fontSize: 12, fontWeight: 600, color: S.muted, margin: "0 0 6px" }}>{children}</p>; }
function F({ label, v, on, ph }) { return <div style={{ marginBottom: 14 }}><L>{label}</L><input value={v} onChange={(e) => on(e.target.value)} placeholder={ph} style={inputStyle} /></div>; }
function Chip({ label, on, onClick, color }) {
  return <button onClick={onClick} style={{
    display: "flex", alignItems: "center", gap: 2, padding: "5px 11px 5px 8px", borderRadius: 14, fontSize: 12.5,
    fontWeight: on ? 700 : 500, border: `1px solid ${on ? color : S.line}`, background: on ? color : S.bg,
    color: on ? "#fff" : S.muted, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
  }}><Hash size={11} strokeWidth={2.5} />{label}</button>;
}

function Seg2({ label, on, onClick }) {
  return <button onClick={onClick} style={{
    flex: 1, padding: "9px 0", borderRadius: 6, fontSize: 13.5, fontWeight: on ? 700 : 500,
    border: `1px solid ${on ? S.green : "#C8C8C8"}`, background: on ? S.green : S.bg,
    color: on ? "#fff" : S.muted, cursor: "pointer", fontFamily: "inherit",
  }}>{label}</button>;
}
const numBtn = (on, w) => ({
  width: w, padding: "7px 0", borderRadius: 6, fontSize: 12.5, fontWeight: on ? 700 : 500,
  border: `1px solid ${on ? S.blue : "#D4D4D4"}`, background: on ? S.blue : S.bg,
  color: on ? "#fff" : S.muted, cursor: "pointer", fontFamily: "inherit",
});

const navItem = { display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "7px 10px", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13.5, fontFamily: "inherit", marginBottom: 1 };
const badgeStyle = { background: S.red, color: "#fff", fontSize: 10.5, fontWeight: 700, minWidth: 17, height: 17, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" };
const inputStyle = { width: "100%", padding: "9px 11px", fontSize: 14, border: "1px solid #B8B8B8", borderRadius: 6, background: S.bg, color: S.ink, fontFamily: "inherit", boxSizing: "border-box" };
const bare = { border: "none", background: "transparent", padding: "2px 0", fontFamily: "inherit", color: S.ink, outline: "none", borderBottom: "1px solid transparent" };
const iconBtn = { width: 28, height: 28, border: "none", borderRadius: 5, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 };
const actBtnGreen = { display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", fontSize: 12, fontWeight: 600, border: "1px solid #B8DDCE", borderRadius: 5, background: S.bg, color: S.green, cursor: "pointer", fontFamily: "inherit" };
const primaryBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "11px 20px", fontSize: 14.5, fontWeight: 700, border: "none", borderRadius: 6, background: S.green, color: "#fff", cursor: "pointer", fontFamily: "inherit" };
const ghostBtn = { display: "inline-flex", alignItems: "center", padding: "10px 16px", fontSize: 13.5, fontWeight: 600, border: "1px solid #B8B8B8", borderRadius: 6, background: S.bg, color: S.muted, cursor: "pointer", fontFamily: "inherit" };
