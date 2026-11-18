@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 설치가 필요합니다. https://nodejs.org/ko 에서 LTS를 설치한 뒤 다시 실행해주세요.
  pause
  exit /b 1
)
node scripts/build-card-resources.mjs
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
echo 차원대충돌! 서버를 실행합니다.
echo 브라우저에서 http://localhost:3000 을 열어주세요.
echo 종료할 때는 이 창에서 Ctrl+C를 누르세요.
echo.
node server.mjs
pause
