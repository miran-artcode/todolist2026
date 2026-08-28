// 문서 읽기(extract.js)와 규칙 분석(scan.js)을 눈으로 확인하는 점검 도구.
// 실행: node web/read-check.mjs
import { pdfToText, hwpxToText, readZip, looksReadable } from "./src/extract.js";
import { scanTasks, scanEvents, scanTimetable, findDates } from "./src/scan.js";

const TODAY = "2026-08-28"; // 금요일. 결과가 날마다 달라지지 않게 고정해 둔다.
let bad = 0;
const ok = (name, cond, got) => {
  if (!cond) bad++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : ` → ${JSON.stringify(got)}`}`);
};

// ── 규칙 분석 ───────────────────────────────────────────

const 공문 = `[교무기획-2451] 2026학년도 진로체험 수요조사 제출
관련: 서울특별시교육청 진로직업교육과-1234
1. 위 호와 관련하여 2026학년도 진로체험 수요조사를 아래와 같이 실시합니다.
2. 담임 선생님께서는 학급별 수요조사표를 작성하여 제출하여 주시기 바랍니다.
제출기한: 2026. 9. 11.(금) 16:00
제출방법: 업무포털 첨부
담당: 진로부 김민수`;

let r = scanTasks(공문, { today: TODAY });
ok("공문에서 1건", r.tasks.length === 1, r.tasks);
ok("마감 2026-09-11", r.tasks[0] && r.tasks[0].due === "2026-09-11", r.tasks[0]);
ok("제목에 수요조사", /수요조사/.test((r.tasks[0] || {}).title), (r.tasks[0] || {}).title);
ok("부서 진로부", (r.tasks[0] || {}).dept === "진로부", (r.tasks[0] || {}).dept);
ok("담당 김민수", /김민수/.test((r.tasks[0] || {}).who || ""), (r.tasks[0] || {}).who);
ok("제출방법 note", /업무포털/.test((r.tasks[0] || {}).note || ""), (r.tasks[0] || {}).note);
ok("근거 있음", /제출기한/.test((r.tasks[0] || {}).evidence || ""), (r.tasks[0] || {}).evidence);

r = scanTasks("샘 담주 화까지 우리 반 봉사시간 정리해서 저한테 주실 수 있어요? 학년부에서 취합한대요", { today: TODAY });
ok("담주 화 → 2026-09-01", r.tasks[0] && r.tasks[0].due === "2026-09-01", r.tasks);
ok("메신저도 부서를 본다", (r.tasks[0] || {}).dept === "학년부", (r.tasks[0] || {}).dept);

r = scanTasks("9월 교직원 협의회 안내 - 9월 3일 15시 시청각실입니다", { today: TODAY });
ok("마감 없는 안내도 참석으로", r.tasks[0] && r.tasks[0].due === "2026-09-03", r.tasks);
ok("참석이 붙는다", /참석/.test((r.tasks[0] || {}).title || ""), (r.tasks[0] || {}).title);

r = scanTasks("생활기록부 점검 결과 제출기한: 2026. 9. 12.(토)", { today: TODAY });
ok("토요일 마감은 금요일로", r.tasks[0] && r.tasks[0].due === "2026-09-11", r.tasks);

r = scanTasks(`2학기 업무 안내
1. 학급 명렬표 정리 - 제출기한: 9. 4.(금)
2. 방과후 신청서 취합 - 제출기한: 9. 18.(금)
3. 학부모 상담 주간 운영: 9. 21. ~ 9. 25.`, { today: TODAY });
ok("여러 건을 각각", r.tasks.length >= 2, r.tasks.map((x) => `${x.title}/${x.due}`));
ok("첫 건 9-4", r.tasks[0] && r.tasks[0].due === "2026-09-04", r.tasks[0]);
ok("둘째 건 9-18", r.tasks[1] && r.tasks[1].due === "2026-09-18", r.tasks[1]);

r = scanTasks("3-2 반 명렬표 파일입니다. 참고하세요", { today: TODAY });
ok("학급 번호를 날짜로 안 읽음", r.tasks.length === 0, r.tasks);

r = scanTasks("제출기한: 2026. 9. 8. ~ 2026. 9. 11.", { today: TODAY });
ok("기간이면 끝날이 마감", r.tasks.length === 1 && r.tasks[0].due === "2026-09-11", r.tasks);

r = scanTasks("", { today: TODAY });
ok("빈 글은 none", r.quality === "none" && r.tasks.length === 0, r);

ok("전화번호는 날짜가 아니다", findDates("문의 02-3999-1234", TODAY).length === 0, findDates("문의 02-3999-1234", TODAY));

// ── 학사일정·시간표 ─────────────────────────────────────

const 일정 = `2026학년도 2학기 학사일정
2학기 중간고사 10. 12. ~ 10. 14.
재량휴업일 10. 9.
겨울방학 2027. 1. 5. ~ 2027. 2. 10.
학교 축제 11. 20.`;
const ev = scanEvents(일정, { today: TODAY });
ok("일정 4건", ev.events.length === 4, ev.events);
ok("고사로 분류", (ev.events.find((e) => /중간고사/.test(e.name)) || {}).kind === "exam", ev.events[0]);
ok("휴업일로 분류", (ev.events.find((e) => /재량/.test(e.name)) || {}).kind === "off", ev.events[1]);
ok("방학 기간 끝날", (ev.events.find((e) => /방학/.test(e.name)) || {}).end === "2027-02-10", ev.events[2]);

const tt = scanTimetable(`교시,월,화,수,목,금
1,3-2,2-4,3-5,3-1,
2,3-5,,2-1,3-2,2-1
3,,3-1,3-2,,3-5`);
ok("시간표 가로 표", tt && tt.월[0] === "3-2" && tt.금[1] === "2-1", tt);
ok("교시는 7칸", tt && tt.월.length === 7, tt && tt.월);

const tt2 = scanTimetable(`월,3-2,3-5,,2-1,3-2,,1-3
화,2-4,,3-1,3-5,2-1,1-3,
수,3-5,2-1,3-2,,1-3,,2-4`);
ok("시간표 세로 표", tt2 && tt2.화[2] === "3-1", tt2);

// ── PDF ─────────────────────────────────────────────────

function buildPdf(objs) {
  let out = "%PDF-1.4\n";
  objs.forEach((o, i) => { out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  out += `trailer<</Root 1 0 R>>\n%%EOF`;
  return new TextEncoder().encode(out);
}

const body = "BT /F1 12 Tf 72 700 Td (2026. 9. 11. deadline for the annual survey) Tj ET";
const plain = buildPdf([
  "<</Type/Catalog/Pages 2 0 R>>",
  "<</Type/Pages/Kids[3 0 R]/Count 1>>",
  "<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>",
  `<</Length ${body.length}>>stream\n${body}\nendstream`,
  "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
]);
let text = await pdfToText(plain);
ok("PDF 글자 읽기", /deadline for the annual survey/.test(text), text);

// 한글 PDF 는 글꼴마다 붙은 번호표(ToUnicode)를 따라가야 읽힌다.
const 한글 = "2026학년도 진로체험 수요조사 제출기한 9월 11일까지";
const hex4 = (n) => n.toString(16).padStart(4, "0");
const cmap = `/CIDInit /ProcSet findresource begin
1 begincodespacerange <0000> <FFFF> endcodespacerange
${한글.length} beginbfchar
${[...한글].map((c, i) => `<${hex4(i + 3)}> <${hex4(c.charCodeAt(0))}>`).join("\n")}
endbfchar
endcmap`;
const kbody = `BT /F1 12 Tf 72 700 Td <${[...한글].map((c, i) => hex4(i + 3)).join("")}> Tj ET`;
const korean = buildPdf([
  "<</Type/Catalog/Pages 2 0 R>>",
  "<</Type/Pages/Kids[3 0 R]/Count 1>>",
  "<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>",
  `<</Length ${kbody.length}>>stream\n${kbody}\nendstream`,
  "<</Type/Font/Subtype/Type0/Encoding/Identity-H/BaseFont/Batang/ToUnicode 6 0 R>>",
  `<</Length ${cmap.length}>>stream\n${cmap}\nendstream`,
]);
text = await pdfToText(korean);
ok("한글 PDF 읽기", text.includes(한글), text);
ok("한글 PDF → 할 일", scanTasks(text, { today: TODAY }).tasks[0]?.due === "2026-09-11", scanTasks(text, { today: TODAY }).tasks);

// 요즘 공문 PDF 는 내용이 압축돼 있고 글꼴 정보는 객체 모음(ObjStm) 안에 들어 있다.
async function deflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const enc = new TextEncoder();
const packed = await deflate(enc.encode(kbody));
const objstmBody = `5 0 <</Type/Font/Subtype/Type0/Encoding/Identity-H/BaseFont/Batang/ToUnicode 6 0 R>>`;
const objstm = await deflate(enc.encode(objstmBody));
const bin = (u8) => Array.from(u8, (b) => String.fromCharCode(b)).join("");
// 압축 바이트가 UTF-8 로 부풀지 않게 한 바이트씩 담는다
const hardBytes = Uint8Array.from(
  [
    "%PDF-1.5",
    "1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj",
    "2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj",
    "3 0 obj\n<</Type/Page/Parent 2 0 R/Resources 8 0 R/Contents 4 0 R>>\nendobj",
    `4 0 obj\n<</Filter/FlateDecode/Length ${packed.length}>>stream\n${bin(packed)}\nendstream\nendobj`,
    `6 0 obj\n<</Length ${cmap.length}>>stream\n${cmap}\nendstream\nendobj`,
    `7 0 obj\n<</Type/ObjStm/N 1/First 4/Filter/FlateDecode/Length ${objstm.length}>>stream\n${bin(objstm)}\nendstream\nendobj`,
    "8 0 obj\n<</Font<</F1 5 0 R>>>>\nendobj",
    "trailer<</Root 1 0 R>>\n%%EOF",
  ].join("\n"),
  (c) => c.charCodeAt(0) & 0xff,
);
text = await pdfToText(hardBytes);
ok("압축·객체모음 PDF 읽기", text.includes(한글), text);

// ── HWPX(=ZIP) ──────────────────────────────────────────

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// 압축 없이(method 0) 넣은 zip 하나를 만들어 zip 판독기를 확인한다.
function buildZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let at = 0;
  for (const [name, content] of files) {
    const n = enc.encode(name), d = enc.encode(content);
    const lh = new Uint8Array(30 + n.length);
    const ldv = new DataView(lh.buffer);
    ldv.setUint32(0, 0x04034b50, true);
    ldv.setUint16(4, 20, true);
    ldv.setUint32(14, crc32(d), true);
    ldv.setUint32(18, d.length, true);
    ldv.setUint32(22, d.length, true);
    ldv.setUint16(26, n.length, true);
    lh.set(n, 30);
    const ch = new Uint8Array(46 + n.length);
    const cdv = new DataView(ch.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint32(16, crc32(d), true);
    cdv.setUint32(20, d.length, true);
    cdv.setUint32(24, d.length, true);
    cdv.setUint16(28, n.length, true);
    cdv.setUint32(42, at, true);
    ch.set(n, 46);
    parts.push(lh, d);
    central.push(ch);
    at += lh.length + d.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, cdSize, true);
  edv.setUint32(16, at, true);
  const all = [...parts, ...central, eocd];
  const size = all.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

const section = `<?xml version="1.0" encoding="UTF-8"?>
<hs:sec xmlns:hp="x"><hp:p><hp:run><hp:t>2026학년도 진로체험 수요조사 제출</hp:t></hp:run></hp:p>
<hp:p><hp:run><hp:t>제출기한: 2026. 9. 11.(금)</hp:t></hp:run></hp:p></hs:sec>`;
const hwpx = buildZip([["Contents/section0.xml", section], ["mimetype", "application/hwp+zip"]]);
const zip = await readZip(hwpx);
ok("zip 목록", zip && zip.size === 2, zip && [...zip.keys()]);
const htext = await hwpxToText(hwpx);
ok("hwpx 글자", /수요조사 제출/.test(htext) && /제출기한/.test(htext), htext);
ok("hwpx → 할 일", scanTasks(htext, { today: TODAY }).tasks[0]?.due === "2026-09-11", scanTasks(htext, { today: TODAY }).tasks);
ok("깨진 글자 거르기", !looksReadable("…‰Û†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"), true);

console.log(bad === 0 ? "\n전부 통과" : `\n${bad}건 실패`);
process.exit(bad === 0 ? 0 : 1);
