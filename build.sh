echo Cleaning shit up...
rm -Rf dist/*.mp3
rm -Rf dist/*.LICENSE.txt
rm -Rf dist/*.js
rm -Rf dist/*.html
rm -Rf dist/*.css
rm -Rf s3cn3t*
yarn build
echo Building Linux Blob ...
GOOS=linux GOARCH=amd64 go build -o DCSBattleground cmd/dcsbg-server/main.go
echo Building Windows Exe ...
GOOS=windows GOARCH=amd64 go build -o DCSBattleground.exe cmd/dcsbg-server/main.go
echo Done.