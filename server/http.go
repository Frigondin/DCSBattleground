package server

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"sync"
	"time"
	"fmt"
	"io"
	"io/ioutil"
	"strconv"
	"os"
	"strings"
	"github.com/alioygur/gores"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	//session "github.com/stripe/stripe-go/v71/checkout/session"
	"github.com/google/uuid"
	"path/filepath"
	"slices"
	
	disgoauth "github.com/realTristan/disgoauth"
)

type httpServer struct {
	sync.Mutex

	config   *Config
	sessions map[string]*serverSession
}

	
type geometry struct {
	Type     	string  	`json:"type"`
	Id       	int     	`json:"id"`
	Name     	string  	`json:"name"`
	DiscordName string		`json:"discordName"`
	Avatar		string		`json:"avatar"`
	//Position 	[]float32	`json:"position"`
	Points   	[][]float32	`json:"points"`
	Center	 	[]float32  	`json:"center"`
	Radius	 	float32  	`json:"radius"`
	TypeSubmit 	string  	`json:"typeSubmit"`
	PosMGRS		string 		`json:"posMGRS"`
	PosPoint	[]float32	`json:"posPoint"`
	Screenshot 	[]string  	`json:"screenshot"`
	Description []string	`json:"description"`
	Side		string		`json:"side"`
	Server		string		`json:"server"`
	Task		interface{}	`json:"task"`
	TaskUpdated	[]Task		`json:"taskUpdated"`
	Status		string		`json:"status"`
	Clickable	bool		`json:"clickable"`
	Color		string		`json:"color"`
	SubType		string		`json:"subType"`
	TimeStamp	string  	`json:"timeStamp"`
	Marker		string		`json:"marker"`
}

type bg_geometry struct {
	node		string
	data		DataJson
}

type geometryList struct {
	Created []geometry
	Deleted []float32
	//Add string
}

type sessionDiscord struct {
	id			string
	username	string
	avatar		string
}

type Task struct {
	Id			int			`json:"id"`
	Data 		TaskData	`json:"data"`
}

type TaskData struct {
	Title		string		`json:"title"`
	Fields		TaskFields	`json:"fields"`
}

type TaskFields struct {
	Max_flight	int			`json:"max_flight"`
	Description	[]string	`json:"description"`
	Status		string		`json:"status"`
}




func newHttpServer(config *Config) *httpServer {
	return &httpServer{
		config:   config,
		sessions: make(map[string]*serverSession),
	}
}

var SessionsDiscord = map[string]sessionDiscord{}

///////////////////////////////////
func (h *httpServer) getServerMetadata(server *TacViewServerConfig, session_token string) serverMetadata {
	isEditor := false
	if slices.Contains(server.EditorId, SessionsDiscord[session_token].id) {
		isEditor = true
	}
	
	result := serverMetadata{
		Name:            			server.Name,
		GroundUnitModes: 			getGroundUnitModes(server),
		EnemyGURatio:	 			server.EnemyGroundUnitsRatio,
		EnemyGUMaxQty:	 			server.EnemyGroundUnitsMaxQuantity,
		FlightUnitModes: 			getFlightUnitModes(server),
		Coalition:		 			getCoalition(server, session_token),
		Map:		 				getMap(server),
		DiscordName:	 			SessionsDiscord[session_token].username,
		DiscordId:	 	 			SessionsDiscord[session_token].id,
		IsEditor:					isEditor,
		EditorModeOn:				false,
		ViewAircraftWhenInFlight:	server.ViewAircraftWhenInFlight,
		ZonesSize:		 			server.ZonesSize,
		Avatar:			 			getAvatar(session_token),
		GCIs:            			[]gciMetadata{},
		Enabled:		 			h.sessions[server.Name].server.Enabled,
	}



	session, err := h.getOrCreateSession(server.Name)
	if err == nil {
		result.Players = session.GetPlayerList()
	}


	return result
}

// Returns a list of available servers
func (h *httpServer) getServerList(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_token")
	if err != nil {
		panic(err)
	}
	session_token := cookie.Value
	result := make([]serverMetadata, len(h.config.Servers))
	for idx, server := range h.config.Servers {
		// note: safe, we're not leaking this reference anywhere
		result[idx] = h.getServerMetadata(&server, session_token)

	}

	gores.JSON(w, 200, result)
}

type serverMetadata struct {
	Name            string           `json:"name"`
	GroundUnitModes []string         `json:"ground_unit_modes"`
	EnemyGURatio	int				 `json:"ground_unit_ratio"`	
	EnemyGUMaxQty	int				 `json:"ground_unit_max_qty"`	
	FlightUnitModes []string		 `json:"flight_unit_modes"`
	Players         []PlayerMetadata `json:"players"`
	GCIs            []gciMetadata    `json:"gcis"`
	Coalition		string			 `json:"coalition"`
	Map				string			 `json:"map"`
	DiscordName		string			 `json:"discord_name"`
	DiscordId		string			 `json:"discord_id"`
	IsEditor		bool			 `json:"is_editor"`
	EditorModeOn	bool			 `json:"editor_mode_on"`
	Avatar			string			 `json:"avatar"`
	ViewAircraftWhenInFlight bool	 `json:"view_aircraft_when_in_flight"`
	Enabled			bool			 `json:"enabled"`
	ZonesSize		[][]interface{}	 `json:"zones_size"`
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
	if (SessionsDiscord[session_token].avatar == "nop") {
		return "https://freepngimg.com/thumb/categories/96.png"
	} else {
		return "https://cdn.discordapp.com/avatars/" + SessionsDiscord[session_token].id + "/" +  SessionsDiscord[session_token].avatar + ".png"
	}
}

func getCoalition(server *TacViewServerConfig, session_token string) string {
	DiscordId := SessionsDiscord[session_token].id
	var Coals = []string{}

	if db != nil {
		err := db.Ping()
		if err == nil {
			req := "SELECT coalitions.coalition FROM coalitions, players WHERE server_name = $1 AND coalitions.player_ucid = players.ucid AND discord_id = $2"
			rows, err := db.Query(req, server.DcsName, DiscordId)
			CheckError(err)
			
			defer rows.Close()
			for rows.Next() {
				var Coal string
			 
				err = rows.Scan(&Coal)
				CheckError(err)
				
				Coals = append(Coals, Coal)
			}
		}
	}
	Coals = append(Coals, server.DefaultCoalition)	

	return Coals[0]
}

func getMap(server *TacViewServerConfig) string {

	var MapName string
	err := db.Ping()
	if err == nil {
		req := "SELECT mission_theatre FROM public.missions WHERE server_name = $1 ORDER BY id desc limit 1"
		rows, err := db.Query(req, server.DcsName)
		CheckError(err)
		
		defer rows.Close()
		for rows.Next() {
		 
			err = rows.Scan(&MapName)
			CheckError(err)
		}
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
	cookie, err := r.Cookie("session_token")
	if err != nil {
		panic(err)
	}
	session_token := cookie.Value
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
	Id		int
}

var geoListGlob = []geometry{}
var geoListDel = []int{}
var counter = 10000;
func (h *httpServer) share(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_token")
	CheckError(err)
	session_token := cookie.Value
	serverName := chi.URLParam(r, "serverName")
	coalition := getCoalition(h.sessions[serverName].server, session_token)
	dcsName := h.sessions[serverName].server.DcsName	

	

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
	if err == nil {
		if (geo.TypeSubmit == "share" || geo.TypeSubmit == "update") {
			if (geo.Type == "quest") {
				var	DataJson DataJson
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
				DataJson.Fields.Type = geo.Type
				DataJson.Fields.Screenshot = geo.Screenshot
				DataJson.Fields.Description = geo.Description
				DataJson.Fields.Points = geo.Points
				DataJson.Fields.Center = geo.Center
				DataJson.Fields.Radius = geo.Radius
				
				data, err := json.Marshal(DataJson)
				//fmt.Println(string(data))
				//dataRaw := json.RawMessage(data)
				CheckError(err)					
				
				
				if (geo.TypeSubmit == "share") {
					sqlStatement = `INSERT INTO bg_missions (server_name, data)
									VALUES ($1, $2) RETURNING id`
					err = db.QueryRow(sqlStatement, dcsName, string(data)).Scan(&Id)
				} else {
					sqlStatement = `UPDATE bg_missions
									SET time=$1, data=$2
									WHERE id = $3`
					_, err = db.Exec(sqlStatement, geo.TimeStamp, string(data), strconv.Itoa(geo.Id))
					Id = geo.Id
				}
				CheckError(err)
				
				var	DataJsonTask TaskData
				for _, Task := range geo.TaskUpdated {
					//fmt.Println(strconv.Itoa(Task.Id))
					DataJsonTask.Title = Task.Data.Title
					DataJsonTask.Fields.Status = Task.Data.Fields.Status
					DataJsonTask.Fields.Description = Task.Data.Fields.Description
					DataJsonTask.Fields.Max_flight = Task.Data.Fields.Max_flight
					data, err = json.Marshal(DataJsonTask)
					if (Task.Data.Fields.Status == "Deleted") {
						if (Task.Id != 0) {
							_, err = db.Exec(`DELETE FROM bg_task where id=$1`, strconv.Itoa(Task.Id))
							CheckError(err)
						}
					} else if (Task.Id == 0) {
						sqlStatement = `INSERT INTO bg_task (id_mission, server_name, data)
										VALUES ($1, $2, $3)`
						_, err = db.Exec(sqlStatement, Id, dcsName, string(data))
						CheckError(err)
					} else {
						sqlStatement = `UPDATE bg_task
										SET time=$1, data=$2
										WHERE id = $3`
						_, err = db.Exec(sqlStatement, geo.TimeStamp, string(data), strconv.Itoa(Task.Id))
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
				var	DataJson DataJson
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
				DataJson.Fields.Type = geo.Type
				DataJson.Fields.Screenshot = geo.Screenshot
				DataJson.Fields.Description = geo.Description
				DataJson.Fields.Points = geo.Points
				DataJson.Fields.Center = geo.Center
				DataJson.Fields.Radius = geo.Radius
				
				data, err := json.Marshal(DataJson)
				//fmt.Println(string(data))
				//dataRaw := json.RawMessage(data)
				CheckError(err)					

				if (geo.TypeSubmit == "share") {
					sqlStatement = `INSERT INTO bg_geometry2 (server_name, data)
									VALUES ($1, $2) RETURNING id`
					err = db.QueryRow(sqlStatement, dcsName, string(data)).Scan(&Id)
				} else {
					sqlStatement = `UPDATE bg_geometry2
									SET time=$1, data=$2
									WHERE id = $3`
					_, err = db.Exec(sqlStatement, geo.TimeStamp, string(data), strconv.Itoa(geo.Id))
					Id = geo.Id
				}
				
				fmt.Println(strconv.Itoa(Id))
				CheckError(err)
			}
		}
		if (geo.TypeSubmit == "delete" && geo.Id > 10000) {
			geoListDel = append(geoListDel, geo.Id)
			for i, v := range geoListGlob {
				if v.Id == geo.Id {
					geoListGlob = append(geoListGlob[:i], geoListGlob[i+1:]...)
					break
				}
			}
			_, e := db.Exec(`DELETE FROM bg_geometry2 where id=$1`, strconv.Itoa(geo.Id))
			CheckError(e)
			_, e2 := db.Exec(`DELETE FROM bg_missions where id=$1`, strconv.Itoa(geo.Id))
			CheckError(e2)
			_, e3 := db.Exec(`DELETE FROM bg_task where id_mission=$1`, strconv.Itoa(geo.Id))
			CheckError(e3)
		}
	} else {
		if (geo.TypeSubmit == "share") {
			counter = counter + 1
			geo.Id = counter
			geo.Side = coalition
			geo.Server = dcsName
			geoListGlob = append(geoListGlob, geo)
			Id = geo.Id
		}
		if (geo.TypeSubmit == "delete" && geo.Id > 10000) {
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
	gores.JSON(w, 200, SqlResponse{Id:Id})
}

type TaskEnrolment struct {
	TaskId		int		`json:"taskId"`
}

func (h *httpServer) taskenrolment(w http.ResponseWriter, r *http.Request) {
   	cookie, err := r.Cookie("session_token")
	CheckError(err)
	session_token := cookie.Value
	DiscordId := SessionsDiscord[session_token].id
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
			rows, err2 := db.Query(`SELECT id_task FROM bg_task_user_rltn WHERE id_task = $1 AND discord_id = $2`, strconv.Itoa(taskEnrolment.TaskId), DiscordId)
			CheckError(err2)
			defer rows.Close()
			for rows.Next() {
				err = rows.Scan(&TaskId)
				CheckError(err)
			}
			
			sqlStatement := `DELETE FROM bg_task_user_rltn WHERE discord_id = $1`
			_, err = db.Exec(sqlStatement, DiscordId)
			CheckError(err)
			
			
			if (TaskId != taskEnrolment.TaskId) {
				sqlStatement = `INSERT INTO bg_task_user_rltn (id_task, discord_id)
								VALUES ($1, $2)`
				_, err = db.Exec(sqlStatement, strconv.Itoa(taskEnrolment.TaskId), DiscordId)
	
				CheckError(err)
			}
		}
	}
	gores.JSON(w, 200, taskEnrolment)
}

type User struct {
	Name  string
	Email string
	Age   int
}

type UploadResponse struct {
	Files		[]string
}


func (h *httpServer) uploadHandler(w http.ResponseWriter, r *http.Request) {
    switch r.Method {
    case "POST":
        r.ParseMultipartForm(32 << 20) //10 MB
		filesnames := []string{}


		for _, headers := range r.MultipartForm.File["attachments"] {
			log.Println("test")
			file, err := headers.Open()
			defer file.Close()
			
			filename := uuid.NewString() + filepath.Ext(headers.Filename)
			dst, err := os.Create(*h.config.AssetsPathExternal + filename)
			if err != nil {
				log.Println("error creating file", err)
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer dst.Close()
			if _, err := io.Copy(dst, file); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			
			filesnames = append(filesnames, filename)
		}
		resp := UploadResponse{Files:filesnames}
		gores.JSON(w, 200, resp) 
    }
}


func CheckError(err error) {
    if err != nil {
        panic(err)
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
			rows, err := db.Query(`SELECT id, data
									FROM bg_geometry2 
									WHERE data->'fields'->>'screenshot' like '%"%ephemeral-attachments%"%'`)
			CheckError(err)
			defer rows.Close()
			for rows.Next() {
				err = rows.Scan(&Id, &Data)			
				CheckError(err)
					
				var	DataJson DataJson
				err = json.Unmarshal(Data, &DataJson)
				//fmt.Println(DataJson.Fields.Screenshot)	
				
				for i, screen := range DataJson.Fields.Screenshot {
					if strings.Contains(screen, "ephemeral-attachments") {
						//fmt.Println(screen)	
						file, err1 := http.Get(screen)
						if err1 != nil {
							log.Println("error creating file1", err1 )
						}
						//filename := uuid.NewString() + filepath.Ext(path.Base(resp.Request.URL.String()))
						filename := uuid.NewString() + strings.Split(filepath.Ext(screen), "?")[0]
						
						dst, err2 := os.Create(*h.config.AssetsPathExternal + filename)
						if err2 != nil {
							log.Println("error creating file2", err2)
						}
						defer dst.Close()
						defer file.Body.Close()
						_, err3 := io.Copy(dst, file.Body)
						if  err3 != nil {
							log.Println("error creating file3", err3)
						}
						
						DataJson.Fields.Screenshot[i] = "$CURRENT_SERV/files/" + filename
					}
				}
				//fmt.Println(DataJson.Fields.Screenshot)	
				
				data, err4 := json.Marshal(DataJson)
				CheckError(err4)					
				sqlStatement := `UPDATE bg_geometry2
								SET data='` + string(data) + `'
								WHERE id = ` + strconv.Itoa(Id)
				_, err = db.Exec(sqlStatement)
			}
			
			//fmt.Println("Loop file")	
			items, _ := ioutil.ReadDir(*h.config.AssetsPathExternal)
			for _, item := range items {
				rows2, err4 := db.Query(`SELECT sum(count)
										FROM
											(SELECT count(*)
											FROM bg_geometry2 
											WHERE data->'fields'->>'screenshot' like '%"%` + item.Name() + `%"%'	
											union
											SELECT count(*)
											FROM bg_missions
											WHERE data->'fields'->>'screenshot' like '%"%` + item.Name() + `%"%') t1`)
				CheckError(err4)
				for rows2.Next() {
					err = rows2.Scan(&Nbr)
					CheckError(err)
					//fmt.Println(item.Name())
					//fmt.Println(Nbr)
					if Nbr == 0 {
						//fmt.Println(item.Name())
						e := os.Remove(*h.config.AssetsPathExternal + item.Name()) 
						CheckError(e)
					}
				}
			}
		}
	}
}


func Run(config *Config) error {
	server := newHttpServer(config)
	initDB(config)
	go server.cleanLoop()
	
	r := chi.NewRouter()
	r.Use(middleware.Logger)
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
		dc.RedirectHandler(w, r, "") // w: http.ResponseWriter, r: *http.Request, state: string
	})

	r.Get("/redirect/", func(w http.ResponseWriter, r *http.Request) {
		
		query := r.URL.Query()
		if (query["code"] == nil) {
			fmt.Println("Redirect - Bad query")
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		} 
		
		
		codeFromURLParamaters := query["code"][0]
		fmt.Println("Code : " + codeFromURLParamaters)	

		// Get the access token using the above codeFromURLParamaters
		var accessToken, err1 = dc.GetOnlyAccessToken(codeFromURLParamaters)

		if (err1 != nil) {
			fmt.Println("Redirect - No Token")
			
			http.Redirect(w, r, "/", http.StatusSeeOther)
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
			Name:    "session_token",
			Value:   sessionToken,
			Expires: expiresAt,
			Path: "/",
		})
		//fmt.Fprint(w, userData)
		
		id, err2 :=userData["id"].(string)
		user, err3 :=userData["username"].(string)
		avatar, err4 :=userData["avatar"].(string)
		if (err2 == false || err3 == false) {
			fmt.Println("Redirect - Bad user")
			http.Redirect(w, r, "/", http.StatusSeeOther)
		}
		if (err4 == false) {
			avatar = "nop"
		}
		SessionsDiscord[sessionToken]=sessionDiscord{id:id, username:user, avatar:avatar}
		
		fmt.Println("Redirect - Session created")
		http.Redirect(w, r, "/", http.StatusSeeOther)
		
		// Print the user data map
		//fmt.Fprint(w, userData)
	})
	
	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_token")
		if err != nil {
			fmt.Println("Redirect - No session")
			http.Redirect(w, r, "/discord/", http.StatusSeeOther)
		} else {
			_, exists := SessionsDiscord[cookie.Value]
			if !exists {
				fmt.Println("Redirect - Bad session")
				http.Redirect(w, r, "/discord/", http.StatusSeeOther)
			} else {
				server.serveEmbeddedFile("index.html", w, r)
			}
		}
	})
	r.Get("/static/*", server.serveEmbeddedStaticAssets)
	r.Get("/files/*", server.serveEmbeddedStaticAssetsExternal)
	r.Get("/api/servers", server.getServerList)
	r.Get("/api/servers/{serverName}", server.getServer)
	r.Get("/api/servers/{serverName}/events", server.streamServerEvents)
	r.Post("/servers/{serverName}/share", server.share)
	r.Post("/servers/{serverName}/taskenrolment", server.taskenrolment)
	r.Post("/upload", server.uploadHandler)


	log.Printf("Starting up %v Tacview clients", len(config.Servers))
	for _, serverConfig := range config.Servers {
		server.getOrCreateSession(serverConfig.Name)
	}

	return http.ListenAndServe(config.Bind, r)
}
