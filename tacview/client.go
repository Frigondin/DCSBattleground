package tacview

import (
	"bufio"
	"errors"
	"fmt"
	"hash/crc32"
	"hash/crc64"
	"io"
	"math/bits"
	"net"
	"unicode/utf16"
)

func hashPassword32(password string) string {
	password_utf16 := utf16.Encode([]rune(password))

	password_bytes := make([]byte, 2*len(password_utf16))
	for i, r := range password_utf16 {
		password_bytes[2*i+0] = byte(r >> 0)
		password_bytes[2*i+1] = byte(r >> 8)
	}

	hash := crc32.ChecksumIEEE(password_bytes)
	return fmt.Sprintf("%x", hash)
}

func hashPassword64(password string) string {
	password_utf16 := utf16.Encode([]rune(password))

	password_bytes := make([]byte, 2*len(password_utf16))
	for i, r := range password_utf16 {
		password_bytes[2*i+0] = bits.Reverse8(byte(r >> 0))
		password_bytes[2*i+1] = bits.Reverse8(byte(r >> 8))
	}

	hash := bits.Reverse64(crc64.Checksum(password_bytes, crc64.MakeTable(crc64.ECMA)))
	return fmt.Sprintf("%x", hash)
}

/// Creates a new Reader from a TacView Real Time server
func NewRealTimeReader(connStr string, username string, password string) (*Reader, error) {
	reader, err := newRealTimeReaderHash(connStr, username, password, hashPassword64)

	if err == io.EOF && password != "" {
		reader, err = newRealTimeReaderHash(connStr, username, password, hashPassword32)
		if err == io.EOF {
			err = errors.New("EOF (possible incorrect password)")
		}
	}

	return reader, err
}

func newRealTimeReaderHash(connStr string, username string, password string, hashFunc func(string) string) (*Reader, error) {
	conn, err := net.Dial("tcp", connStr)
	if err != nil {
		return nil, err
	}

	reader := bufio.NewReader(conn)

	headerProtocol, err := reader.ReadString('\n')
	if err != nil {
		return nil, err
	}
	if headerProtocol != "XtraLib.Stream.0\n" {
		return nil, fmt.Errorf("bad header protocol: %v", headerProtocol)
	}

	headerVersion, err := reader.ReadString('\n')
	if err != nil {
		return nil, err
	}
	if headerVersion != "Tacview.RealTimeTelemetry.0\n" {
		return nil, fmt.Errorf("bad header version %v", headerVersion)
	}

	// Read remote hostname
	_, err = reader.ReadString('\n')
	if err != nil {
		return nil, err
	}

	eoh, err := reader.ReadByte()
	if err != nil {
		return nil, err
	}

	if eoh != '\x00' {
		return nil, errors.New("bad or missing end of header")
	}

	_, err = conn.Write([]byte("XtraLib.Stream.0\n"))
	if err != nil {
		return nil, err
	}
	_, err = conn.Write([]byte("Tacview.RealTimeTelemetry.0\n"))
	if err != nil {
		return nil, err
	}
	_, err = conn.Write([]byte(fmt.Sprintf("%s\n", username)))
	if err != nil {
		return nil, err
	}

	hash := hashFunc(password)
	_, err = conn.Write([]byte(fmt.Sprintf("%s\x00", hash)))
	if err != nil {
		return nil, err
	}

	return NewReader(reader)
}