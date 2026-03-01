package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/alioygur/gores"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"io"
	"io/ioutil"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
	//session "github.com/stripe/stripe-go/v71/checkout/session"
	"github.com/google/uuid"

	disgoauth "github.com/realTristan/disgoauth"
)

type httpServer struct {
	sync.Mutex

	config         *Config
	sessions       map[string]*serverSession
	elevationCache map[string]cachedElevation
}

type cachedElevation struct {
	meters float64
	at     time.Time
}

type geometry struct {
	Type        string `json:"type"`
	Id          int    `json:"id"`
	Name        string `json:"name"`
	DiscordName string `json:"discordName"`
	Avatar      string `json:"avatar"`
	//Position 	[]float32	`json:"position"`
	Points           [][]float32 `json:"points"`
	PointNames       []string    `json:"pointNames"`
	PointGroundFt    []float32   `json:"pointGroundFt"`
	PointGroundFtSet []bool      `json:"pointGroundFtSet"`
	Center           []float32   `json:"center"`
	Radius           float32     `json:"radius"`
	TypeSubmit       string      `json:"typeSubmit"`
	PosMGRS          string      `json:"posMGRS"`
	PosPoint         []float32   `json:"posPoint"`
	Screenshot       []string    `json:"screenshot"`
	Description      []string    `json:"description"`
	Side             string      `json:"side"`
	Server           string      `json:"server"`
	Task             interface{} `json:"task"`
	TaskUpdated      []Task      `json:"taskUpdated"`
	Status           string      `json:"status"`
	Clickable        bool        `json:"clickable"`
	Hidden           bool        `json:"hidden"`
	Color            string      `json:"color"`
	SubType          string      `json:"subType"`
	TimeStamp        string      `json:"timeStamp"`
	Marker           string      `json:"marker"`
	GroundFt         float32     `json:"groundFt"`
	GroundFtSet      bool        `json:"groundFtSet"`
}

type bg_geometry struct {
	node string
	data DataJson
}

type geometryList struct {
	Created []geometry
	Deleted []float32
	//Add string
}

type sessionDiscord struct {
	id        string
	username  string
	avatar    string
	expiresAt time.Time
}

type Task struct {
	Id   int      `json:"id"`
	Data TaskData `json:"data"`
}

type TaskData struct {
	Title  string     `json:"title"`
	Fields TaskFields `json:"fields"`
}

type TaskFields struct {
	Max_flight  int      `json:"max_flight"`
	Description []string `json:"description"`
	Status      string   `json:"status"`
}

func newHttpServer(config *Config) *httpServer {
	return &httpServer{
		config:         config,
		sessions:       make(map[string]*serverSession),
		elevationCache: make(map[string]cachedElevation),
	}
}

var elevationHTTPClient = &http.Client{Timeout: 4 * time.Second}

type openTopoDataResponse struct {
	Results []struct {
		Elevation *float64 `json:"elevation"`
	} `json:"results"`
}

func (h *httpServer) getElevation(w http.ResponseWriter, r *http.Request) {
	respondNoElevation := func(source string) {
		gores.JSON(w, 200, map[string]interface{}{
			"elevation_m": nil,
			"source":      source,
		})
	}

	latRaw := r.URL.Query().Get("lat")
	lonRaw := r.URL.Query().Get("lon")
	if latRaw == "" || lonRaw == "" {
		gores.Error(w, 400, "missing lat/lon")
		return
	}

	lat, err := strconv.ParseFloat(latRaw, 64)
	if err != nil {
		gores.Error(w, 400, "invalid lat")
		return
	}
	lon, err := strconv.ParseFloat(lonRaw, 64)
	if err != nil {
		gores.Error(w, 400, "invalid lon")
		return
	}

	cacheKey := fmt.Sprintf("%.4f,%.4f", lat, lon)
	h.Lock()
	cached, ok := h.elevationCache[cacheKey]
	h.Unlock()
	if ok && time.Since(cached.at) < 12*time.Hour {
		gores.JSON(w, 200, map[string]interface{}{
			"elevation_m": cached.meters,
			"source":      "srtm90m-cache",
		})
		return
	}

	url := fmt.Sprintf("https://api.opentopodata.org/v1/srtm90m?locations=%.6f,%.6f", lat, lon)
	resp, err := elevationHTTPClient.Get(url)
	if err != nil {
		respondNoElevation("provider-unavailable")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		respondNoElevation("provider-error")
		return
	}

	var data openTopoDataResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		respondNoElevation("provider-invalid")
		return
	}
	if len(data.Results) == 0 || data.Results[0].Elevation == nil {
		respondNoElevation("none")
		return
	}

	elevation := *data.Results[0].Elevation
	h.Lock()
	h.elevationCache[cacheKey] = cachedElevation{
		meters: elevation,
		at:     time.Now(),
	}
	h.Unlock()

	gores.JSON(w, 200, map[string]interface{}{
		"elevation_m": elevation,
		"source":      "srtm90m",
	})
}

var SessionsDiscord = map[string]sessionDiscord{}
var sessionsDiscordMu sync.RWMutex

const dbOperationTimeout = 3 * time.Second

func newDBTimeoutContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), dbOperationTimeout)
}

const (
	maxUploadRequestSize = 32 << 20 // 32 MiB
	maxUploadFileSize    = 8 << 20  // 8 MiB per file
	maxUploadFiles       = 8
)

var allowedUploadExtensions = map[string]bool{
	".png":  true,
	".jpg":  true,
	".jpeg": true,
	".webp": true,
}

var screenshotFetchClient = &http.Client{
	Timeout: 10 * time.Second,
	CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
		// Block redirects to avoid host-switch SSRF tricks.
		return http.ErrUseLastResponse
	},
}

func isAllowedScreenshotURL(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if !strings.EqualFold(parsed.Scheme, "https") {
		return false
	}
	if parsed.User != nil {
		return false
	}

	host := strings.ToLower(parsed.Hostname())
	if host != "cdn.discordapp.com" && host != "media.discordapp.net" {
		return false
	}

	return strings.Contains(parsed.Path, "/ephemeral-attachments/")
}

func sanitizeUploadExtension(filename string) (string, bool) {
	ext := strings.ToLower(filepath.Ext(filename))
	return ext, allowedUploadExtensions[ext]
}

func storeUploadedFile(fileHeader *multipart.FileHeader, assetsPath string) (string, error) {
	ext, ok := sanitizeUploadExtension(fileHeader.Filename)
	if !ok {
		return "", errors.New("unsupported file extension")
	}
	if fileHeader.Size <= 0 {
		return "", errors.New("empty file")
	}
	if fileHeader.Size > maxUploadFileSize {
		return "", errors.New("file too large")
	}

	src, err := fileHeader.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()

	filename := uuid.NewString() + ext
	dstPath := filepath.Join(assetsPath, filename)
	dst, err := os.Create(dstPath)
	if err != nil {
		return "", err
	}
	defer dst.Close()

	limited := io.LimitReader(src, maxUploadFileSize+1)
	written, err := io.Copy(dst, limited)
	if err != nil {
		return "", err
	}
	if written > maxUploadFileSize {
		return "", errors.New("file exceeds max size")
	}

	return filename, nil
}

func isSecureRequest(r *http.Request) bool {
	if r == nil {
		return false
	}
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

const discordSessionsFile = "discord_sessions.json"

type persistedDiscordSession struct {
	SessionToken string    `json:"sessionToken"`
	Id           string    `json:"id"`
	Username     string    `json:"username"`
	Avatar       string    `json:"avatar"`
	ExpiresAt    time.Time `json:"expiresAt"`
}

func loadDiscordSessions() {
	raw, err := os.ReadFile(discordSessionsFile)
	if err != nil {
		return
	}
	var data []persistedDiscordSession
	if err := json.Unmarshal(raw, &data); err != nil {
		log.Printf("failed to parse discord sessions cache: %v", err)
		return
	}

	now := time.Now()
	sessionsDiscordMu.Lock()
	defer sessionsDiscordMu.Unlock()
	for _, item := range data {
		if strings.TrimSpace(item.SessionToken) == "" || item.ExpiresAt.Before(now) {
			continue
		}
		if strings.TrimSpace(item.Id) == "" {
			continue
		}
		SessionsDiscord[item.SessionToken] = sessionDiscord{
			id:        item.Id,
			username:  item.Username,
			avatar:    item.Avatar,
			expiresAt: item.ExpiresAt,
		}
	}
}

func saveDiscordSessions() {
	now := time.Now()
	payload := []persistedDiscordSession{}
	sessionsDiscordMu.Lock()
	for sessionToken, session := range SessionsDiscord {
		if session.expiresAt.Before(now) {
			delete(SessionsDiscord, sessionToken)
			continue
		}
		payload = append(payload, persistedDiscordSession{
			SessionToken: sessionToken,
			Id:           session.id,
			Username:     session.username,
			Avatar:       session.avatar,
			ExpiresAt:    session.expiresAt,
		})
	}
	sessionsDiscordMu.Unlock()

	raw, err := json.Marshal(payload)
	if err != nil {
		log.Printf("failed to serialize discord sessions cache: %v", err)
		return
	}
	if err := os.WriteFile(discordSessionsFile, raw, 0o600); err != nil {
		log.Printf("failed to persist discord sessions cache: %v", err)
	}
}

func (h *httpServer) logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_token")
	if err == nil {
		sessionsDiscordMu.Lock()
		delete(SessionsDiscord, cookie.Value)
		sessionsDiscordMu.Unlock()
		saveDiscordSessions()
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    "",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		Path:     "/",
		HttpOnly: true,
		Secure:   isSecureRequest(r),
		SameSite: http.SameSiteLaxMode,
	})
	gores.JSON(w, 200, map[string]bool{"ok": true})
}

func cleanDiscordSessions() {
	changed := false
	now := time.Now()
	sessionsDiscordMu.Lock()
	for token, session := range SessionsDiscord {
		if !session.expiresAt.IsZero() && session.expiresAt.Before(now) {
			delete(SessionsDiscord, token)
			changed = true
		}
	}
	sessionsDiscordMu.Unlock()
	if changed {
		saveDiscordSessions()
	}
}

func cleanDiscordSessionsLoop() {
	ticker := time.NewTicker(time.Hour)
	for {
		<-ticker.C
		cleanDiscordSessions()
	}
}

// /////////////////////////////////
func (h *httpServer) getServerMetadata(server *TacViewServerConfig, session_token string) serverMetadata {
	discordSession, hasDiscordSession := getDiscordSession(session_token)
	isEditor := false
	if hasDiscordSession && slices.Contains(server.EditorId, discordSession.id) {
		isEditor = true
	}

	dcsMap := false
	if h.config.DCSMapsPathExternal != nil {
		dcsMap = true
	}

	result := serverMetadata{
		Name:                     server.Name,
		GroundUnitModes:          getGroundUnitModes(server),
		EnemyGURatio:             server.EnemyGroundUnitsRatio,
		EnemyGUMaxQty:            server.EnemyGroundUnitsMaxQuantity,
		FlightUnitModes:          getFlightUnitModes(server),
		Coalition:                getCoalition(server, session_token),
		Map:                      getMap(server),
		DiscordName:              discordSession.username,
		DiscordId:                discordSession.id,
		IsEditor:                 isEditor,
		EditorModeOn:             false,
		ViewAircraftWhenInFlight: server.ViewAircraftWhenInFlight,
		ZonesSize:                server.ZonesSize,
		Avatar:                   getAvatar(session_token),
		GCIs:                     []gciMetadata{},
		Enabled:                  h.sessions[server.Name].server.Enabled,
		DcsMap:                   dcsMap,
	}

	session, err := h.getOrCreateSession(server.Name)
	if err == nil {
		result.Players = session.GetPlayerList()
	}

	return result
}

// Returns a list of available servers
func (h *httpServer) getServerList(w http.ResponseWriter, r *http.Request) {
	session_token := ""
	if cookie, err := r.Cookie("session_token"); err == nil {
		session_token = cookie.Value
	}
	result := make([]serverMetadata, len(h.config.Servers))
	for idx, server := range h.config.Servers {
		// note: safe, we're not leaking this reference anywhere
		result[idx] = h.getServerMetadata(&server, session_token)

	}

	gores.JSON(w, 200, result)
}

type serverMetadata struct {
	Name                     string           `json:"name"`
	GroundUnitModes          []string         `json:"ground_unit_modes"`
	EnemyGURatio             int              `json:"ground_unit_ratio"`
	EnemyGUMaxQty            int              `json:"ground_unit_max_qty"`
	FlightUnitModes          []string         `json:"flight_unit_modes"`
	Players                  []PlayerMetadata `json:"players"`
	GCIs                     []gciMetadata    `json:"gcis"`
	Coalition                string           `json:"coalition"`
	Map                      string           `json:"map"`
	DiscordName              string           `json:"discord_name"`
	DiscordId                string           `json:"discord_id"`
	IsEditor                 bool             `json:"is_editor"`
	EditorModeOn             bool             `json:"editor_mode_on"`
	Avatar                   string           `json:"avatar"`
	ViewAircraftWhenInFlight bool             `json:"view_aircraft_when_in_flight"`
	Enabled                  bool             `json:"enabled"`
	ZonesSize                [][]interface{}  `json:"zones_size"`
	DcsMap                   bool             `json:"dcs_map"`
}

func getGroundUnitModes(config *TacViewServerConfig) []string {
	result := []string{}
	if config.EnableEnemyGroundUnits {
		result = append(result, "enemy")
	}
	if config.EnableFriendlyGroundUnits {
		result = append(result, "friendly")
	}
	return result
}

func getFlightUnitModes(config *TacViewServerConfig) []string {
	result := []string{}
	if config.EnableEnemyFlightUnits {
		result = append(result, "enemy")
	}
	if config.EnableFriendlyFlightUnits {
		result = append(result, "friendly")
	}
	return result
}

func getAvatar(session_token string) string {
	discordSession, ok := getDiscordSession(session_token)
	if !ok || discordSession.avatar == "nop" {
		return "https://freepngimg.com/thumb/categories/96.png"
	}
	return "https://cdn.discordapp.com/avatars/" + discordSession.id + "/" + discordSession.avatar + ".png"
}

func getDiscordSession(session_token string) (sessionDiscord, bool) {
	sessionsDiscordMu.RLock()
	discordSession, ok := SessionsDiscord[session_token]
	sessionsDiscordMu.RUnlock()
	if !ok {
		return sessionDiscord{username: "Guest", avatar: "nop"}, false
	}
	if strings.TrimSpace(discordSession.id) == "" {
		sessionsDiscordMu.Lock()
		delete(SessionsDiscord, session_token)
		sessionsDiscordMu.Unlock()
		saveDiscordSessions()
		return sessionDiscord{username: "Guest", avatar: "nop"}, false
	}
	if !discordSession.expiresAt.IsZero() && discordSession.expiresAt.Before(time.Now()) {
		sessionsDiscordMu.Lock()
		delete(SessionsDiscord, session_token)
		sessionsDiscordMu.Unlock()
		saveDiscordSessions()
		return sessionDiscord{username: "Guest", avatar: "nop"}, false
	}
	if strings.TrimSpace(discordSession.avatar) == "" {
		discordSession.avatar = "nop"
	}
	return discordSession, true
}

func getCoalition(server *TacViewServerConfig, session_token string) string {
	discordSession, ok := getDiscordSession(session_token)
	var Coals = []string{}
	if !ok {
		return server.DefaultCoalition
	}
	DiscordId := discordSession.id

	if db != nil {
		req := "SELECT coalitions.coalition FROM coalitions, players WHERE server_name = $1 AND coalitions.player_ucid = players.ucid AND discord_id = $2"
		ctx, cancel := newDBTimeoutContext()
		rows, err := db.QueryContext(ctx, req, server.DcsName, DiscordId)
		if err != nil {
			cancel()
			log.Printf("getCoalition query error for discord_id=%q: %v", DiscordId, err)
			return server.DefaultCoalition
		}

		for rows.Next() {
			var Coal string

			err = rows.Scan(&Coal)
			CheckError(err)

			Coals = append(Coals, Coal)
		}
		_ = rows.Close()
		cancel()
	}
	Coals = append(Coals, server.DefaultCoalition)

	return Coals[0]
}

func getMap(server *TacViewServerConfig) string {

	var MapName string
	if db != nil {
		req := "SELECT mission_theatre FROM public.missions WHERE server_name = $1 ORDER BY id desc limit 1"
		ctx, cancel := newDBTimeoutContext()
		rows, err := db.QueryContext(ctx, req, server.DcsName)
		if err != nil {
			cancel()
			CheckError(err)
			return MapName
		}

		for rows.Next() {

			err = rows.Scan(&MapName)
			CheckError(err)
		}
		_ = rows.Close()
		cancel()
	}

	return MapName
}

func (h *httpServer) ensureServer(w http.ResponseWriter, r *http.Request) *TacViewServerConfig {
	serverName := chi.URLParam(r, "serverName")

	var server *TacViewServerConfig
	for _, checkServer := range h.config.Servers {
		if checkServer.Name == serverName {
			server = &checkServer
			break
		}
	}
	if server == nil {
		gores.Error(w, 404, "server not found")
		return nil
	}
	return server
}

type gciMetadata struct {
	Id        string    `json:"id"`
	Notes     string    `json:"notes"`
	ExpiresAt time.Time `json:"expires_at"`
}

// Return information about a specific server
func (h *httpServer) getServer(w http.ResponseWriter, r *http.Request) {
	server := h.ensureServer(w, r)
	if server == nil {
		return
	}
	session_token := ""
	if cookie, err := r.Cookie("session_token"); err == nil {
		session_token = cookie.Value
	}
	gores.JSON(w, 200, h.getServerMetadata(server, session_token))
}

var errNoServerFound = errors.New("no server by that name was found")

func (h *httpServer) getOrCreateSession(serverName string) (*serverSession, error) {
	h.Lock()
	defer h.Unlock()

	existingSession := h.sessions[serverName]
	if existingSession != nil {
		return existingSession, nil
	}

	var server *TacViewServerConfig
	for _, checkServer := range h.config.Servers {
		if checkServer.Name == serverName {
			server = &checkServer
			break
		}
	}
	if server == nil {
		return nil, errNoServerFound
	}

	var err error
	h.sessions[serverName], err = newServerSession(server)
	if err != nil {
		return nil, err
	}

	go h.sessions[serverName].run()
	return h.sessions[serverName], nil
}

// Streams events for a given server
func (h *httpServer) initServerEvents(w http.ResponseWriter, r *http.Request) {
	session, err := h.getOrCreateSession(chi.URLParam(r, "serverName"))
	if err != nil {
		if err == errNoServerFound {
			gores.Error(w, 404, "server not found")
			return
		}
		gores.Error(w, 500, "failed to find or create server session")
		return
	}
	sharedGeometry := session.runSharedGeometry(-1, -1, "Init")
	gores.JSON(w, 200, sharedGeometry)
}

// Streams events for a given server
func (h *httpServer) streamServerEvents(w http.ResponseWriter, r *http.Request) {
	session, err := h.getOrCreateSession(chi.URLParam(r, "serverName"))
	if err != nil {
		if err == errNoServerFound {
			gores.Error(w, 404, "server not found")
			return
		}

		gores.Error(w, 500, "failed to find or create server session")
		return
	}

	sub, subCloser := session.addSub()
	defer subCloser()

	f, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Transfer-Encoding", "chunked")

	publish := func(event string, data interface{}) {
		encoded, err := json.Marshal(map[string]interface{}{
			"e": event,
			"d": data,
		})
		if err != nil {
			return
		}

		outgoing := []byte("data: ")
		outgoing = append(outgoing, encoded...)
		outgoing = append(outgoing, '\n', '\n')
		w.Write(outgoing)
		f.Flush()
	}

	// Send initial data
	initialStateData, objects := session.getInitialState()
	if initialStateData != nil {
		publish("SESSION_STATE", initialStateData)

		publish("SESSION_RADAR_SNAPSHOT", &sessionRadarSnapshotData{
			Offset:  initialStateData.Offset,
			Created: objects,
			Updated: []*StateObject{},
			Deleted: []uint64{},
		})

		//session.runSharedGeometry(-1, -1, "Stream")
		//fmt.Println(session.server.DcsName)
		//session.runSharedGeometry()
	}

	done := make(chan struct{})
	notify := w.(middleware.WrapResponseWriter).Unwrap().(http.CloseNotifier).CloseNotify()
	go func() {
		<-notify
		close(done)
		log.Printf("Connection closed")
	}()

	for {
		select {
		case msg, ok := <-sub:
			if !ok {
				return
			}

			outgoing := []byte("data: ")
			outgoing = append(outgoing, msg...)
			outgoing = append(outgoing, '\n', '\n')
			w.Write(outgoing)
			f.Flush()
		case <-done:
			return
		}

	}
}

type SqlResponse struct {
	Id int
}

var geoListGlob = []geometry{}
var geoListDel = []int{}
var counter = 10000

func (h *httpServer) share(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_token")
	if err != nil {
		gores.Error(w, 401, "missing discord session")
		return
	}
	session_token := cookie.Value
	if _, ok := getDiscordSession(session_token); !ok {
		gores.Error(w, 401, "discord session expired")
		return
	}
	serverName := chi.URLParam(r, "serverName")
	session, err := h.getOrCreateSession(serverName)
	if err != nil {
		if err == errNoServerFound {
			gores.Error(w, 404, "server not found")
			return
		}
		gores.Error(w, 500, "failed to find or create server session")
		return
	}
	coalition := getCoalition(session.server, session_token)
	dcsName := session.server.DcsName

	var geo geometry
	var Id int

	err2 := json.NewDecoder(r.Body).Decode(&geo)
	if err2 != nil {
		log.Printf(err2.Error())
		http.Error(w, err2.Error(), http.StatusBadRequest)
		return
	}

	if db != nil {
		err = db.Ping()
	} else {
		err = errors.New("no database")
	}
	sqlStatement := ""
	log.Printf("share handler: starting geometry processing")
	if err == nil {
		if geo.TypeSubmit == "share" || geo.TypeSubmit == "update" {
			if geo.Type == "quest" {
				var DataJson DataJson
				//DataJson.Command = "sendEmbed"
				//DataJson.Color = 113805
				DataJson.Title = geo.Name
				DataJson.Author.Name = geo.DiscordName
				DataJson.Author.Icon_url = geo.Avatar
				DataJson.Fields.PosPoint = geo.PosPoint
				DataJson.Fields.PosMGRS = geo.PosMGRS
				DataJson.Fields.PosType = "MGRS"
				DataJson.Fields.Side = geo.Side
				DataJson.Fields.Color = geo.Color
				DataJson.Fields.Status = geo.Status
				DataJson.Fields.Clickable = geo.Clickable
				DataJson.Fields.Hidden = geo.Hidden
				DataJson.Fields.Type = geo.Type
				DataJson.Fields.Screenshot = geo.Screenshot
				DataJson.Fields.Description = geo.Description
				DataJson.Fields.Points = geo.Points
				DataJson.Fields.PointNames = geo.PointNames
				DataJson.Fields.PointGroundFt = geo.PointGroundFt
				DataJson.Fields.PointGroundFtSet = geo.PointGroundFtSet
				DataJson.Fields.Center = geo.Center
				DataJson.Fields.Radius = geo.Radius
				DataJson.Fields.GroundFt = geo.GroundFt
				DataJson.Fields.GroundFtSet = geo.GroundFtSet

				data, err := json.Marshal(DataJson)
				//fmt.Println(string(data))
				//dataRaw := json.RawMessage(data)
				CheckError(err)

				if geo.TypeSubmit == "share" {
					sqlStatement = `INSERT INTO bg_missions (server_name, data)
									VALUES ($1, $2) RETURNING id`
					err = db.QueryRow(sqlStatement, dcsName, string(data)).Scan(&Id)
				} else {
					sqlStatement = `UPDATE bg_missions
									SET time=$1, data=$2
									WHERE id = $3`
					_, err = db.Exec(sqlStatement, geo.TimeStamp, string(data), geo.Id)
					Id = geo.Id
				}
				CheckError(err)

				var DataJsonTask TaskData
				for _, Task := range geo.TaskUpdated {
					//fmt.Println(strconv.Itoa(Task.Id))
					DataJsonTask.Title = Task.Data.Title
					DataJsonTask.Fields.Status = Task.Data.Fields.Status
					DataJsonTask.Fields.Description = Task.Data.Fields.Description
					DataJsonTask.Fields.Max_flight = Task.Data.Fields.Max_flight
					data, err = json.Marshal(DataJsonTask)
					if Task.Data.Fields.Status == "Deleted" {
						if Task.Id != 0 {
							_, err = db.Exec(`DELETE FROM bg_task where id=$1`, Task.Id)
							CheckError(err)
						}
					} else if Task.Id == 0 {
						sqlStatement = `INSERT INTO bg_task (id_mission, server_name, data)
										VALUES ($1, $2, $3)`
						_, err = db.Exec(sqlStatement, Id, dcsName, string(data))
						CheckError(err)
					} else {
						sqlStatement = `UPDATE bg_task
										SET time=$1, data=$2
										WHERE id = $3`
						_, err = db.Exec(sqlStatement, geo.TimeStamp, string(data), Task.Id)
						CheckError(err)
					}
				}

				//var	DataJsonTask []DataJsonTask
				//err = json.Unmarshal(geo.Task, &DataJsonTask)
				//fmt.Println(strconv.Itoa(len(DataJsonTask)))
				//m := geo.Task.(map[string]interface{})
				//fmt.Println(m)
				//CheckError(err)
			} else {
				log.Printf("share handler: processing mission update")
				var DataJson DataJson
				//DataJson.Command = "sendEmbed"
				//DataJson.Color = 113805
				DataJson.Title = geo.Name
				DataJson.Author.Name = geo.DiscordName
				DataJson.Author.Icon_url = geo.Avatar
				DataJson.Fields.PosMGRS = geo.PosMGRS
				DataJson.Fields.PosPoint = geo.PosPoint
				DataJson.Fields.PosType = "POINT"
				DataJson.Fields.Side = geo.Side
				DataJson.Fields.Color = geo.Color
				DataJson.Fields.Status = geo.Status
				DataJson.Fields.Clickable = geo.Clickable
				DataJson.Fields.Hidden = geo.Hidden
				DataJson.Fields.Type = geo.Type
				DataJson.Fields.Screenshot = geo.Screenshot
				DataJson.Fields.Description = geo.Description
				DataJson.Fields.Points = geo.Points
				DataJson.Fields.PointNames = geo.PointNames
				DataJson.Fields.PointGroundFt = geo.PointGroundFt
				DataJson.Fields.PointGroundFtSet = geo.PointGroundFtSet
				DataJson.Fields.Center = geo.Center
				DataJson.Fields.Radius = geo.Radius
				DataJson.Fields.GroundFt = geo.GroundFt
				DataJson.Fields.GroundFtSet = geo.GroundFtSet

				data, err := json.Marshal(DataJson)
				//fmt.Println(string(data))
				//dataRaw := json.RawMessage(data)
				CheckError(err)

				if geo.TypeSubmit == "share" {
					sqlStatement = `INSERT INTO bg_geometry2 (server_name, data)
									VALUES ($1, $2) RETURNING id`
					err = db.QueryRow(sqlStatement, dcsName, string(data)).Scan(&Id)
				} else {
					sqlStatement = `UPDATE bg_geometry2
									SET time=timezone('utc'::text, now()), data=$1
									WHERE id = $2`
					log.Printf("share handler SQL: %s", sqlStatement)
					//_, err = db.Exec(sqlStatement, geo.TimeStamp, string(data), strconv.Itoa(geo.Id))
					_, err = db.Exec(sqlStatement, string(data), geo.Id)
					Id = geo.Id
				}

				//fmt.Println(strconv.Itoa(Id))
				CheckError(err)
			}
		}
		if geo.TypeSubmit == "delete" && geo.Id > 10000 {
			geoListDel = append(geoListDel, geo.Id)
			for i, v := range geoListGlob {
				if v.Id == geo.Id {
					geoListGlob = append(geoListGlob[:i], geoListGlob[i+1:]...)
					break
				}
			}
			_, e := db.Exec(`DELETE FROM bg_geometry2 where id=$1`, geo.Id)
			CheckError(e)
			_, e2 := db.Exec(`DELETE FROM bg_missions where id=$1`, geo.Id)
			CheckError(e2)
			_, e3 := db.Exec(`DELETE FROM bg_task where id_mission=$1`, geo.Id)
			CheckError(e3)
		}
	} else {
		if geo.TypeSubmit == "share" {
			counter = counter + 1
			geo.Id = counter
			geo.Side = coalition
			geo.Server = dcsName
			geoListGlob = append(geoListGlob, geo)
			Id = geo.Id
		}
		if geo.TypeSubmit == "delete" && geo.Id > 10000 {
			Id = geo.Id
			geoListDel = append(geoListDel, geo.Id)
			for i, v := range geoListGlob {
				if v.Id == geo.Id {
					geoListGlob = append(geoListGlob[:i], geoListGlob[i+1:]...)
					break
				}
			}
		}
	}
	var RadarRefreshRate int64
	RadarRefreshRate = 5
	if session.server.RadarRefreshRate != 0 {
		RadarRefreshRate = session.server.RadarRefreshRate
	}
	session.runSharedGeometry(RadarRefreshRate, -1, "Stream")
	gores.JSON(w, 200, SqlResponse{Id: Id})
}

type TaskEnrolment struct {
	TaskId int `json:"taskId"`
}

func (h *httpServer) taskenrolment(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_token")
	if err != nil {
		gores.Error(w, 401, "missing discord session")
		return
	}
	session_token := cookie.Value
	discordSession, ok := getDiscordSession(session_token)
	if !ok {
		gores.Error(w, 401, "discord session expired")
		return
	}
	DiscordId := discordSession.id
	//serverName := chi.URLParam(r, "serverName")

	var taskEnrolment TaskEnrolment

	err = json.NewDecoder(r.Body).Decode(&taskEnrolment)
	if err != nil {
		log.Printf(err.Error())
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if db != nil {
		err = db.Ping()
		if err == nil {
			TaskId := 0
			rows, err2 := db.Query(`SELECT id_task FROM bg_task_user_rltn WHERE id_task = $1 AND discord_id = $2`, taskEnrolment.TaskId, DiscordId)
			CheckError(err2)
			defer rows.Close()
			for rows.Next() {
				err = rows.Scan(&TaskId)
				CheckError(err)
			}

			sqlStatement := `DELETE FROM bg_task_user_rltn WHERE discord_id = $1`
			_, err = db.Exec(sqlStatement, DiscordId)
			CheckError(err)

			if TaskId != taskEnrolment.TaskId {
				sqlStatement = `INSERT INTO bg_task_user_rltn (id_task, discord_id)
								VALUES ($1, $2)`
				_, err = db.Exec(sqlStatement, taskEnrolment.TaskId, DiscordId)

				CheckError(err)
			}
		}
	}
	session, err := h.getOrCreateSession(chi.URLParam(r, "serverName"))
	if err != nil {
		if err == errNoServerFound {
			gores.Error(w, 404, "server not found")
			return
		}
		gores.Error(w, 500, "failed to find or create server session")
		return
	}
	session.runSharedGeometry(-1, -1, "Stream")
	gores.JSON(w, 200, taskEnrolment)
}

func (h *httpServer) resend(w http.ResponseWriter, r *http.Request) {
	var geo geometry

	err := json.NewDecoder(r.Body).Decode(&geo)
	if err != nil {
		log.Printf(err.Error())
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	session, err := h.getOrCreateSession(chi.URLParam(r, "serverName"))
	if err != nil {
		if err == errNoServerFound {
			gores.Error(w, 404, "server not found")
			return
		}
		gores.Error(w, 500, "failed to find or create server session")
		return
	}
	session.runSharedGeometry(0, geo.Id, "Stream")
	gores.JSON(w, 200, SqlResponse{Id: geo.Id})
}

type User struct {
	Name  string
	Email string
	Age   int
}

type UploadResponse struct {
	Files []string
}

func (h *httpServer) uploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, err := r.Cookie("session_token")
	if err != nil {
		gores.Error(w, 401, "missing discord session")
		return
	}
	if _, ok := getDiscordSession(cookie.Value); !ok {
		gores.Error(w, 401, "discord session expired")
		return
	}

	if h.config.AssetsPathExternal == nil {
		gores.Error(w, 500, "upload storage is not configured")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadRequestSize)
	if err := r.ParseMultipartForm(maxUploadRequestSize); err != nil {
		gores.Error(w, 400, "invalid multipart form")
		return
	}

	headers := r.MultipartForm.File["attachments"]
	if len(headers) == 0 {
		gores.Error(w, 400, "no attachments provided")
		return
	}
	if len(headers) > maxUploadFiles {
		gores.Error(w, 400, "too many attachments")
		return
	}

	filesnames := make([]string, 0, len(headers))
	for _, header := range headers {
		filename, err := storeUploadedFile(header, *h.config.AssetsPathExternal)
		if err != nil {
			gores.Error(w, 400, err.Error())
			return
		}
		filesnames = append(filesnames, filename)
	}

	resp := UploadResponse{Files: filesnames}
	gores.JSON(w, 200, resp)
}

func CheckError(err error) {
	if err != nil {
		log.Printf("runtime error: %v", err)
	}
}

func (h *httpServer) cleanLoop() {
	refreshRate := time.Duration(30)
	ticker := time.NewTicker(time.Second * refreshRate)

	for {
		<-ticker.C

		//fmt.Println("cleanLoop")
		err := db.Ping()
		var Id int
		var Nbr int
		var Data []byte
		if err == nil {
			if h.config.AssetsPathExternal == nil {
				log.Printf("cleanLoop: assets_path_external is not configured")
				continue
			}
			rows, err := db.Query(`SELECT id, data
									FROM bg_geometry2 
									WHERE data->'fields'->>'screenshot' like '%"%ephemeral-attachments%"%'`)
			if err != nil {
				CheckError(err)
				continue
			}
			for rows.Next() {
				err = rows.Scan(&Id, &Data)
				CheckError(err)

				var DataJson DataJson
				err = json.Unmarshal(Data, &DataJson)
				//fmt.Println(DataJson.Fields.Screenshot)

				for i, screen := range DataJson.Fields.Screenshot {
					if strings.Contains(screen, "ephemeral-attachments") {
						if !isAllowedScreenshotURL(screen) {
							log.Printf("cleanLoop: blocked non-allowlisted screenshot URL")
							continue
						}

						file, err1 := screenshotFetchClient.Get(screen)
						if err1 != nil {
							log.Println("cleanLoop screenshot fetch error:", err1)
							continue
						}
						if file.StatusCode < 200 || file.StatusCode >= 300 {
							_ = file.Body.Close()
							log.Printf("cleanLoop screenshot fetch status=%d", file.StatusCode)
							continue
						}
						//filename := uuid.NewString() + filepath.Ext(path.Base(resp.Request.URL.String()))
						filename := uuid.NewString() + strings.Split(filepath.Ext(screen), "?")[0]

						dst, err2 := os.Create(*h.config.AssetsPathExternal + filename)
						if err2 != nil {
							_ = file.Body.Close()
							log.Println("cleanLoop screenshot store error:", err2)
							continue
						}
						_, err3 := io.Copy(dst, file.Body)
						_ = file.Body.Close()
						_ = dst.Close()
						if err3 != nil {
							log.Println("cleanLoop screenshot copy error:", err3)
							continue
						}

						DataJson.Fields.Screenshot[i] = "$CURRENT_SERV/files/" + filename
					}
				}
				//fmt.Println(DataJson.Fields.Screenshot)

				data, err4 := json.Marshal(DataJson)
				CheckError(err4)
				sqlStatement := `UPDATE bg_geometry2
								SET data = $1
								WHERE id = $2`
				_, err = db.Exec(sqlStatement, string(data), Id)
				CheckError(err)
			}
			_ = rows.Close()

			//fmt.Println("Loop file")
			items, _ := ioutil.ReadDir(*h.config.AssetsPathExternal)
			for _, item := range items {
				pattern := "%\"%" + item.Name() + "%\"%"
				rows2, err4 := db.Query(`SELECT sum(count)
										FROM
											(SELECT count(*)
											FROM bg_geometry2 
											WHERE data->'fields'->>'screenshot' like $1	
											union
											SELECT count(*)
											FROM bg_missions
											WHERE data->'fields'->>'screenshot' like $1) t1`, pattern)
				if err4 != nil {
					CheckError(err4)
					continue
				}
				for rows2.Next() {
					err = rows2.Scan(&Nbr)
					CheckError(err)
					if Nbr == 0 && item.ModTime().Add(time.Hour*24*7).Compare(time.Now()) == -1 {
						e := os.Remove(*h.config.AssetsPathExternal + item.Name())
						CheckError(e)
					}
				}
				_ = rows2.Close()
			}
		}
	}
}

func Run(config *Config) error {
	closeLogger, err := setupLogging(config)
	if err != nil {
		return fmt.Errorf("failed to initialize logging: %w", err)
	}
	defer closeLogger()

	server := newHttpServer(config)
	initDB(config)
	loadDiscordSessions()
	cleanDiscordSessions()
	go server.cleanLoop()
	go cleanDiscordSessionsLoop()

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://*", "http://*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// Establish a new discord client
	var dc *disgoauth.Client = disgoauth.Init(&disgoauth.Client{
		ClientID:     config.ClientID,
		ClientSecret: config.ClientSecret,
		RedirectURI:  config.RedirectURI,
		Scopes:       []string{disgoauth.ScopeIdentify},
	})

	// Listen and Serve to the incoming http requests
	//http.ListenAndServe(":8086", nil)

	r.Get("/discord/", func(w http.ResponseWriter, r *http.Request) {
		returnTo := "/"
		if state := r.URL.Query().Get("return_to"); strings.HasPrefix(state, "/") && !strings.HasPrefix(state, "//") {
			returnTo = state
		}
		dc.RedirectHandler(w, r, returnTo) // w: http.ResponseWriter, r: *http.Request, state: string
	})

	r.Get("/redirect/", func(w http.ResponseWriter, r *http.Request) {
		redirectPath := "/"
		if state := r.URL.Query().Get("state"); strings.HasPrefix(state, "/") && !strings.HasPrefix(state, "//") {
			redirectPath = state
		}

		query := r.URL.Query()
		if query["code"] == nil {
			log.Printf("Redirect - Bad query")
			http.Redirect(w, r, redirectPath, http.StatusSeeOther)
			return
		}

		codeFromURLParamaters := query["code"][0]
		log.Printf("Discord OAuth code received")

		// Get the access token using the above codeFromURLParamaters
		var accessToken, err1 = dc.GetOnlyAccessToken(codeFromURLParamaters)

		if err1 != nil {
			log.Printf("Redirect - No Token")
			log.Printf("Check your client secret :)")
			//CheckError(err1)

			http.Redirect(w, r, redirectPath, http.StatusSeeOther)
			return
		}
		// Get the authorized user's data using the above accessToken
		var userData, _ = disgoauth.GetUserData(accessToken)

		// Create a new random session token
		// we use the "github.com/google/uuid" library to generate UUIDs
		sessionToken := uuid.NewString()
		expiresAt := time.Now().Add(36000 * time.Second)

		// Finally, we set the client cookie for "session_token" as the session token we just generated
		// we also set an expiry time of 120 seconds
		http.SetCookie(w, &http.Cookie{
			Name:     "session_token",
			Value:    sessionToken,
			Expires:  expiresAt,
			Path:     "/",
			HttpOnly: true,
			Secure:   isSecureRequest(r),
			SameSite: http.SameSiteLaxMode,
		})
		//fmt.Fprint(w, userData)

		id, err2 := userData["id"].(string)
		user, err3 := userData["username"].(string)
		avatar, err4 := userData["avatar"].(string)
		if err2 == false || err3 == false {
			log.Printf("Redirect - Bad user")
			http.Redirect(w, r, redirectPath, http.StatusSeeOther)
		}
		if err4 == false {
			avatar = "nop"
		}
		sessionsDiscordMu.Lock()
		SessionsDiscord[sessionToken] = sessionDiscord{
			id:        id,
			username:  user,
			avatar:    avatar,
			expiresAt: expiresAt,
		}
		sessionsDiscordMu.Unlock()
		saveDiscordSessions()

		log.Printf("Redirect - Session created")
		http.Redirect(w, r, redirectPath, http.StatusSeeOther)

		// Print the user data map
		//fmt.Fprint(w, userData)
	})

	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		server.serveEmbeddedFile("index.html", w, r)
	})
	r.Get("/static/*", server.serveEmbeddedStaticAssets)
	r.Get("/files/*", server.serveEmbeddedStaticAssetsExternal)
	r.Get("/maps/*", server.serverDCSMaps)
	r.Get("/api/servers", server.getServerList)
	r.Get("/api/elevation", server.getElevation)
	r.Get("/api/servers/{serverName}", server.getServer)
	r.Get("/api/servers/{serverName}/init", server.initServerEvents)
	r.Get("/api/servers/{serverName}/events", server.streamServerEvents)
	r.Post("/api/logout", server.logout)
	r.Post("/servers/{serverName}/share", server.share)
	r.Post("/servers/{serverName}/taskenrolment", server.taskenrolment)
	r.Post("/servers/{serverName}/resend", server.resend)
	r.Post("/upload", server.uploadHandler)

	log.Printf("Starting up %v Tacview clients", len(config.Servers))
	for _, serverConfig := range config.Servers {
		server.getOrCreateSession(serverConfig.Name)
	}

	httpServer := &http.Server{
		Addr:              config.Bind,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		// Keep write timeout disabled to support long-lived SSE streams.
		WriteTimeout:   0,
		IdleTimeout:    120 * time.Second,
		MaxHeaderBytes: 1 << 20,
	}

	return httpServer.ListenAndServe()
}
