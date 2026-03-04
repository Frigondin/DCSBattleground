# DCS Battleground 

Originally created for the french community Liaison-16, DCS Battleground is an open source tool for visualizing the battlefield of DCS servers and sharing scouting elements and flight plans between pilots.
It was designed from [sneaker](https://github.com/Special-K-s-Flightsim-Bots/sneaker) and uses the Tacview protocol to communicate with DCS.
It has Discord's authentication and is interfaced with the [Special K's Server bot](https://github.com/Special-K-s-Flightsim-Bots/DCSServerBot).

A live example of DCS Battlegound can be viewed [here](http://battleground.06mhr.diciess.fr/).



![UI preview](https://image.noelshack.com/fichiers/2025/02/7/1736712915-capture.jpg)

## Installation

1. Download the latest released version [from here](https://github.com/Frigondin/DCSBattleground/releases).
2. **Do not edit the example file directly.** Create your own configuration file (for example `config.prod.json`) based off the [example](/example.config.json), replacing the required information (and optionally adding multiple servers to the array).
3. If you want to modify Battleground, make sure your real configuration file (with passwords, tokens, etc.) is **not committed** into git (keep it outside the repo or add it to your `.gitignore`).
4. Run the executable with the configuration path: `DCSBattleground.exe --config path\to\config.prod.json --bind 0.0.0.0:yourport`
5. (Optional) You can download DCS's maps [here](http://06mhr.diciess.fr/temp/DCSMaps.zip), see the configuration to use it

## Configuration

DCS Battleground features a built-in Discord authentication 

1. Create a new [Discord Application](https://discord.com/developers/applications) 
2. Configure the redirect url (used later) and copy the client id and client secret
![UI preview](https://i.imgur.com/APMF8zE.png)
4. Add the following to your `config.json` (delete comments before saving).  
   **Important:** this JSON is an *example*. You must replace all secrets (database password, Discord client secret, Tacview password, etc.) by your own values and keep this file private (never commit it to a public repository).
```json
{
  "servers": [
    {
	"name": "ServAlias",								//Don't compliant with special characters
	"dcsname": "Name of your server on DCS ",					//To link the DCS Battleground's server with DCS's server
	"hostname": "XXX.XXX.XXX.XXX",							//Hostname or IP address of the Tacview server
	"port": 1234,									//Port of the Tacview server
	"password": "password",								//Password of the Tacview server
	"radar_refresh_rate": 5,							//Ping time of collecting data from tacview
	"serverbot_coalition_system": true,						//Plug and play Special K's coalition system (need the "database" data)
	"default_coalition": "",							//Default coalition if the user have not coalition (can be "blue", "red", "GM" or "")
	"enable_friendly_ground_units": true,						//Show friendly ground units
	"enable_enemy_ground_units": true,						//Show enemy ground units
	"enemy_ground_units_ratio": 40,							//Show a enemy ground unit every 40 units
	"enemy_ground_units_max_quantity": 10,						//Show max 10 enemy units on the map (-1 to deactivate this feature)
	"enable_friendly_flight_units": true,						//Show friendly aircraft
	"enable_enemy_flight_units": true,						//Show enemy aircraft
	"view_aircraft_when_in_flight": true						//Hide enemy aircraft when the user is connected to DCS (need to link the discord account with DCS account with .link command's)
	"zones_size":[["Vehicle",10000], ["Human",3000], ["default", 10000]],		//Zones size of units, the object type is defined in Tacview documentation : https://www.tacview.net/documentation/acmi/en/
	"editor_id":["289817258535157761"],						//Discord user ID, used for advanced feature enabled for the user
    "show_on_shutdown": true
    }
  ],
  "assets_path_external": "D:\\your\\folder\\DCSBattlegroundV2\\files\\",		//Uploaded pictures folder (must be writable, not inside the git repo)
  "dcsmaps_path_external": "D:\\your\\folder\\DCSBattlegroundV2\\DCSMaps\\",    //DCS Map folder, you can download all files here : http://06mhr.diciess.fr/temp/DCSMaps.zip
  "serverbot": true,									//Use Special K's server bot
  "database": "postgres://user:password@hostname:5432/postgres?sslmode=disable",	//Special K's server bot Database (contains credentials, keep it secret)
  "discord_client_id": "1564564564421",							//Client ID of the discord application (public)
  "discord_client_secret": "azrfdsflkdsfokdsklfjdskfj",					//Client secret of the discord application (secret, never share)
  "redirect_url": "http://my-url.kaboom/redirect/"					//The url used to access DCS Battleground (/redirect/ needed)
}
```

## Development, tests and build

### Requirements

- Node.js / Yarn
- Go (version compatible with the `go.mod` in this repository)

### Frontend (React / TypeScript)

Install JavaScript dependencies:

```bash
yarn
```

Run the frontend test suite (Jest + Testing Library):

```bash
yarn test
```

Build the frontend bundle:

```bash
yarn build
```

### Backend (Go)

Run the Go tests for the HTTP/server package:

```bash
go test ./server
```

Build the Windows and Linux binaries using the provided script:

```bash
build.cmd
```

`build.cmd` will:

1. Clean the `dist` directory.
2. Install/update JS dependencies with `yarn`.
3. Run `yarn test` (frontend tests).
4. Build the frontend bundle with `yarn build`.
5. Run `go test ./server`.
6. Build `DCSBattleground.exe` (Windows) and `DCSBattleground` (Linux).

## Web UI

DCS Battleground UI presents an emulated radar scope over top a [Open Street Map](https://openstreetmap.org) rendered via [maptalks](https://maptalks.org). The web UI is updated at a configurable simulated refresh rate (by default 5 seconds).
It use Flappie's work to display the Caucasus Layer ! (thanks for is work)

