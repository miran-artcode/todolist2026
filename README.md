# 오늘업무 — 데스크톱 위젯

교사용 업무 요청 관리 앱의 Windows 데스크톱 껍데기입니다. 내용은 배포한 웹 앱을 그대로 띄우고, Electron은 창 동작만 맡습니다.

## 되는 것

- 항상 다른 창 위에 떠 있음 (나이스, 업무포털 위에 얹기)
- 테두리 없는 작은 창. 상단 바를 잡고 끌어서 이동
- 창 위치와 크기를 기억
- 트레이 아이콘. 닫아도 종료되지 않고 트레이로 내려감
- `Ctrl+Shift+Space` 로 보이기/숨기기
- 트레이 메뉴에서 "컴퓨터 켤 때 실행" 켜고 끄기

## 관리자 권한

**필요 없습니다.**

- `nsis` 설정에서 `perMachine: false`, `allowElevation: false` 로 잡아둬서 `%LOCALAPPDATA%` 에 사용자 단위로 설치됩니다. 카톡과 같은 방식입니다.
- 설치조차 싫으면 `포터블` 빌드를 쓰세요. 단일 exe 파일 하나로 바로 실행됩니다.

서명이 없어서 처음 실행할 때 SmartScreen 경고가 한 번 뜹니다. **추가 정보 → 실행**을 누르면 됩니다. 배포할 때 이 안내를 같이 적어 주세요.

## 만들기

```bash
# 1. 웹 앱을 먼저 배포하고 그 주소를 main.js 의 APP_URL 에 적는다
#    또는 환경변수로 넘긴다

npm install

# 개발 중 실행
APP_URL=https://내앱주소 npm start

# 빌드 (설치본 + 포터블 둘 다)
APP_URL=https://내앱주소 npm run dist
```

윈도우 명령 프롬프트에서는 이렇게 합니다.

```cmd
set APP_URL=https://내앱주소
npm run dist
```

결과물은 `release/` 에 생깁니다.

- `오늘업무-0.1.0-setup.exe` — 사용자 단위 설치본
- `오늘업무-포터블-0.1.0.exe` — 설치 없이 실행

## 나눠줄 때

포터블 exe 하나만 보내는 게 가장 간단합니다. USB나 메신저로 전달하고, 받은 분은 바탕화면에 두고 더블클릭하면 끝입니다.

자동 실행까지 원하면 `Win+R` → `shell:startup` 폴더에 exe 바로가기를 넣으면 됩니다. 이것도 권한이 필요 없습니다.

## 웹 앱 쪽에서 해둘 것

창을 끌 수 있게 하려면 상단 바에 `data-drag` 속성이 있어야 합니다.

```jsx
<div data-drag style={{ background: "#3F0E40", padding: "11px 13px" }}>
  ...
</div>
```

버튼과 입력창은 자동으로 제외되므로 따로 손댈 필요 없습니다.

Electron 안에서 도는지 확인하려면 `window.desk?.isElectron` 을 보면 됩니다. 브라우저에서는 `undefined` 입니다.

## 미리 확인할 것

**망분리.** 교육청에 따라 업무망 PC에서 외부 인터넷이 막혀 있습니다. 그러면 앱이 웹 주소를 못 불러오고, 연결 실패 화면이 뜹니다. 도입 전에 해당 학교에서 일반 웹사이트가 열리는지 확인하세요.

**보안 프로그램.** 일부 교육청은 화이트리스트 방식의 EDR 을 씁니다. 흔하지는 않지만 걸리면 정보부장을 통해 예외 등록을 요청해야 합니다.

## 웹 앱 배포 (Firebase Hosting)

앱 화면은 `web/` 안에 있습니다. Vite + React 이고, Firebase Hosting 으로 배포합니다.

```bash
cd web
npm install
npm run build          # web/dist 생성

cd ..
npm install -g firebase-tools
firebase login
firebase deploy --only hosting
```

프로젝트와 배포 경로는 `.firebaserc` 와 `firebase.json` 에 이미 잡혀 있어서 `firebase init` 을 다시 할 필요는 없습니다.

주소는 `https://seoul-educaion.web.app` 입니다. `main.js` 의 `APP_URL` 기본값으로 박아뒀으니 위젯을 빌드할 때 환경변수를 따로 넘기지 않아도 됩니다.

한 프로젝트 안에 사이트가 둘 있습니다. `seoul-educaion` 이 실제로 쓰는 것이고, `project-1512580517596427239` 는 처음 만들어진 기본 사이트입니다. `firebase.json` 의 `site` 로 배포 대상을 정합니다.

Firebase 설정은 `web/src/firebase.js` 에 있습니다. 웹 API 키는 공개되어도 되는 값입니다. 실제 접근 제어는 Firestore 보안 규칙에서 합니다.
