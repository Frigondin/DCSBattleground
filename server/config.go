package server

type Config struct {
	Bind       string                    `json:"bind"`
	Servers    []TacViewServerConfig     `json:"servers"`
	AssetsPath *string                   `json:"assets_path"`
	Serverbot	bool					 `json:"serverbot"`
	Database   string					 `json:"database"`
	ClientID   string					 `json:"discord_client_id"`
	ClientSecret   string				 `json:"discord_client_secret"`
	RedirectURI   string				 `json:"redirect_url"`
}

type TacViewServerConfig struct {
	Name     string `json:"name"`
	DcsName  string `json:"dcsname"`
	Hostname string `json:"hostname"`

	RadarRefreshRate int64  `json:"radar_refresh_rate"`
	Port             int    `json:"port"`
	Password         string `json:"password"`

	EnableFriendlyGroundUnits	bool 			`json:"enable_friendly_ground_units"`
	EnableEnemyGroundUnits		bool 			`json:"enable_enemy_ground_units"`
	EnemyGroundUnitsRatio		int				`json:"enemy_ground_units_ratio"`
	EnemyGroundUnitsMaxQuantity	int				`json:"enemy_ground_units_max_quantity"`
	EnableFriendlyFlightUnits	bool			`json:"enable_friendly_flight_units"`
	EnableEnemyFlightUnits		bool			`json:"enable_enemy_flight_units"`
	ViewAircraftWhenInFlight	bool			`json:"view_aircraft_when_in_flight"`
	DefaultCoalition		  	string 			`json:"default_coalition"`
	ZonesSize					[][]interface{}	`json:"zones_size"`
	
	Enabled						bool	`json:"enabled"`
}
