package server

import (
	"errors"
	"log"
	"strconv"
	"strings"
	"sync"
	"math/rand"

	"github.com/b1naryth1ef/jambon/tacview"
)

type StateObject struct {
	Id         uint64            `json:"id"`
	Types      []string          `json:"types"`
	Properties map[string]string `json:"properties"`
	Latitude   float64           `json:"latitude"`
	Longitude  float64           `json:"longitude"`
	Altitude   float64           `json:"altitude"`
	Heading    float64           `json:"heading"`
	UpdatedAt  int64             `json:"updated_at"`
	CreatedAt  int64             `json:"created_at"`

	Deleted bool `json:"-"`
	
	Visible		bool			`json:"visible"`
	RatioLong	float64			`json:"ratio_long"`
	RatioLat	float64			`json:"ratio_lat"`
}

func NewStateObject(ts int64, sourceObj *tacview.Object, coordBase [2]float64, visible bool) (*StateObject, error) {
	obj := &StateObject{
		Id:         sourceObj.Id,
		Types:      []string{},
		Properties: make(map[string]string),
		Deleted:    false,
		CreatedAt:  ts,
		Visible:	visible,
		RatioLong: rand.Float64(),
		RatioLat: rand.Float64(),
	}
	//obj.RatioLong = rand.Float64()
	//obj.RatioLat = rand.Float64()
		
	err := obj.update(ts, sourceObj, coordBase, visible)
	if err != nil {
		return nil, err
	}

	return obj, nil
}

func (obj *StateObject) updateLocation(data string, coordBase [2]float64) error {
	parts := strings.Split(data, "|")

	if len(parts) >= 3 {
		if parts[0] != "" {
			lng, err := strconv.ParseFloat(parts[0], 64)
			if err != nil {
				return err
			}
			obj.Longitude = lng + coordBase[1]
		}

		if parts[1] != "" {
			lat, err := strconv.ParseFloat(parts[1], 64)
			if err != nil {
				return err
			}
			obj.Latitude = lat + coordBase[0]
		}

		if parts[2] != "" {
			alt, err := strconv.ParseFloat(parts[2], 64)
			if err != nil {
				return err
			}
			obj.Altitude = alt
		}

		if len(parts) == 9 && parts[8] != "" {
			heading, err := strconv.ParseFloat(parts[8], 64)
			if err != nil {
				return err
			}
			obj.Heading = heading
		}
	}
	return nil
}

func (obj *StateObject) update(ts int64, sourceObj *tacview.Object, coordBase [2]float64, visible bool) error {
	if sourceObj.Deleted {
		obj.Deleted = true
	} else {
		for _, prop := range sourceObj.Properties {
			if prop.Key == "T" {
				err := obj.updateLocation(prop.Value, coordBase)
				if err != nil {
					return err
				}
			} else if prop.Key == "Type" {
				obj.Types = strings.Split(prop.Value, "+")
			} else {
				obj.Properties[prop.Key] = prop.Value
			}
		}
	}
	obj.Visible = visible
	obj.UpdatedAt = ts
	return nil
}

type sessionState struct {
	sync.RWMutex

	// Session ID (the tacview recording time)
	sessionId string

	// Base to use for all incoming coordinates
	coordBase [2]float64

	// Tracked objects
	objects map[uint64]*StateObject

	serverConfig *TacViewServerConfig
	idVisibleBlueList map[uint64]bool
	idVisibleRedList map[uint64]bool

	offset int64
	active bool
}

// Called when our connection is interrupted
func (s *sessionState) reset() {
	s.Lock()
	defer s.Unlock()
	s.objects = make(map[uint64]*StateObject)
	s.active = false
}

// Called when the tacview stream starts
func (s *sessionState) initialize(header *tacview.Header, serverConfig *TacViewServerConfig) error {
	s.reset()

	s.Lock()
	defer s.Unlock()
	globalObj := header.InitialTimeFrame.Get(0)
	if globalObj == nil {
		return errors.New("TacView initial time frame is missing global object")
	}

	sessionId := globalObj.Get("RecordingTime")
	if sessionId != nil {
		s.sessionId = sessionId.Value
	}

	refLat := globalObj.Get("ReferenceLatitude")
	refLng := globalObj.Get("ReferenceLongitude")

	if refLat != nil && refLng != nil {
		refLatF, err := strconv.ParseFloat(refLat.Value, 64)
		if err != nil {
			return err
		}
		refLngF, err := strconv.ParseFloat(refLng.Value, 64)
		if err != nil {
			return err
		}

		s.coordBase = [2]float64{refLatF, refLngF}
	} else {
		s.coordBase = [2]float64{0.0, 0.0}
	}

	s.active = true
	s.serverConfig = serverConfig
	s.idVisibleBlueList = make(map[uint64]bool)
	s.idVisibleRedList = make(map[uint64]bool)
	
	s.update(&header.InitialTimeFrame)
	return nil
}

func (s *sessionState) update(tf *tacview.TimeFrame) {
	s.offset = int64(tf.Offset)
	EnableEnemyGroundUnits := s.serverConfig.EnableEnemyGroundUnits
	EnemyGroundUnitsRatio := s.serverConfig.EnemyGroundUnitsRatio
	EnemyGroundUnitsMaxQuantity := s.serverConfig.EnemyGroundUnitsMaxQuantity
	
	for i, object := range tf.Objects {
		Coalition := ""
		for _, prop := range object.Properties {
			if prop.Key == "Coalition" {
				Coalition = prop.Value
			}
		}
		
		Visible := false
		if !EnableEnemyGroundUnits {
			Visible = false
		} else if EnemyGroundUnitsMaxQuantity == -1 {
			Visible = true
		} else if object.Deleted {
			Visible = false
			delete(s.idVisibleRedList,object.Id)
			delete(s.idVisibleBlueList,object.Id)
		} else if s.idVisibleRedList[object.Id] || s.idVisibleBlueList[object.Id] {
			Visible = true
		} else if i%EnemyGroundUnitsRatio != 0 {
			Visible = false
		} else if (Coalition == "Allies" && len(s.idVisibleRedList) < EnemyGroundUnitsMaxQuantity) {
			Visible = true
			s.idVisibleRedList[object.Id] = true
		} else if (Coalition == "Enemies" && len(s.idVisibleBlueList) < EnemyGroundUnitsMaxQuantity) {
			Visible = true
			s.idVisibleBlueList[object.Id] = true
		} else {
			Visible = false
		}

		if _, exists := s.objects[object.Id]; exists {
			s.objects[object.Id].update(int64(tf.Offset), object, s.coordBase, Visible)
		} else {
			stateObj, err := NewStateObject(int64(tf.Offset), object, s.coordBase, Visible)
			if err != nil {
				log.Printf("Error processing object: %v", err)
				continue
			}

			s.objects[object.Id] = stateObj
		}
	}
}
