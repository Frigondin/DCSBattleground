@echo off
echo Cleaning up...
del /F dist\*.mp3 2>NUL
del /F dist\*.LICENSE.txt 2>NUL
del /F dist\*.js 2>NUL
del /F dist\*.html 2>NUL
del /F dist\*.css 2>NUL
call yarn
call yarn build
echo Building Windows Exe ...
set GOOS=windows
set GOARCH=amd64
go build -o DCSBattleground.exe cmd\dcsbg-server\main.go
echo Building Linux Blob ...
set GOOS=linux
set GOARCH=amd64
go build -o DCSBattleground cmd/dcsbg-server/main.go
echo Done.
