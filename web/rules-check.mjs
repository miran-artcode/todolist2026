import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, serverTimestamp } from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyBHnVM1HlDqigEkr2AXowcr-8sbtsJpxZI",
  authDomain: "project-1512580517596427239.firebaseapp.com",
  projectId: "project-1512580517596427239",
  storageBucket: "project-1512580517596427239.firebasestorage.app",
  messagingSenderId: "766498758161",
  appId: "1:766498758161:web:331a25ca71f8225809dbb0",
});
const db = getFirestore(app);
const key = "rules-check-tmp";

async function step(name, fn, wantAllow) {
  let allowed = true, code = "";
  try { await fn(); } catch (e) { allowed = false; code = e.code || String(e); }
  const ok = allowed === wantAllow;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} → ${allowed ? "허용" : "거부 " + code}`);
}

await step("공유 문서 쓰기", () => setDoc(doc(db, "shared", key), { value: "hello", at: serverTimestamp() }), true);
const snap = await getDoc(doc(db, "shared", key));
console.log(`${snap.exists() && snap.data().value === "hello" ? "PASS" : "FAIL"}  공유 문서 읽기 → ${JSON.stringify(snap.data()?.value)}`);
await step("허용 안 된 필드 섞기", () => setDoc(doc(db, "shared", key), { value: "x", at: serverTimestamp(), evil: 1 }), false);
await step("문자열 아닌 값", () => setDoc(doc(db, "shared", key), { value: 123, at: serverTimestamp() }), false);
await step("다른 컬렉션", () => setDoc(doc(db, "elsewhere", key), { value: "x" }), false);
await step("삭제", () => deleteDoc(doc(db, "shared", key)), false);
process.exit(0);
