# ALL IN MACAU (2026 DT Outing)

테이블 대항 게임: **1라운드 소수의 선택 → 2라운드 룰렛**.
Codex(ChatGPT Sites)로 만든 원래 버전의 **화면, 디자인, 규칙은 그대로** 두고, 서버만 동시 접속에 강한 구조로 바꿨습니다.
로그인 없이 링크(QR)만으로 접속합니다.

| 화면 | 주소 | 용도 |
|---|---|---|
| 참가자 | `/` | 폰. 테이블 번호로 입장 (같은 테이블 여러 명이 들어와도 됨) |
| 빔 | `/beam` | 스크린 송출 |
| 운영자 | `/host` | 운영자 비밀번호로 로그인 → 새 게임 만들기 → 진행 |

## 예전 버전이 먹통이 된 이유와 수정 내용

| 원인 (sites-v1 코드에서 확인) | 수정 |
|---|---|
| 모든 화면이 **1.5초마다** 서버에 상태를 요청 (90명이면 초당 60건 이상) | 서버가 **바뀔 때만** 상태를 밀어 줌 (WebSocket, 막힌 망은 자동 폴링) |
| 게임 전체를 DB 한 행에 저장하고, 동작마다 그 행을 서로 덮어쓰려다 **충돌하면 최대 64번 재시도** → 몰리면 "요청이 동시에 몰렸습니다" 오류 | 서버 한 대가 메모리에서 **순서대로 처리** (충돌 없음), 1초마다 파일에 백업 |
| ChatGPT 로그인 필수 | 로그인 없음, 공개 링크 |
| 같은 상태를 화면마다 매번 새로 계산 | 같은 테이블/역할끼리 묶어 한 번만 계산 |

검증 (가상 폰 120대, 14테이블, 소수의 선택 3문제 + 룰렛 3회): 오류 0건, 응답 p99 5ms, 서버 메모리 약 100MB.

## 배포 (Render)

`dist/`에 빌드 결과가 들어 있어서 Render 설정(빌드 `npm ci --omit=dev`, 시작 `node server.js`)을 바꿀 필요가 없습니다.

- 운영자 비밀번호: 환경변수 `HOST_PIN` 또는 `GAME_HOST_PASSWORD` (Render → Environment)
- **인스턴스는 1대만** (Autoscaling 끄기). 상태를 서버 메모리에 둡니다.
- 무료 플랜은 15분간 접속이 없으면 잠듭니다. 행사 기간엔 유료(0.5c-512mb)로 올리거나 행사 전에 미리 접속해 두세요.
- **행사 중에는 재배포하지 마세요.** 재시작되면 무료 플랜은 진행 상태가 사라집니다.

Docker:

```bash
docker build -t all-in-macau .
```

```bash
docker run -p 3000:3000 -e HOST_PIN=1234 -v $(pwd)/data:/app/data all-in-macau
```

## 수정하는 법

```bash
npm install
```

화면은 `client/src/` (React), 서버/게임 규칙은 `server/game.ts`, 소수의 선택 기본 문항은 `client/src/lib/minority-questions.ts`.
문항, 테이블 수, 룰렛 횟수 등은 코드 수정 없이 **운영자 화면 → 게임 설정**에서 바꿀 수 있습니다.

수정 후 반드시 빌드해서 `dist/`까지 함께 커밋하세요 (Render는 `dist/`를 그대로 실행).

```bash
npm run build
```

```bash
npm test
```

로컬 실행 (`http://localhost:3000`):

```bash
HOST_PIN=2026 npm start
```

부하 테스트 (⚠ 대상 서버에 새 게임이 만들어지니 행사 전에만):

```bash
HOST_PASSWORD=운영자비번 node scripts/loadtest.cjs https://배포주소 120 14
```

## 구조

```
client/          React 화면 (sites-v1의 app/, components/, lib/를 그대로 옮김, 통신 부분만 교체)
  src/transport.ts   실시간 연결 (Socket.IO)
server/
  game.ts        게임 규칙 (sites-v1의 app/api/game/route.ts를 옮기고 DB 부분만 메모리 저장소로 교체)
  index.ts       HTTP + 실시간 서버, 상태 묶음 전송, 저장/복구, 비밀번호 잠금
dist/            빌드 결과 (커밋됨)
server.js        Render 시작 파일
```
