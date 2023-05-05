package tacview

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/spkg/bom"
)

var bomHeader = []byte{0xef, 0xbb, 0xbf}
var keyRe = regexp.MustCompilePOSIX("^(.*)=(.*)$")

func splitPropertyTokens(s string) (tokens []string, err error) {
	var runes []rune
	inEscape := false
	for _, r := range s {
		switch {
		case inEscape:
			inEscape = false
			fallthrough
		default:
			runes = append(runes, r)
		case r == '\\':
			inEscape = true
		case r == ',':
			tokens = append(tokens, string(runes))
			runes = runes[:0]
		}
	}
	tokens = append(tokens, string(runes))
	if inEscape {
		err = errors.New("invalid escape")
	}
	return tokens, err
}

// Header describes a ACMI file header
type Header struct {
	FileType         string
	FileVersion      string
	ReferenceTime    time.Time
	InitialTimeFrame TimeFrame
}

// Reader provides an interface for reading an ACMI file
type Reader struct {
	Header Header
	reader *bufio.Reader
}

// Writer provides an interface for writing an ACMI file
type Writer struct {
	writer *bufio.Writer
	closer io.Closer
}

// TimeFrame represents a single time frame from an ACMI file
type TimeFrame struct {
	Offset  float64
	Objects []*Object
}

// RawTimeFrame represents a raw time frame that has not been parsed yet
type RawTimeFrame struct {
	Offset   float64
	Contents []string
}

// Property represents an object property
type Property struct {
	Key   string
	Value string
}

// Object describes an ACMI object
type Object struct {
	Id         uint64
	Properties []*Property
	Deleted    bool
}

func (r *RawTimeFrame) Parse() (*TimeFrame, error) {
	timeFrame := NewTimeFrame()
	timeFrame.Offset = r.Offset
	for _, line := range r.Contents {
		object, err := parseObjectLine(line)
		if err != nil {
			return nil, err
		}

		timeFrame.Objects = append(timeFrame.Objects, object)
	}

	return timeFrame, nil
}

// NewTimeFrame creates an empty TimeFrame
func NewTimeFrame() *TimeFrame {
	return &TimeFrame{
		Objects: make([]*Object, 0),
	}
}

// NewWriter creates a new ACMI writer
func NewWriter(writer io.WriteCloser, header *Header) (*Writer, error) {
	w := &Writer{
		writer: bufio.NewWriter(writer),
		closer: writer,
	}
	return w, w.writeHeader(header)
}

// NewReader creates a new ACMI reader
func NewReader(reader io.Reader) (*Reader, error) {
	r := &Reader{reader: bufio.NewReader(bom.NewReader(reader))}
	err := r.readHeader()
	return r, err
}

// Close closes the writer, flushing any remaining contents
func (w *Writer) Close() error {
	err := w.writer.Flush()
	if err != nil {
		return err
	}
	return w.closer.Close()
}

func (w *Writer) writeHeader(header *Header) error {
	_, err := w.writer.Write(bomHeader)
	if err != nil {
		return err
	}

	return header.Write(w.writer)
}

// WriteTimeFrame writes a time frame
func (w *Writer) WriteTimeFrame(tf *TimeFrame) error {
	return tf.Write(w.writer, true)
}

func (h *Header) Write(writer *bufio.Writer) error {
	_, err := writer.WriteString("FileType=text/acmi/tacview\nFileVersion=2.2\n")
	if err != nil {
		return err
	}

	h.InitialTimeFrame.Write(writer, false)

	return writer.Flush()
}

// Get returns an object (if one exists) for a given object id
func (tf *TimeFrame) Get(id uint64) *Object {
	for _, object := range tf.Objects {
		if object.Id == id {
			return object
		}
	}
	return nil
}

// Delete removes an object (if one exists) for a given object id
func (tf *TimeFrame) Delete(id uint64) {
	for idx, object := range tf.Objects {
		if object.Id == id {
			tf.Objects = append(tf.Objects[:idx], tf.Objects[idx+1:]...)
			break
		}
	}
}

func (tf *TimeFrame) Write(writer *bufio.Writer, includeOffset bool) error {
	if includeOffset {
		_, err := writer.WriteString(fmt.Sprintf("#%F\n", tf.Offset))
		if err != nil {
			return err
		}
	}

	for _, object := range tf.Objects {
		object.Write(writer)
	}

	return nil
}

func (tf *TimeFrame) ToRaw() *RawTimeFrame {
	lines := make([]string, len(tf.Objects))
	idx := 0
	for _, object := range tf.Objects {
		lines[idx] = object.Serialize()
		idx += 1
	}

	return &RawTimeFrame{
		Offset:   tf.Offset,
		Contents: lines,
	}
}

// Set updates the given property
func (o *Object) Set(key string, value string) {
	for _, property := range o.Properties {
		if property.Key == key {
			property.Value = value
			return
		}
	}
	o.Properties = append(o.Properties, &Property{Key: key, Value: value})
}

// Get returns a property (if one exists) for a given key
func (o *Object) Get(key string) *Property {
	for _, property := range o.Properties {
		if property.Key == key {
			return property
		}
	}
	return nil
}

func (o *Object) Serialize() string {
	if o.Deleted {
		return fmt.Sprintf("-%x", o.Id)
	}

	var buffer []string
	for _, property := range o.Properties {
		buffer = append(buffer, fmt.Sprintf(
			"%s=%s",
			property.Key,
			strings.Replace(strings.Replace(property.Value, "\n", "\\\n", -1), ",", "\\,", -1)),
		)
	}

	return fmt.Sprintf("%x,%s", o.Id, strings.Join(buffer, ","))
}

func (o *Object) Write(writer *bufio.Writer) error {
	if o.Deleted {
		_, err := writer.WriteString(fmt.Sprintf("-%x\n", o.Id))
		return err
	}

	_, err := writer.WriteString(fmt.Sprintf("%x", o.Id))
	if err != nil {
		return err
	}

	if len(o.Properties) == 0 {
		_, err = writer.WriteString(",\n")
		return err
	}

	for _, property := range o.Properties {
		_, err = writer.WriteString(fmt.Sprintf(
			",%s=%s",
			property.Key,
			strings.Replace(strings.Replace(property.Value, "\n", "\\\n", -1), ",", "\\,", -1)),
		)
		if err != nil {
			return err
		}
	}

	_, err = writer.WriteString("\n")
	return err
}

func (r *Reader) parseObject(object *Object, data string) error {
	var parts []string

	if strings.Contains(data, `\,`) {
		var err error
		parts, err = splitPropertyTokens(data)
		if err != nil {
			return err
		}
	} else {
		// Fast-er path
		parts = strings.Split(data, ",")
	}

	for _, part := range parts {
		if len(part) == 0 {
			continue
		}
		partSplit := strings.SplitN(part, "=", 2)
		if len(partSplit) != 2 {
			return fmt.Errorf("Failed to parse property: `%v`", part)
		}

		object.Properties = append(object.Properties, &Property{Key: partSplit[0], Value: partSplit[1]})
	}

	return nil
}

// ProcessTimeFrames concurrently processes time frames from within the ACMI file,
//  producing them to an output channel. If your use case requires strong ordering
//  and you do not wish to implement this guarantee on the consumer side, you must
//  set the concurrency to 1.
func (r *Reader) ProcessTimeFrames(concurrency int, timeFrame chan<- *TimeFrame) error {
	bufferChan := make(chan []byte)

	var wg sync.WaitGroup
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()

			for {
				data, ok := <-bufferChan
				if data == nil || !ok {
					return
				}

				tf := NewTimeFrame()
				err := r.parseTimeFrame(data, tf, true)
				if err != nil && err != io.EOF {
					fmt.Printf("Failed to process time frame: (%v) %v\n", string(data), err)
					close(timeFrame)
					return
				}

				timeFrame <- tf
			}
		}()
	}

	err := r.timeFrameProducer(bufferChan)
	for i := 0; i < concurrency; i++ {
		bufferChan <- nil
	}

	wg.Wait()
	close(timeFrame)
	return err
}

func (r *Reader) timeFrameProducer(buffs chan<- []byte) error {
	var buf []byte
	for {
		line, err := r.reader.ReadBytes('\n')
		if err == io.EOF {
			buffs <- buf
			return nil
		} else if err != nil {
			return err
		}

		if line[0] != '#' {
			buf = append(buf, line...)
			continue
		}

		if len(buf) > 0 {
			buffs <- buf
		}
		buf = line
	}
}

func (r *Reader) parseTimeFrame(data []byte, timeFrame *TimeFrame, parseOffset bool) error {
	reader := bufio.NewReader(bytes.NewBuffer(data))
	return r.readTimeFrame(reader, timeFrame, parseOffset)
}

func (r *Reader) readTimeFrame(reader *bufio.Reader, timeFrame *TimeFrame, parseOffset bool) error {
	if parseOffset {
		line, err := reader.ReadString('\n')
		if err != nil {
			return err
		}

		if len(line) == 0 || line[0] != '#' {
			return fmt.Errorf("Expected time frame offset, found `%v`", line)
		}

		offset, err := strconv.ParseFloat(line[1:len(line)-1], 64)
		if err != nil {
			return err
		}

		timeFrame.Offset = offset
	}

	timeFrameObjectCache := make(map[uint64]*Object)

	for {
		buffer := ""

		nextLinePrefix, err := reader.Peek(1)
		if err != nil {
			return err
		}

		if nextLinePrefix[0] == '#' {
			break
		}

		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				return err
			}

			buffer = buffer + strings.TrimSuffix(line, "\n")
			if !strings.HasSuffix(buffer, "\\") {
				break
			}

			buffer = buffer[:len(buffer)-1] + "\n"
		}

		lineParts := strings.SplitN(buffer, ",", 2)
		if lineParts[0][0] == '-' {
			objectId, err := strconv.ParseUint(lineParts[0][1:], 16, 64)
			if err != nil {
				return err
			}

			if timeFrameObjectCache[objectId] != nil {
				timeFrameObjectCache[objectId].Deleted = true
			} else {
				object := &Object{Id: objectId, Properties: make([]*Property, 0), Deleted: true}
				timeFrameObjectCache[objectId] = object
				timeFrame.Objects = append(timeFrame.Objects, object)
			}
		} else {
			objectId, err := strconv.ParseUint(lineParts[0], 16, 64)
			if err != nil {
				return err
			}
			object, ok := timeFrameObjectCache[objectId]
			if !ok {
				object = &Object{
					Id:         objectId,
					Properties: make([]*Property, 0),
				}
				timeFrameObjectCache[objectId] = object
				timeFrame.Objects = append(timeFrame.Objects, object)
			}

			err = r.parseObject(object, lineParts[1])
			if err != nil {
				return err
			}
		}

	}

	return nil
}

func (r *Reader) readHeader() error {
	foundFileType := false
	foundFileVersion := false

	for {
		line, err := r.reader.ReadString('\n')
		if err != nil {
			return err
		}

		line = strings.TrimSuffix(line, "\n")

		matches := keyRe.FindAllStringSubmatch(line, -1)
		if len(matches) != 1 {
			return fmt.Errorf("Failed to parse key pair from line: `%v`", line)
		}

		if matches[0][1] == "FileType" && !foundFileType {
			foundFileType = true
			r.Header.FileType = matches[0][1]
		} else if matches[0][1] == "FileVersion" && !foundFileVersion {
			foundFileVersion = true
			r.Header.FileVersion = matches[0][2]
		}

		if foundFileType && foundFileVersion {
			break
		}
	}

	r.Header.InitialTimeFrame = *NewTimeFrame()
	err := r.readTimeFrame(r.reader, &r.Header.InitialTimeFrame, false)
	if err != nil {
		return err
	}

	globalObj := r.Header.InitialTimeFrame.Get(0)
	if globalObj == nil {
		return fmt.Errorf("No global object found in initial time frame")
	}

	referenceTimeProperty := globalObj.Get("ReferenceTime")
	if referenceTimeProperty == nil {
		return fmt.Errorf("Global object is missing ReferenceTime")
	}

	referenceTime, err := time.Parse("2006-01-02T15:04:05Z", referenceTimeProperty.Value)
	if err != nil {
		return fmt.Errorf("Failed to parse ReferenceTime: `%v`", referenceTimeProperty.Value)
	}

	r.Header.ReferenceTime = referenceTime

	return nil
}