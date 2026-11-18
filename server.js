// 빌드된 서버를 실행합니다 (빌드: npm run build). Render 설정의 시작 명령 `node server.js`와 호환됩니다.
process.env.CLIENT_DIR = process.env.CLIENT_DIR || require("path").join(__dirname, "dist", "client");
require("./dist/server.cjs");
