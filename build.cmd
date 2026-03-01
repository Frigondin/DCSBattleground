@echo off
echo Cleaning up...
del /F dist\*.mp3 2>NUL
del /F dist\*.LICENSE.txt 2>NUL
del /F dist\*.js 2>NUL
del /F dist\*.html 2>NUL
del /F dist\*.css 2>NUL

echo Installing/updating JS deps...
call yarn

echo Running frontend tests...
call yarn test
if errorlevel 1 (
  echo Frontend tests failed. Aborting build.
  exit /b 1
)

echo Building frontend bundle...
call yarn build

echo Running Go tests (server package)...
rem Ensure we run tests for the host OS (Windows), not a previous GOOS/GOARCH
set GOOS=
set GOARCH=
go test ./server
if errorlevel 1 (
  echo Go tests failed. Aborting build.
  exit /b 1
)

echo Building Windows Exe ...
set GOOS=windows
set GOARCH=amd64
go build -o DCSBattleground.exe cmd\dcsbg-server\main.go

echo Building Linux Blob ...
set GOOS=linux
set GOARCH=amd64
go build -o DCSBattleground cmd/dcsbg-server/main.go

echo Done.
