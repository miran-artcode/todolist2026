// 문서에서 글자를 긁어오는 곳.
// 전부 브라우저 안에서 돈다. 외부 서버도, API 키도 쓰지 않는다.
// PDF·HWPX·HWP 는 파일 규격을 직접 읽고, 엑셀·워드만 기존 라이브러리에 맡긴다.

const CAP = 20000; // 한 파일에서 가져올 글자 수 상한
const dec = (enc) => new TextDecoder(enc);

export function fileKind(file) {
  const n = (file.name || "").toLowerCase();
  if (/\.(hwp|hwpx)$/.test(n)) return "hwp";
  if (/\.(xlsx|xlsm|xls)$/.test(n)) return "excel";
  if (/\.docx$/.test(n)) return "word";
  if (/\.(doc|ppt|pptx|zip)$/.test(n)) return "office";
  if (file.type === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (file.type && file.type.startsWith("image/")) return "image";
  if ((file.type && file.type.startsWith("text/")) || /\.(txt|csv|md|json)$/.test(n)) return "text";
  return "unknown";
}

// ── 공통 ────────────────────────────────────────────────

async function toBytes(x) {
  if (x instanceof Uint8Array) return x;
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  return new Uint8Array(await x.arrayBuffer());
}

function tidy(s) {
  return String(s)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .split("\n").map((l) => l.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// 브라우저에 들어 있는 압축 해제기를 그대로 쓴다. zip·hwp·pdf 가 모두 deflate 를 쓴다.
async function inflate(bytes, format) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// zlib 머리가 붙은 것과 안 붙은 것(raw)이 섞여 있어 있을 법한 쪽부터 시도한다.
export async function unpack(bytes) {
  if (!bytes || bytes.length === 0) return null;
  const zlib = bytes.length > 1 && (bytes[0] & 0x0f) === 8 && (((bytes[0] << 8) | bytes[1]) % 31 === 0);
  for (const f of zlib ? ["deflate", "deflate-raw"] : ["deflate-raw", "deflate"]) {
    try { return await inflate(bytes, f); } catch (e) { /* 다른 방식으로 */ }
  }
  return null;
}

// 읽어낸 글자가 쓸 만한지 본다. 글꼴 표를 못 구하면 깨진 기호만 잔뜩 나오는데 그걸 걸러낸다.
export function looksReadable(text) {
  const t = String(text || "").replace(/\s/g, "");
  if (t.length < 20) return false;
  const ok = (t.match(/[가-힣a-zA-Z0-9.,:;~%()[\]<>/\-+·"'월일년시분원명건호차항]/g) || []).length;
  return ok / t.length > 0.5;
}

// ── ZIP (hwpx·docx 가 이 껍데기를 쓴다) ──────────────────

export async function readZip(input) {
  const bytes = await toBytes(input);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // 뒤에 주석이 붙어 있을 수 있어 끝에서부터 목차(EOCD)를 훑는다.
  let eocd = -1;
  const floor = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= floor; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;

  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const utf8 = dec("utf-8");
  const list = [];
  for (let i = 0; i < count && p + 46 <= bytes.length; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const at = dv.getUint32(p + 42, true);
    list.push({ name: utf8.decode(bytes.subarray(p + 46, p + 46 + nl)), method, csize, at });
    p += 46 + nl + xl + cl;
  }

  const out = new Map();
  for (const e of list) {
    if (e.at + 30 > bytes.length || dv.getUint32(e.at, true) !== 0x04034b50) continue;
    // 이름·부가 길이는 로컬 머리 쪽이 다를 수 있어 여기서 다시 읽는다.
    const nl = dv.getUint16(e.at + 26, true), xl = dv.getUint16(e.at + 28, true);
    const from = e.at + 30 + nl + xl;
    const raw = bytes.subarray(from, from + e.csize);
    const body = e.method === 0 ? raw : await unpack(raw);
    if (body) out.set(e.name, body);
  }
  return out;
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// 태그를 걷어내고 글자만 남긴다. 문단·줄바꿈·칸은 눈에 보이는 대로 살린다.
function xmlText(xml) {
  return String(xml)
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(?:[a-z0-9]+:)?lineBreak[^>]*>/gi, "\n")
    .replace(/<(?:[a-z0-9]+:)?br\s*\/?>/gi, "\n")
    .replace(/<\/(?:[a-z0-9]+:)?(?:p|para)>/gi, "\n")
    .replace(/<\/(?:[a-z0-9]+:)?(?:tc|td|tab)>/gi, "\t")
    .replace(/<\/(?:[a-z0-9]+:)?tr>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (m, k) => ENT[k]);
}

const numIn = (s) => Number((/(\d+)/.exec(s) || [0, 0])[1]);

export async function hwpxToText(input) {
  const zip = await readZip(input);
  if (!zip) return "";
  const secs = [...zip.keys()]
    .filter((n) => /(^|\/)section\d*\.xml$/i.test(n))
    .sort((a, b) => numIn(a) - numIn(b));
  const utf8 = dec("utf-8");
  let out = "";
  for (const n of secs) {
    out += xmlText(utf8.decode(zip.get(n))) + "\n";
    if (out.length > CAP) break;
  }
  return tidy(out).slice(0, CAP);
}

// ── HWP 5.0 (OLE 복합 문서) ─────────────────────────────

const CFB_SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const MAXSEC = 0xfffffff9; // 이 값을 넘으면 실제 조각이 아니라 끝 표시다

// 스트림 이름 -> 바이트. 512바이트 조각을 사슬처럼 이어 붙이는 구조라 그대로 따라간다.
function readCfb(bytes) {
  for (let i = 0; i < 8; i++) if (bytes[i] !== CFB_SIG[i]) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = 1 << dv.getUint16(30, true);
  const mini = 1 << dv.getUint16(32, true);
  const nFat = dv.getUint32(44, true);
  const dirStart = dv.getUint32(48, true);
  const cutoff = dv.getUint32(56, true);
  const miniFatStart = dv.getUint32(60, true);
  let difat = dv.getUint32(68, true);
  const nDifat = dv.getUint32(72, true);
  const at = (sec) => (sec + 1) * size;
  if (size < 64 || at(0) > bytes.length) return null;

  // 조각 배치표(FAT)가 어디 있는지부터 모은다. 머리에 109개까지 들어가고 넘치면 사슬로 잇는다.
  const fatSecs = [];
  for (let i = 0; i < 109 && fatSecs.length < nFat; i++) {
    const v = dv.getUint32(76 + i * 4, true);
    if (v <= MAXSEC) fatSecs.push(v);
  }
  for (let g = 0; g < nDifat && difat <= MAXSEC; g++) {
    const base = at(difat);
    if (base + size > bytes.length) break;
    for (let j = 0; j < size / 4 - 1; j++) {
      const v = dv.getUint32(base + j * 4, true);
      if (v <= MAXSEC) fatSecs.push(v);
    }
    difat = dv.getUint32(base + size - 4, true);
  }

  const per = size / 4;
  const fat = new Uint32Array(fatSecs.length * per);
  fatSecs.forEach((s, i) => {
    const b = at(s);
    if (b + size > bytes.length) return;
    for (let j = 0; j < per; j++) fat[i * per + j] = dv.getUint32(b + j * 4, true);
  });

  const chain = (start, table) => {
    const out = [];
    const seen = new Set();
    let s = start;
    while (s <= MAXSEC && s < table.length && !seen.has(s)) { seen.add(s); out.push(s); s = table[s]; }
    return out;
  };
  const readSectors = (start, len) => {
    const secs = chain(start, fat);
    const buf = new Uint8Array(secs.length * size);
    secs.forEach((s, i) => buf.set(bytes.subarray(at(s), Math.min(at(s) + size, bytes.length)), i * size));
    return len == null ? buf : buf.subarray(0, Math.min(len, buf.length));
  };

  const dir = readSectors(dirStart);
  if (!dir.length) return null;
  const ddv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const u16 = dec("utf-16le");
  const entries = [];
  for (let p = 0; p + 128 <= dir.length; p += 128) {
    const type = dir[p + 66];
    if (type !== 1 && type !== 2 && type !== 5) continue;
    const nameLen = ddv.getUint16(p + 64, true);
    if (nameLen < 2 || nameLen > 64) continue;
    entries.push({
      name: u16.decode(dir.subarray(p, p + nameLen - 2)),
      type, start: ddv.getUint32(p + 116, true), size: ddv.getUint32(p + 120, true),
    });
  }

  // 4KB 미만짜리는 따로 모아 둔 작은 창고(미니 스트림) 안에 들어 있다.
  const root = entries.find((e) => e.type === 5);
  let miniData = null, miniFat = null;
  if (root && root.size > 0 && miniFatStart <= MAXSEC) {
    miniData = readSectors(root.start, root.size);
    const mf = readSectors(miniFatStart);
    if (mf.length >= 4) miniFat = new Uint32Array(mf.buffer, mf.byteOffset, Math.floor(mf.length / 4));
  }
  const readMini = (start, len) => {
    if (!miniData || !miniFat) return new Uint8Array(0);
    const secs = chain(start, miniFat);
    const buf = new Uint8Array(secs.length * mini);
    secs.forEach((s, i) => buf.set(miniData.subarray(s * mini, s * mini + mini), i * mini));
    return buf.subarray(0, Math.min(len, buf.length));
  };

  const out = new Map();
  for (const e of entries) {
    if (e.type !== 2 || e.size === 0) continue;
    out.set(e.name, e.size < cutoff ? readMini(e.start, e.size) : readSectors(e.start, e.size));
  }
  return out;
}

// 본문은 [머리 4바이트 + 알맹이] 기록이 죽 이어진 모양이다. 그중 글자 기록(67)만 챙긴다.
const PARA_TEXT = 67;
function hwpRecords(data) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let p = 0, out = "";
  while (p + 4 <= data.length) {
    const h = dv.getUint32(p, true); p += 4;
    const tag = h & 0x3ff;
    let len = (h >>> 20) & 0xfff;
    if (len === 0xfff) { if (p + 4 > data.length) break; len = dv.getUint32(p, true); p += 4; }
    if (p + len > data.length) break;
    if (tag === PARA_TEXT) out += paraText(data.subarray(p, p + len));
    p += len;
    if (out.length > CAP) break;
  }
  return out;
}

// 글자 사이에 조판 부호가 섞여 있다. 8글자를 차지하는 부호와 한 글자짜리를 갈라서 건너뛴다.
const WIDE_CTRL = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
function paraText(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let out = "";
  for (let i = 0; i + 1 < buf.length; i += 2) {
    const c = dv.getUint16(i, true);
    if (c === 9) { out += "\t"; i += 14; continue; }
    if (c === 10 || c === 13) { out += "\n"; continue; }
    if (WIDE_CTRL.has(c)) { i += 14; continue; }
    if (c < 32) continue;
    out += String.fromCharCode(c);
  }
  return out + "\n";
}

export async function hwpToText(input) {
  const bytes = await toBytes(input);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return hwpxToText(bytes); // 확장자만 hwp 인 hwpx
  const cfb = readCfb(bytes);
  if (!cfb) return "";

  let compressed = true, locked = false;
  const head = cfb.get("FileHeader");
  if (head && head.length >= 40) {
    const f = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(36, true);
    compressed = !!(f & 1);
    locked = !!(f & 2); // 암호가 걸린 문서는 여기서 더 못 간다
  }
  if (locked) return "";

  const names = [...cfb.keys()].filter((n) => /^Section\d+$/i.test(n)).sort((a, b) => numIn(a) - numIn(b));
  let out = "";
  for (const n of names) {
    const data = compressed ? await unpack(cfb.get(n)) : cfb.get(n);
    if (!data) continue;
    out += hwpRecords(data);
    if (out.length > CAP) break;
  }
  return tidy(out).slice(0, CAP);
}

// ── PDF ─────────────────────────────────────────────────
// 규격을 다 구현하지는 않는다. 글자가 심어진 문서에서 글자만 꺼내는 데 필요한 만큼만 한다.
// 스캔본(그림만 있는 PDF)은 여기서 빈 값이 나오고, 그 처리는 부르는 쪽 몫이다.

function latin1(b) {
  let s = "";
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
  return s;
}

// "12 0 obj ... endobj" 를 죽 훑어 번호별로 담아 둔다.
function pdfObjects(bytes) {
  const s = latin1(bytes);
  const objs = new Map();
  const re = /(\d+)\s+\d+\s+obj\b/g;
  let m, skipTo = 0;
  while ((m = re.exec(s))) {
    if (m.index < skipTo) continue; // 스트림 속 숫자를 객체로 잘못 읽지 않게
    const num = Number(m[1]);
    const from = m.index + m[0].length;
    let end = s.indexOf("endobj", from);
    if (end < 0) end = s.length;
    const si = s.indexOf("stream", from);
    let dict = s.slice(from, end), raw = null;
    if (si >= 0 && si < end) {
      dict = s.slice(from, si);
      let ds = si + 6;
      if (s[ds] === "\r") ds++;
      if (s[ds] === "\n") ds++;
      let de = -1;
      // /Length 가 숫자로 적혀 있으면 그대로 믿되, 그 자리에 endstream 이 오는지 확인한다.
      const lm = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
      if (lm) {
        const guess = ds + Number(lm[1]);
        if (/^\s*endstream/.test(s.slice(guess, guess + 12))) de = guess;
      }
      if (de < 0) de = s.indexOf("endstream", ds);
      if (de < 0) de = end;
      raw = bytes.subarray(ds, de);
      skipTo = de;
    }
    objs.set(num, { dict, raw, data: null, done: false });
  }
  return objs;
}

// PNG 예측기가 걸린 스트림을 되돌린다. 객체 모음이나 상호참조표에서 가끔 쓴다.
function unpredict(data, dict) {
  const pred = Number((/\/Predictor\s+(\d+)/.exec(dict) || [])[1] || 1);
  if (pred < 10) return data;
  const cols = Number((/\/Columns\s+(\d+)/.exec(dict) || [])[1] || 1);
  const colors = Number((/\/Colors\s+(\d+)/.exec(dict) || [])[1] || 1);
  const bpc = Number((/\/BitsPerComponent\s+(\d+)/.exec(dict) || [])[1] || 8);
  const bpp = Math.max(1, (colors * bpc) >> 3);
  const rowLen = Math.ceil((cols * colors * bpc) / 8);
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  let prev = new Uint8Array(rowLen);
  for (let r = 0; r < rows; r++) {
    const tag = data[r * (rowLen + 1)];
    const src = data.subarray(r * (rowLen + 1) + 1, r * (rowLen + 1) + 1 + rowLen);
    const cur = new Uint8Array(rowLen);
    for (let i = 0; i < rowLen; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      if (tag === 1) v += a;
      else if (tag === 2) v += b;
      else if (tag === 3) v += (a + b) >> 1;
      else if (tag === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
    out.set(cur, r * rowLen);
    prev = cur;
  }
  return out;
}

async function streamOf(o) {
  if (o.done) return o.data;
  o.done = true;
  if (!o.raw) return (o.data = null);
  if (/\/Filter[^/]{0,20}\/FlateDecode/.test(o.dict)) o.data = await unpack(o.raw);
  else if (!/\/Filter/.test(o.dict)) o.data = o.raw;
  else o.data = null; // DCTDecode 같은 그림 압축은 건드리지 않는다
  if (o.data && /\/Predictor\s+\d+/.test(o.dict)) o.data = unpredict(o.data, o.dict);
  return o.data;
}

// 1.5 이후로는 객체 여럿을 한 스트림에 몰아 넣는다. 글꼴 정보가 거기 있어서 풀어 놓는다.
async function expandObjStm(objs) {
  for (const [, o] of [...objs]) {
    if (!/\/Type\s*\/ObjStm/.test(o.dict)) continue;
    const data = await streamOf(o);
    if (!data) continue;
    const s = latin1(data);
    const n = Number((/\/N\s+(\d+)/.exec(o.dict) || [])[1] || 0);
    const first = Number((/\/First\s+(\d+)/.exec(o.dict) || [])[1] || 0);
    const head = s.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const num = head[i * 2], off = head[i * 2 + 1];
      if (!Number.isFinite(num) || !Number.isFinite(off)) continue;
      const next = i + 1 < n ? head[i * 2 + 3] : s.length - first;
      if (!objs.has(num)) objs.set(num, { dict: s.slice(first + off, first + next), raw: null, data: null, done: true });
    }
  }
}

const hexToStr = (h) => {
  if (h.length <= 2) return h ? String.fromCharCode(parseInt(h, 16)) : "";
  let out = "";
  for (let i = 0; i + 3 < h.length; i += 4) out += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
  return out;
};
const bumpHex = (h, n) => {
  if (h.length <= 4) return (parseInt(h, 16) + n).toString(16).padStart(h.length, "0");
  return h.slice(0, -4) + (parseInt(h.slice(-4), 16) + n).toString(16).padStart(4, "0");
};

// 글꼴마다 "이 번호는 이 글자" 라는 표(ToUnicode)를 달고 다닌다. 한글 PDF 는 이게 있어야 읽힌다.
function parseCMap(text) {
  const map = new Map();
  let width = 1, m;
  const bf = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((m = bf.exec(text))) {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g;
    let g;
    while ((g = re.exec(m[1]))) {
      if (g[1].length >= 4) width = 2;
      map.set(parseInt(g[1], 16), hexToStr(g[2]));
    }
  }
  const br = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = br.exec(text))) {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]*)>|\[([\s\S]*?)\])/g;
    let g;
    while ((g = re.exec(m[1]))) {
      const lo = parseInt(g[1], 16), hi = parseInt(g[2], 16);
      if (g[1].length >= 4) width = 2;
      if (hi < lo || hi - lo > 65535) continue;
      if (g[3] != null) for (let c = lo; c <= hi; c++) map.set(c, hexToStr(bumpHex(g[3], c - lo)));
      else (g[4].match(/<([0-9a-fA-F]*)>/g) || []).forEach((it, i) => map.set(lo + i, hexToStr(it.slice(1, -1))));
    }
  }
  return { map, width };
}

async function pdfFonts(objs) {
  const fonts = new Map();
  for (const [num, o] of objs) {
    if (!/\/Type\s*\/Font/.test(o.dict)) continue;
    let width = /\/Subtype\s*\/Type0/.test(o.dict) || /\/Encoding\s*\/(?:Identity|UniKS|KSC)/.test(o.dict) ? 2 : 1;
    let map = null;
    const tu = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(o.dict);
    if (tu && objs.has(Number(tu[1]))) {
      const data = await streamOf(objs.get(Number(tu[1])));
      if (data) { const c = parseCMap(latin1(data)); if (c.map.size) { map = c.map; width = c.width; } }
    }
    fonts.set(num, { map, width });
  }
  return fonts;
}

// /Font << /F1 5 0 R >> 을 "F1 -> 5" 로 바꾼다. 간접 참조면 그 객체를 한 번 더 편다.
function fontNames(dict, objs) {
  const out = new Map();
  let body = (/\/Font\s*<<([\s\S]*?)>>/.exec(dict) || [])[1];
  if (!body) {
    const ind = /\/Font\s+(\d+)\s+\d+\s+R/.exec(dict);
    if (ind && objs.has(Number(ind[1]))) body = objs.get(Number(ind[1])).dict;
  }
  if (!body) return out;
  const re = /\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g;
  let m;
  while ((m = re.exec(body))) out.set(m[1], Number(m[2]));
  return out;
}

// ( ) 안의 글자. \( 같은 이스케이프와 괄호 겹침을 따라간다.
function readLiteral(s, i) {
  let depth = 0, out = "";
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") {
      const n = s[i + 1];
      if (n === "n") out += "\n";
      else if (n === "r") out += "\r";
      else if (n === "t") out += "\t";
      else if (n === "b" || n === "f") out += " ";
      else if (n >= "0" && n <= "7") {
        const oct = /^[0-7]{1,3}/.exec(s.slice(i + 1))[0];
        out += String.fromCharCode(parseInt(oct, 8));
        i += oct.length;
        continue;
      } else if (n === "\n") { i++; continue; }
      else out += n;
      i++;
      continue;
    }
    if (c === "(") { depth++; if (depth === 1) continue; }
    if (c === ")") { depth--; if (depth === 0) return [out, i + 1]; }
    out += c;
  }
  return [out, i];
}

function decodeText(raw, font) {
  if (font && font.map && font.width === 2) {
    let out = "";
    for (let i = 0; i + 1 < raw.length; i += 2) {
      const code = (raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1);
      out += font.map.get(code) || "";
    }
    return out;
  }
  if (font && font.map) {
    let out = "";
    for (let i = 0; i < raw.length; i++) {
      const c = raw.charCodeAt(i);
      const v = font.map.get(c);
      out += v != null ? v : c >= 32 ? String.fromCharCode(c) : "";
    }
    return out;
  }
  // 표가 없는 두 바이트 글꼴은 그대로 읽으면 깨진 글자만 나온다. 차라리 비운다.
  if (font && font.width === 2) return "";
  return raw.replace(/[\u0000-\u001f]/g, "");
}

// 내용 스트림을 훑으며 글자 그리는 명령만 골라낸다.
function drawText(s, names, fonts) {
  let out = "", font = null, y = null;
  let stack = [];
  const last = (t) => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].t === t) return stack[i].v; return null; };
  const nth = (k) => { const ns = stack.filter((x) => x.t === "d"); return ns.length >= k ? ns[ns.length - k].v : null; };
  const nl = () => { if (!out.endsWith("\n")) out += "\n"; };

  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === "(") { const [v, ni] = readLiteral(s, i); stack.push({ t: "s", v }); i = ni; continue; }
    if (c === "<" && s[i + 1] !== "<") {
      const e = s.indexOf(">", i);
      if (e < 0) break;
      const hex = s.slice(i + 1, e).replace(/[^0-9a-fA-F]/g, "");
      let v = "";
      for (let h = 0; h < hex.length; h += 2) v += String.fromCharCode(parseInt(hex.slice(h, h + 2).padEnd(2, "0"), 16));
      stack.push({ t: "s", v });
      i = e + 1;
      continue;
    }
    if (c === "<" && s[i + 1] === "<") { const e = s.indexOf(">>", i); i = e < 0 ? s.length : e + 2; continue; }
    if (c === "/") { const m = /^\/([^\s/<>[\]()]*)/.exec(s.slice(i)); stack.push({ t: "f", v: m[1] }); i += m[0].length; continue; }
    if (c === "[" || c === "]") { stack.push({ t: c }); i++; continue; }
    if (/[-+.\d]/.test(c)) {
      const m = /^[-+]?[\d.]+/.exec(s.slice(i));
      if (!m) { i++; continue; }
      stack.push({ t: "d", v: Number(m[0]) || 0 });
      i += m[0].length;
      continue;
    }
    const om = /^(?:'|"|[A-Za-z][A-Za-z0-9*]*)/.exec(s.slice(i));
    if (!om) { i++; continue; }
    const op = om[0];
    i += op.length;

    if (op === "BI") { const e = s.indexOf("EI", i); i = e < 0 ? s.length : e + 2; stack = []; continue; }
    if (op === "Tf") { const f = last("f"); font = f != null && names.has(f) ? fonts.get(names.get(f)) : null; }
    else if (op === "Tj") { const v = last("s"); if (v != null) out += decodeText(v, font); }
    else if (op === "'" || op === '"') { nl(); const v = last("s"); if (v != null) out += decodeText(v, font); }
    else if (op === "TJ") {
      for (const it of stack) {
        if (it.t === "s") out += decodeText(it.v, font);
        else if (it.t === "d" && it.v < -170) out += " "; // 자간을 크게 벌리면 사실상 빈칸이다
      }
    } else if (op === "Td" || op === "TD") { const ty = nth(1); if (ty !== null && ty !== 0) nl(); }
    else if (op === "Tm") { const ny = nth(1); if (y !== null && ny !== null && Math.abs(ny - y) > 0.5) nl(); y = ny; }
    else if (op === "T*" || op === "ET") nl();
    stack = [];
    if (out.length > CAP * 2) break;
  }
  return out;
}

export async function pdfToText(input) {
  const bytes = await toBytes(input);
  const objs = pdfObjects(bytes);
  if (!objs.size) return "";
  await expandObjStm(objs);
  const fonts = await pdfFonts(objs);

  const pages = [...objs.entries()].filter(([, o]) => /\/Type\s*\/Page(?![a-zA-Z])/.test(o.dict));
  const list = pages.length ? pages : [...objs.entries()].filter(([, o]) => o.raw);
  let out = "";
  for (const [num, o] of list) {
    let res = o.dict;
    const rin = /\/Resources\s+(\d+)\s+\d+\s+R/.exec(o.dict);
    if (rin && objs.has(Number(rin[1]))) res = objs.get(Number(rin[1])).dict;
    const names = fontNames(res, objs);

    const ids = [];
    const one = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(o.dict);
    const many = /\/Contents\s*\[([^\]]*)\]/.exec(o.dict);
    if (one) ids.push(Number(one[1]));
    else if (many) { const re = /(\d+)\s+\d+\s+R/g; let m; while ((m = re.exec(many[1]))) ids.push(Number(m[1])); }
    else if (!pages.length) ids.push(num);

    for (const id of ids) {
      const co = objs.get(id);
      if (!co) continue;
      const data = await streamOf(co);
      if (!data) continue;
      const s = latin1(data);
      if (!/(?:Tj|TJ)[\s\]]/.test(s)) continue; // 글자를 안 그리는 스트림은 건너뛴다
      out += drawText(s, names, fonts);
    }
    out += "\n";
    if (out.length > CAP) break;
  }
  const text = tidy(out).slice(0, CAP);
  return looksReadable(text) ? text : "";
}

// ── 엑셀·워드 ───────────────────────────────────────────
// 이 둘은 규격이 크고 이미 잘 도는 해석기가 있어서 그대로 쓴다. 역시 브라우저 안에서만 돈다.

export async function excelToText(file) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  return wb.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
    return `[시트: ${name}]\n${rows}`;
  }).join("\n\n").slice(0, CAP);
}

export async function wordToText(file) {
  const mammoth = (await import("mammoth")).default;
  const buf = await file.arrayBuffer();
  const r = await mammoth.extractRawText({ arrayBuffer: buf });
  return String(r.value || "").slice(0, CAP);
}

// 파일 하나를 글자로. 그림은 눈으로 봐야 하므로 여기서는 빈 값이 나온다.
export async function fileToText(file, kind) {
  const k = kind || fileKind(file);
  try {
    if (k === "excel") return await excelToText(file);
    if (k === "word") return await wordToText(file);
    if (k === "text") return (await file.text()).slice(0, CAP);
    if (k === "hwp") return await hwpToText(file);
    if (k === "pdf") return await pdfToText(file);
  } catch (e) {
    console.warn("문서에서 글자를 못 꺼냈습니다", (file && file.name) || "", e);
  }
  return "";
}
