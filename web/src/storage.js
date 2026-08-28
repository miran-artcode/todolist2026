// 앱이 쓰던 window.storage 를 브라우저에서도 되게 채워 넣는다.
//
//   get(key)        / set(key, value)        → 이 브라우저에만 (localStorage)
//   get(key, true)  / set(key, value, true)  → 학교 사람들끼리 공유 (Firestore)
//
// 공유 쪽은 onSnapshot 으로 한 번만 붙여 두고 값을 들고 있는다. 앱이 20초마다
// 다시 읽어도 서버를 또 때리지 않고, 남이 올린 글은 알아서 따라 들어온다.
import { doc, getFirestore, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { app } from "./firebase";

const db = getFirestore(app);
const COL = "shared";
const MAX = 900 * 1024; // Firestore 문서 상한이 1MiB

const live = new Map();

function watch(key) {
  let e = live.get(key);
  if (e) return e;

  e = { value: null };
  e.ready = new Promise((resolve) => {
    let first = true;
    const done = () => { if (first) { first = false; resolve(); } };
    onSnapshot(
      doc(db, COL, key),
      (snap) => {
        const v = snap.exists() ? snap.data().value : null;
        e.value = typeof v === "string" ? v : null;
        done();
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

export const storage = {
  get: (key, shared) => (shared ? getShared(key) : getLocal(key)),
  set: (key, value, shared) => (shared ? setShared(key, value) : setLocal(key, value)),
};

if (typeof window !== "undefined") window.storage = storage;
