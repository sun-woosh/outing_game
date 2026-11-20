# DT Outing 2026 — Sites 버전

이 폴더는 `work.zip`에 포함된 기존 ChatGPT Sites 게임 소스입니다. 저장소 루트에 있는 공개 배포용 게임과는 별개의 버전입니다.

- 1라운드: 소수의 선택
- 2라운드: 룰렛
- 주요 화면: `app/page.tsx`, `components/host-console.tsx`
- 게임 API: `app/api/game/route.ts`
- 기본 문제: `lib/minority-questions.ts`

의존성 설치 결과, 빌드 파일, 로컬 게임 데이터와 Git 기록은 포함하지 않았습니다. 기존 Sites 프로젝트 연결 정보는 제외했습니다. 새 배포 환경에서는 호스팅 설정과 D1 데이터베이스, 운영자 비밀번호 환경변수 `GAME_HOST_PASSWORD`를 별도로 설정해야 합니다.
