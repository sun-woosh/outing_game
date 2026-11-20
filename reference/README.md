# reference/ — 참고용 원본 (실행되지 않음)

이 폴더의 파일은 **게임 실행에 쓰이지 않습니다.** 지금 게임이 어디서 왔는지 확인하거나, 원래 동작과 비교할 때만 봅니다.
수정해도 게임에는 아무 변화가 없습니다. 실제 게임 코드는 저장소 루트의 `client/`와 `server/`입니다.

| 폴더 | 무엇 | 지금 코드에서 이어진 곳 |
|---|---|---|
| `codex-sites-v1/` | Codex(ChatGPT Sites)로 처음 만든 게임 원본. 소수의 선택 + 룰렛 (+ 지금은 안 쓰는 블랙잭). Cloudflare D1 DB를 쓰던 버전이라 그대로는 실행되지 않음 | 화면·디자인 → `client/src/`, 게임 규칙 `app/api/game/route.ts` → `server/game.ts` |
| `townhall-face-card/` | 2026 3Q Townhall 게임의 배포 파일(압축된 JS/CSS). 얼굴 카드 매치 규칙을 여기서 읽어 옴 | 얼굴 카드 → `server/face.ts`, `client/src/components/face-screen.tsx` |

원본 그대로의 전체 파일(설정·도구 포함)은 GitHub의 `import/sites-v1`, `import/townhall-face-card` 브랜치에도 남아 있습니다.
