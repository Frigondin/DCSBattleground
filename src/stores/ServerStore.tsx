import Immutable from "immutable";
import create from "zustand";
import { DCSBattlegroundClient } from "../DCSBattlegroundClient";
import { Entity } from "../types/entity";
import { route } from "../util";
import { GroundUnitMode, FlightUnitMode } from "./SettingsStore";
import { createTracks, updateTracks } from "./TrackStore";
import {addGlobalGeometry, deleteGlobalGeometry} from "./GeometryStore";

export type Player = {
    DiscordId: string;
    PlayerName: string;
}

export type Server = {
  name: string;
  ground_unit_modes: Array<GroundUnitMode>;
  ground_unit_ratio: number;
  ground_unit_max_qty: number;
  flight_unit_modes: Array<FlightUnitMode>;
  coalition: string;
  map: string;
  discord_name: string;
  avatar: string;
  discord_id: string;
  is_editor: string[];
  editor_mode_on: boolean;
  view_aircraft_when_in_flight: string;
  player_is_connected: boolean;
  player_name: string;
  toggle_connection: boolean;
  zones_size: any[][];
  dcs_map: boolean;
};

export type ServerStoreData = {
  editor_mode_on: boolean;
  server: Server | null;
  entities: Immutable.Map<number, Entity>;
  offset: number;
  sessionId: string | null;
  selectedEntityId: number | null;
};

export const serverStore = create<ServerStoreData>(() => {
  return {
	editor_mode_on: false,
    server: null,
    entities: Immutable.Map<number, Entity>(),
    offset: 0,
    sessionId: null,
    selectedEntityId: null
  };
});

(window as any).serverStore = serverStore;

let dcsBattlegroundClient: DCSBattlegroundClient | null = null;

export function setSelectedEntityId(selectedEntityId: number | null) {
  serverStore.setState({ selectedEntityId });
}

export function updateServerStore(value: Partial<ServerStoreData>) {
  serverStore.setState((state) => {
    return {
      ...state,
	  ...value
    };
  });
}

async function initGeometry(server: Server) {
	const response  = await fetch(route(`/servers/${server.name}/init`), {
		headers: {
		  'Accept': 'application/json',
		  'Content-Type': 'application/json'
		},
		method: "GET"
	})
	const sharedGeometry = await response.json();
	if (sharedGeometry) {
		addGlobalGeometry(sharedGeometry.Add, server.coalition);
		addGlobalGeometry(sharedGeometry.Recon, server.coalition);
		addGlobalGeometry(sharedGeometry.Quest, server.coalition);
		deleteGlobalGeometry(sharedGeometry.Delete, server.coalition);
	}
}

function runDCSBattlegroundClient(server: Server | null) {
  dcsBattlegroundClient?.close();

  if (server !== null) {
	 initGeometry(server);
     setTimeout(() => {
      dcsBattlegroundClient = new DCSBattlegroundClient(
        route(`/servers/${server.name}/events`)
      );
      dcsBattlegroundClient?.run((event) => {
        if (event.e === "SESSION_STATE") {
          serverStore.setState((state) => {
            return {
              ...state,
              sessionId: event.d.session_id,
              entities: Immutable.Map<number, Entity>(
                event.d.objects?.map((obj) => [obj.id, new Entity(obj)]) || []
              ),
            };
          });
          createTracks(event);
        } else if (event.e === "SESSION_RADAR_SNAPSHOT") {
          serverStore.setState((state) => {
            return {
              ...state,
              offset: event.d.offset,
              entities: state.entities.withMutations((obj) => {
                for (const object of event.d.created) {
                  obj = obj.set(object.id, new Entity(object));
                }
                for (const object of event.d.updated) {
                  obj = obj.set(object.id, new Entity(object));
                }
                for (const objectId of event.d.deleted) {
                  obj = obj.remove(objectId);
                }
              }),
            };
          });
          updateTracks(event);
        } else if (event.e === "SESSION_SHARED_GEOMETRY") {
			var data = event.d as any
			addGlobalGeometry(data.Add, server.coalition);
			addGlobalGeometry(data.Recon, server.coalition);
			addGlobalGeometry(data.Quest, server.coalition);
			deleteGlobalGeometry(data.Delete, server.coalition);
		} else if (event.e === "SESSION_PLAYERS_IN_SLOT") {
			var player_is_connected = false
			for (const player of event.d.Inflight) {
				if (player.DiscordId === server.discord_id) {
					player_is_connected = true
					server.player_name = player.PlayerName
				}
            }
			if (server.player_is_connected !== player_is_connected) {
				server.player_is_connected = player_is_connected
				server.toggle_connection = true	
			}
		}
      });
    });
  } else {
    serverStore.setState({
      entities: Immutable.Map<number, Entity>(),
      offset: 0,
    });
  }
}

serverStore.subscribe(runDCSBattlegroundClient, (state) => state.server);
