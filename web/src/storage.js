// 앱이 쓰던 window.storage 를 브라우저에서도 되게 채워 넣는다.
//
//   get(key)        / set(key, value)        → 이 브라우저에만 (localStorage)
//   get(key, true)  / set(key, value, true)  → 학교 사람들끼리 공유 (Firestore)
//
// 공유 쪽은 onSnapshot 으로 한 번만 붙여 두고 값을 들고 있는다. 앱이 20초마다
// 다시 읽어도 서버를 또 때리지 않고, 남이 올린 글은 알아서 따라 들어온다.
import { doc, getFirestore, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { app } from "./firebase.js"; // node 로 점검할 때도 열리게 확장자를 붙인다

const db = getFirestore(app);
const COL = "shared";
const MAX = 900 * 1024; // Firestore 문서 상한이 1MiB

const live = new Map();

function watch(key) {
  let e = live.get(key);
  if (e) return e;

  e = { value: null, subs: new Set() };
  e.ready = new Promise((resolve) => {
    let first = true;
    const done = () => { if (first) { first = false; resolve(); } };
    onSnapshot(
      doc(db, COL, key),
      (snap) => {
        const v = snap.exists() ? snap.data().value : null;
        e.value = typeof v === "string" ? v : null;
        done();
        // 다른 기기가 올린 새 값을 지금 보고 있는 화면에 바로 알려 준다
        for (const fn of e.subs) { try { fn(e.value); } catch (err) { /* 구독자 사정은 여기서 안 본다 */ } }
      },
      () => done(), // 권한이 없거나 끊겼으면 값 없는 상태로 둔다
    );
  });

  live.set(key, e);
  return e;
}

async function getShared(key) {
  const e = watch(key);
  await e.ready;
  return e.value == null ? null : { value: e.value };
}

async function setShared(key, value) {
  if (typeof value !== "string") throw new Error("문자열만 저장합니다");
  if (value.length > MAX) throw new Error("내용이 너무 큽니다");
  // 화면이 서버 응답을 기다리지 않게 캐시를 먼저 올린다
  watch(key).value = value;
  await setDoc(doc(db, COL, key), { value, at: serverTimestamp() });
}

async function getLocal(key) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? null : { value: v };
  } catch (e) {
    return null; // 시크릿 모드 등에서 막히면 없는 셈 친다
  }
}

async function setLocal(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    /* 저장 실패는 무시 */
  }
}

// 공유 키를 계속 지켜본다. 붙는 순간 지금 값을 한 번 주고(없으면 null),
// 그 뒤로는 바뀔 때마다 준다. 돌려주는 함수를 부르면 그만 받는다.
function subscribeShared(key, fn) {
  const e = watch(key);
  let on = true;
  let sent = false;
  const hand = (v) => { if (!on) return; sent = true; fn(v); };
  e.subs.add(hand);
  // 이미 붙어 있던 키라면 새 스냅샷이 안 올 수 있으니 지금 값을 한 번 준다
  e.ready.then(() => { if (on && !sent) hand(e.value); });
  return () => { on = false; e.subs.delete(hand); };
}

export const storage = {
  get: (key, shared) => (shared ? getShared(key) : getLocal(key)),
  set: (key, value, shared) => (shared ? setShared(key, value) : setLocal(key, value)),
  subscribe: (key, fn) => subscribeShared(key, fn),
};

if (typeof window !== "undefined") window.storage = storage;
