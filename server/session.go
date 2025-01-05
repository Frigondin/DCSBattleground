package server

import (
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"
	//"fmt"
	//"github.com/lib/pq"
	"bytes"
	//"strconv"
)

type sessionRadarSnapshotData struct {
	Offset  int64          `json:"offset"`
	Created []*StateObject `json:"created"`
	Updated []*StateObject `json:"updated"`
	Deleted []uint64       `json:"deleted"`
}

type sessionStateData struct {
	SessionId string         `json:"session_id"`
	Offset    int64          `json:"offset"`
	Objects   []*StateObject `json:"objects"`
}

type serverSession struct {
	sync.Mutex

	server *TacViewServerConfig
	

	subscriberIdx int
	subscribers   map[int]chan<- []byte
	state         sessionState
}

type sharedGeometry struct {
	Add		[]geometry
	Delete	[]int
	Recon	[]geometry
	Quest	[]geometry
}

type player struct {
	DiscordId string
	PlayerName string
}

type players struct {
	Inflight []player
}

func newServerSession(server *TacViewServerConfig) (*serverSession, error) {
	return &serverSession{server: server, subscribers: make(map[int]chan<- []byte)}, nil
}

type PlayerMetadata struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type DataJson struct {
	Command		string		`json:"command"`
	Color		float32		`json:"color"`
	Title		string		`json:"title"`
	Author		Author		`json:"author"`
	Fields		Fields		`json:"fields"`
}

type Author struct {
	Name		string		`json:"name"`
	Icon_url	string		`json:"icon_url"`
}

type Fields struct {
	//Position	string		`json:"position"`
	PosMGRS		string		`json:"posMGRS"`
	PosPoint	[]float32	`json:"posPoint"`
	PosType		string		`json:"position_type"`
	Screenshot	[]string	`json:"screenshot"`
	Description	[]string	`json:"description"`
	Side		string		`json:"side"`
	Status		string		`json:"status"`
	Clickable	bool		`json:"clickable"`
	Color		string		`json:"color"`
	SubType		string		`json:"subType"`
	Type		string		`json:"type"`
	Points		[][]float32	`json:"points"`
	Center		[]float32	`json:"center"`
	Radius		float32		`json:"radius"`
	Marker		string		`json:"marker"`
}


func (s *serverSession) GetPlayerList() []PlayerMetadata {
	players := []PlayerMetadata{}
	s.state.RLock()
	for _, object := range s.state.objects {
		isPlayer := false

		for _, typeName := range object.Types {
			if typeName == "Air" {
				isPlayer = true
				continue
			}
		}
		if !isPlayer {
			continue
		}

		pilotName, ok := object.Properties["Pilot"]
		if !ok {
			continue
		}

		if strings.HasPrefix(pilotName, object.Properties["Group"]) {
			continue
		}

		players = append(players, PlayerMetadata{
			Name: pilotName,
			Type: object.Properties["Name"],
		})
	}
	s.state.RUnlock()
	return players
}

func (s *serverSession) updateLoop() {
	refreshRate := time.Duration(5)
	if s.server.RadarRefreshRate != 0 {
		refreshRate = time.Duration(s.server.RadarRefreshRate)
	}
	ticker := time.NewTicker(time.Second * refreshRate)

	var currentOffset int64
	for {
		<-ticker.C

		if !s.state.active {
			continue
		}

		s.state.Lock()
		data := &sessionRadarSnapshotData{
			Offset:  s.state.offset,
			Created: make([]*StateObject, 0),
			Updated: make([]*StateObject, 0),
			Deleted: make([]uint64, 0),
		}

		for _, object := range s.state.objects {
			if object.Deleted {
				data.Deleted = append(data.Deleted, object.Id)
			} else if object.CreatedAt > currentOffset {
				data.Created = append(data.Created, object)
			} else if object.UpdatedAt > currentOffset {
				data.Updated = append(data.Updated, object)
			}
		}

		// We can now delete these objects from the state
		for _, objectId := range data.Deleted {
			delete(s.state.objects, objectId)
		}

		currentOffset = s.state.offset
		s.state.Unlock()

		s.publish("SESSION_RADAR_SNAPSHOT", data)

		if db != nil {		
			s.runSharedGeometry()
		}
		s.runConnectedPlayer()
	}
}

func (s *serverSession) getInitialState() (*sessionStateData, []*StateObject) {
	s.state.RLock()
	defer s.state.RUnlock()

	if !s.state.active {
		return nil, nil
	}

	objects := make([]*StateObject, len(s.state.objects))

	idx := 0
	for _, object := range s.state.objects {
		objects[idx] = object
		idx += 1
	}

	return &sessionStateData{
		SessionId: s.state.sessionId,
		Offset:    s.state.offset,
	}, objects
}

func (s *serverSession) publish(event string, data interface{}) error {
	encoded, err := json.Marshal(map[string]interface{}{
		"e": event,
		"d": data,
	})
	if err != nil {
		return err
	}

	s.Lock()
	for id, sub := range s.subscribers {
		select {
		case sub <- encoded:
			continue
		default:
			log.Printf("[session:%v] subscriber %v non-responsive, closing", s.server.Name, id)
			delete(s.subscribers, id)
			close(sub)
		}
	}
	s.Unlock()
	return nil

}

func (s *serverSession) run() {
	go s.updateLoop()

	for {
		s.runTacViewClient()
		//s.runSharedGeometry()
		time.Sleep(time.Second * 5)
	}
}

func (s *serverSession) runConnectedPlayer() error {
	var DcsName = s.server.DcsName
	//var ViewAircraftWhenInFlight = s.server.ViewAircraftWhenInFlight
	
	Player := player{}
	Player.DiscordId="NADA"
	Player.PlayerName="NADA"
	Players := []player{}
	Players = append(Players, Player)
	
	err := db.Ping()
	if err == nil {
		rows, err2 := db.Query(`SELECT discord_id, players.name FROM statistics, players, missions WHERE players.ucid = statistics.player_ucid AND statistics.mission_id = missions.id AND hop_off is null AND server_name = '` + DcsName + `'`)
		CheckError(err2)
		defer rows.Close()
		for rows.Next() {
			var discordId string
			var playerName string
			
			err = rows.Scan(&discordId, &playerName)
			CheckError(err)

			Player.DiscordId = discordId
			Player.PlayerName = playerName
			Players = append(Players, Player)
		}
	}
	PlayersF := players{Inflight: Players}
	s.publish("SESSION_PLAYERS_IN_SLOT", PlayersF)
	return nil
}

func (s *serverSession) runSharedGeometry() error {
	var DcsName = s.server.DcsName
	var reconGeometry = []geometry{}
	var questList = []geometry{}
	var geoList = []geometry{}
	
	err := db.Ping()
	if err == nil {
		var Id int

		var Data []byte
		var Task []byte
		var Time string
		
		rows, err := db.Query(`SELECT id, data, time 
								FROM bg_geometry2 
								WHERE node='` + DcsName + `' AND data->'fields'->>'type' = 'recon' ORDER BY id`)
		CheckError(err)
		defer rows.Close()
		for rows.Next() {
			err = rows.Scan(&Id, &Data, &Time)
			CheckError(err)
				
			var	DataJson DataJson
			err = json.Unmarshal(Data, &DataJson)
			CheckError(err)			
			
			var geo geometry
			geo.Id = Id
			geo.TimeStamp = Time
			geo.Type = DataJson.Fields.Type
			geo.Name = DataJson.Title
			geo.DiscordName = DataJson.Author.Name
			geo.Avatar = DataJson.Author.Icon_url
			geo.PosMGRS = DataJson.Fields.PosMGRS
			geo.PosPoint = DataJson.Fields.PosPoint
			geo.Screenshot = DataJson.Fields.Screenshot
			geo.Description = DataJson.Fields.Description
			geo.Side = DataJson.Fields.Side
			geo.Server = DcsName
			geo.Status = DataJson.Fields.Status
			geo.Clickable = DataJson.Fields.Clickable
			geo.Color = DataJson.Fields.Color
			geo.Points = DataJson.Fields.Points
			geo.Center = DataJson.Fields.Center
			geo.Radius = DataJson.Fields.Radius
			reconGeometry = append(reconGeometry, geo)
		}


		rows, err = db.Query(`SELECT id, data, time, 
									COALESCE((
									   SELECT json_agg(json_build_object('id', id, 'data', data, 'players',
											COALESCE((
											   SELECT json_agg(json_build_object('id', rltn.discord_id, 'name', players.name))
											   FROM bg_task_user_rltn rltn, players where rltn.id_task=bg_task.id and rltn.discord_id = players.discord_id
											), '[]'::json))) 
									   FROM bg_task where bg_task.id_mission=bg_missions.id and bg_task.data->'fields'->>'status' != 'Closed'
									), '[]'::json) task  
								FROM bg_missions 
								WHERE node='` + DcsName + `' 
								  AND data->'fields'->>'status' != 'Closed'
								ORDER BY id`) // and data->'fields'->>'status' != 'Closed'
		CheckError(err)
		defer rows.Close()
		for rows.Next() {
			err = rows.Scan(&Id, &Data, &Time, &Task)
			CheckError(err)
			
			var	DataJson DataJson
			err = json.Unmarshal(Data, &DataJson)
			CheckError(err)
			
			var TaskJson interface{}
		    d := json.NewDecoder(bytes.NewReader(Task))
			d.UseNumber()
			err := d.Decode(&TaskJson)
			CheckError(err)
			
			var geo geometry
			geo.Id = Id
			geo.TimeStamp = Time
			geo.Type = "quest"
			geo.Name = DataJson.Title
			geo.DiscordName = DataJson.Author.Name
			geo.Avatar = DataJson.Author.Icon_url
			geo.PosMGRS = DataJson.Fields.PosMGRS
			geo.PosPoint = DataJson.Fields.PosPoint
			geo.Screenshot = DataJson.Fields.Screenshot
			geo.Description = DataJson.Fields.Description
			geo.Side = DataJson.Fields.Side
			geo.Status = DataJson.Fields.Status
			geo.Clickable = DataJson.Fields.Clickable
			geo.Color = DataJson.Fields.Color
			geo.SubType = DataJson.Fields.SubType
			geo.Server = DcsName
			geo.Task = TaskJson
			geo.Marker = DataJson.Fields.Marker
			//fmt.Println(TaskJson)
			questList = append(questList, geo)
		}
		
		
		
		geoListGlob = []geometry{}
		rows, err = db.Query(`SELECT id, data, time 
								FROM bg_geometry2 
								WHERE node='` + DcsName + `' AND data->'fields'->>'type' != 'recon' ORDER BY id`)
		CheckError(err)
		defer rows.Close()
		for rows.Next() {
			err = rows.Scan(&Id, &Data, &Time)
			CheckError(err)
				
			var	DataJson DataJson
			err = json.Unmarshal(Data, &DataJson)
			CheckError(err)			
			
			var geo geometry
			geo.Id = Id
			geo.TimeStamp = Time
			geo.Type = DataJson.Fields.Type
			geo.Name = DataJson.Title
			geo.DiscordName = DataJson.Author.Name
			geo.Avatar = DataJson.Author.Icon_url
			geo.PosMGRS = DataJson.Fields.PosMGRS
			geo.PosPoint = DataJson.Fields.PosPoint
			geo.Screenshot = DataJson.Fields.Screenshot
			geo.Description = DataJson.Fields.Description
			geo.Side = DataJson.Fields.Side
			geo.Server = DcsName
			geo.Status = DataJson.Fields.Status
			geo.Clickable = DataJson.Fields.Clickable
			geo.Color = DataJson.Fields.Color
			geo.Points = DataJson.Fields.Points
			geo.Center = DataJson.Fields.Center
			geo.Radius = DataJson.Fields.Radius
			geoList = append(geoList, geo)
		}
	} else {
		for i, v := range geoListGlob {
			if v.Server == DcsName {
				geoList = append(geoList, geoListGlob[i])
			}
		}
	}


	sharedGeometry := sharedGeometry{Add:geoList, Delete:geoListDel, Recon:reconGeometry, Quest:questList}
	s.publish("SESSION_SHARED_GEOMETRY", sharedGeometry)
	return nil
}



func (s *serverSession) runTacViewClient() error {
	client := NewTacViewClient(s.server.Hostname, s.server.Port, s.server.Password)
	header, timeFrameStream, err := client.Start()
	if err != nil {
		s.server.Enabled = false
		return err
	}

	err = s.state.initialize(header, s.server)
	if err != nil {
		s.server.Enabled = false
		return err
	}

	s.server.Enabled = true

	s.state.Lock()
	objects := make([]*StateObject, len(s.state.objects))
	var idx = 0
	for _, object := range s.state.objects {
		objects[idx] = object
		idx += 1
	}
	s.state.Unlock()

	log.Printf("[session:%v] tacview client session initialized", s.server.Name)
	s.publish("SESSION_STATE", &sessionStateData{
		SessionId: s.state.sessionId,
		Objects:   objects,
	})

	for {
		timeFrame, ok := <-timeFrameStream
		if !ok {
			return nil
		}

		s.state.Lock()
		s.state.update(timeFrame)
		s.state.Unlock()
	}
}

func (s *serverSession) removeSub(id int) {
	s.Lock()
	defer s.Unlock()
	delete(s.subscribers, id)
}

func (s *serverSession) addSub() (<-chan []byte, func()) {
	sub := make(chan []byte, 16)
	s.Lock()
	id := s.subscriberIdx
	s.subscribers[id] = sub
	s.subscriberIdx += 1
	s.Unlock()
	return sub, func() {
		s.removeSub(id)
	}
}
