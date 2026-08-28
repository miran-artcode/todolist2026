// Firebase 초기화. 다른 곳에서는 여기서 내보낸 app 을 가져다 쓴다.
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBHnVM1HlDqigEkr2AXowcr-8sbtsJpxZI",
  authDomain: "project-1512580517596427239.firebaseapp.com",
  projectId: "project-1512580517596427239",
  storageBucket: "project-1512580517596427239.firebasestorage.app",
  messagingSenderId: "766498758161",
  appId: "1:766498758161:web:331a25ca71f8225809dbb0",
  measurementId: "G-JR5J2JPC5Q",
};

export const app = initializeApp(firebaseConfig);

// 애널리틱스는 지원 환경(일반 브라우저)에서만 켠다. Electron 등에서 죽지 않게.
export let analytics = null;
isSupported()
  .then((ok) => { if (ok) analytics = getAnalytics(app); })
  .catch(() => {});
