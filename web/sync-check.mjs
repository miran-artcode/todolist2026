// 기기 연결(연결 코드)이 실제로 도는지 확인한다.
// 컴퓨터와 휴대폰 대신, 같은 키를 보는 두 갈래를 만들어 오가는지 본다.
// 실행: node web/sync-check.mjs
import { storage } from "./src/storage.js";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";

const key = `sync-check-${Date.now()}`; // 진짜 쓰는 문서는 건드리지 않는다
let bad = 0;
const ok = (name, cond, got) => {
  if (!cond) bad++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : ` → ${JSON.stringify(got)}`}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// 처음 붙을 때는 연결을 여느라 몇 초씩 걸린다. 조건이 될 때까지 기다린다.
async function until(fn, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await wait(250); }
  return false;
}

// 저쪽 기기 역할. 앱과 따로 도는 연결로 같은 문서에 쓴다.
const other = getFirestore(initializeApp({
  apiKey: "AIzaSyBHnVM1HlDqigEkr2AXowcr-8sbtsJpxZI",
  authDomain: "project-1512580517596427239.firebaseapp.com",
  projectId: "project-1512580517596427239",
  storageBucket: "project-1512580517596427239.firebasestorage.app",
  messagingSenderId: "766498758161",
  appId: "1:766498758161:web:331a25ca71f8225809dbb0",
}, "other-device"));

const seen = [];
const off = storage.subscribe(key, (v) => seen.push(v));

await until(() => seen.length >= 1);
ok("빈 키는 없는 값으로 한 번 알려 준다", seen.length === 1 && seen[0] === null, seen);

// 휴대폰이 올린 셈 치고 쓴다
await setDoc(doc(other, "shared", key), { value: JSON.stringify({ me: { nick: "미란" }, items: [1] }), at: serverTimestamp() });
await until(() => seen.length >= 2);
ok("저쪽이 올린 내용이 바로 들어온다", seen.length === 2 && /미란/.test(seen[1] || ""), seen);

// 이쪽에서 고친 것도 저쪽에 간다
await storage.set(key, JSON.stringify({ me: { nick: "미란" }, items: [1, 2] }), true);
await until(() => seen.length >= 3);
ok("이쪽이 올린 내용도 되돌아온다", seen.length >= 3 && /1,2/.test(seen[seen.length - 1] || ""), seen.slice(-1));

const got = await storage.get(key, true);
ok("get 으로도 같은 값이 나온다", got && /1,2/.test(got.value), got);

off();
await storage.set(key, "그만 받은 뒤 올린 값", true);
await wait(2000);
const n = seen.length;
await wait(500);
ok("그만 받겠다고 하면 더 안 온다", seen.length === n && !seen.includes("그만 받은 뒤 올린 값"), seen.slice(-1));

console.log(bad === 0 ? "\n전부 통과" : `\n${bad}건 실패`);
process.exit(bad === 0 ? 0 : 1);
