package server

import (
	"io"
	"log"
	"os"
	"path/filepath"
)

// setupLogging mirrors logs to stdout and a local file.
func setupLogging(_ *Config) (func(), error) {
	logPath := filepath.Join(".", "dcsbattleground.log")
	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return nil, err
	}

	log.SetOutput(io.MultiWriter(os.Stdout, file))

	return func() {
		_ = file.Close()
	}, nil
}
