import Immutable from "immutable";
import create from "zustand";
import { RawEntityData, Entity } from "../types/entity";
import * as mgrs from "mgrs";
import {
  serverStore
} from "../stores/ServerStore";


export type GeometryBase = {
  id: number;
  name?: string;
  timeStamp: string;
  coalition: string;
  discordName: string;
  avatar: string;
  status: string;
  clickable: boolean;
  screenshot: Array<string>;
  description: Array<string>;
  store: string;
  color: string;
};

export type MarkPoint = {
  type: "markpoint";
  position: [number, number];
} & GeometryBase;

export type Zone = {
  type: "zone";
  points: Array<[number, number]>;
} & GeometryBase;

export type Waypoints = {
  type: "waypoints";
  points: Array<[number, number]>;
} & GeometryBase;

export type Circle = {
  type: "circle";
  center: [number, number];
  radius: number;
} & GeometryBase;

export type Line = {
  type: "line";
  points: Array<[number, number]>;
} & GeometryBase;

export type Border = {
  type: "border";
  points: Array<[number, number]>;
} & GeometryBase;

export type Recon = {
  type: "recon";
  position: [number, number];
  //screenshot: string;
} & GeometryBase;

export type Quest = {
  type: "quest";
  position: [number, number];
  //screenshot: Array<string>;
  //description: Array<string>;
  task:	Array<JSON>;
  //status: string;
  //color: string;
  subType: string;
} & GeometryBase;

export type Geometry = MarkPoint | Zone | Waypoints | Circle | Line | Border | Recon | Quest;

type GeometryStoreData = {
  geometry: Immutable.Map<number, Geometry>;
  id: number;
  selectedGeometry: number | null;
};

export const geometryStore = create<GeometryStoreData>(() => {
  return {
    geometry: Immutable.Map<number, Geometry>(),
    id: 1,
    selectedGeometry: null,
  };
});

export function deleteGeometry(id: number) {
  geometryStore.setState((state) => {
    return { ...state, geometry: state.geometry.remove(id) };
  });
}

export function updateGeometry(value: Geometry) {
  geometryStore.setState((state) => {
    return { ...state, geometry: state.geometry.set(value.id, {...value, store:"undo", timeStamp: new Date("01 January 2001 00:01 UTC").toISOString()}) };
  });
}

export function updateGeometrySafe(id: number, value: Partial<Geometry>) {
  geometryStore.setState((state) => {
    const existing = state.geometry.get(id);
    if (!existing) return;
	var store = existing.store
	if (existing.store !== "local") store = "updated";
		
	
    return {
      ...state,
      geometry: state.geometry.set(id, { ...existing, timeStamp: new Date().toISOString(), store, ...value} as Geometry),
    };
  });
}

export function getSelectedGeometry() {
	/*return geometryStore((state) =>
		{
			console.log("plop1")
			if (state.selectedGeometry === null) {
				console.log("plop2")
				return undefined
			} else {
				console.log("plop3")
				return state.geometry.get(state.selectedGeometry)
			}
		}
	);*/
	const selectedGeometryId = geometryStore!.getState()!.selectedGeometry
	selectedGeometryId ? (return geometryStore!.getState()!.geometry!.get(geo.id)) : return undefined
}


export function setSelectedGeometry(id: number | null) {
	console.log(id);
  geometryStore.setState({ selectedGeometry: id });
}

export function addZone(points: Array<[number, number]>, color: string) {
	const { entities, offset, server } = serverStore.getState();
	geometryStore.setState((state) => {
	return {
		  ...state,
		  id: state.id + 1,
		  geometry: state.geometry.set(state.id, {
			id: state.id,
			timeStamp: new Date().toISOString(),
			coalition: server?.coalition as string,
			discordName: server?.discord_name as string,
			avatar: server?.avatar as string,
			type: "zone",
			points,
			screenshot: [],
			description: [],
			color: color,
			status: 'Active',
			clickable: true,
			store: "local"
		  }),
		};
	});
}

export function addMarkPoint(position: [number, number], color: string) {
	const { entities, offset, server } = serverStore.getState();
	geometryStore.setState((state) => {
		return {
		  ...state,
		  id: state.id + 1,
		  geometry: state.geometry.set(state.id, {
			id: state.id,
			timeStamp: new Date().toISOString(),
			coalition: server?.coalition as string,
			discordName: server?.discord_name as string,
			avatar: server?.avatar as string,
			type: "markpoint",
			position,
			//color: '#0068FF',
			screenshot: [],
			description: [],
			color: color,
			status: 'Active',
			clickable: true,
			store: "local"
		  }),
		};
	});
}

export function addCircle(center: [number, number], radius: number, color: string) {
	const { entities, offset, server } = serverStore.getState();

	geometryStore.setState((state) => {
		return {
		  ...state,
		  id: state.id + 1,
		  geometry: state.geometry.set(state.id, {
			id: state.id,
			timeStamp: new Date().toISOString(),
			coalition: server?.coalition as string,
			discordName: server?.discord_name as string,
			avatar: server?.avatar as string,
			type: "circle",
			center,
			radius,
			screenshot: [],
			description: [],
			color: color,
			status: 'Active',
			clickable: true,
			store: "local"
		  }),
		};
	});
}

export function addWaypoints(points: Array<[number, number]>, color: string) {
	const { entities, offset, server } = serverStore.getState();
	geometryStore.setState((state) => {
		return {
		  ...state,
		  id: state.id + 1,
		  geometry: state.geometry.set(state.id, {
			id: state.id,
			timeStamp: new Date().toISOString(),
			coalition: server?.coalition as string,
			discordName: server?.discord_name as string,
			avatar: server?.avatar as string,
			type: "waypoints",
			points,
			screenshot: [],
			description: [],
			color: color,
			status: 'Active',
			clickable: true,
			store: "local"
		  }),
		};
	});
}

export function addLine(points: Array<[number, number]>, color: string) {
	const { entities, offset, server } = serverStore.getState();
	geometryStore.setState((state) => {
		return {
		  ...state,
		  id: state.id + 1,
		  geometry: state.geometry.set(state.id, {
			id: state.id,
			timeStamp: new Date().toISOString(),
			coalition: server?.coalition as string,
			discordName: server?.discord_name as string,
			avatar: server?.avatar as string,
			type: "line",
			points,
			screenshot: [],
			description: [],
			color: color,
			status: 'Active',
			clickable: true,
			store: "local"
		  }),
		};
	});
}

export function addQuest(position: [number, number], color: string) {
	const { entities, offset, server } = serverStore.getState();
	geometryStore.setState((state) => {
		return {
		  ...state,
		  id: state.id + 1,
		  geometry: state.geometry.set(state.id, {
			id: state.id,
			timeStamp: new Date().toISOString(),
			coalition: server?.coalition as string,
			discordName: server?.discord_name as string,
			avatar: server?.avatar as string,
			type: "quest",
			position,
			screenshot: [],
			description: [],
			task: [],
			color: color,
			status: 'Active',
			clickable: true,
			subType: "",
			store: "local"
		  }),
		};
	});
}



export function addGlobalGeometry(geoList:any, coalition:string) {
	  //const [geometryTmp, selectedId] = geometryStore((state) => [
	//	state.geometry,
	//	state.selectedGeometry,
	//  ]);

	const {geometry, id, selectedGeometry} = geometryStore.getState();
	const { editor_mode_on } = serverStore.getState();
	//const editor_mode_on = serverStore((state) => state?.editor_mode_on);
	
	geoList.forEach((geo:any) => {
		if (editor_mode_on || coalition == "GM" || coalition == geo.side) {
			var geonew = geometry.get(geo.id);
			if (geonew && geonew.timeStamp > geo.timeStamp) {
				console.log(geonew.timeStamp);
				console.log(geo.timeStamp);
			}
			else {
				if (geo.type === "markpoint") {
					  geometryStore.setState((state) => {
						return {
						  ...state,
						  geometry: state.geometry.set(geo.id, {
							id: geo.id,
							timeStamp: geo.timeStamp,
							name: geo.name,
							coalition: geo.side,
							discordName: geo.discordName,
							avatar: geo.avatar,
							type: "markpoint",
							position: geo.posPoint,
							screenshot: geo.screenshot,
							description: geo.description,
							status: geo.status,
							clickable: geo.clickable,
							color: geo.color,
							store: "server"
						  }),
						};
					  });
				} else if (geo.type === "zone") {
					  geometryStore.setState((state) => {
						return {
						  ...state,
						  geometry: state.geometry.set(geo.id, {
							id: geo.id,
							timeStamp: geo.timeStamp,
							name: geo.name,
							coalition: geo.side,
							discordName: geo.discordName,
							avatar: geo.avatar,
							type: "zone",
							points: geo.points,
							screenshot: geo.screenshot,
							description: geo.description,
							status: geo.status,
							clickable: geo.clickable,
							color: geo.color,
							store: "server"
						  }),
						};
					  });
				} else if (geo.type === "waypoints") {
					  geometryStore.setState((state) => {
						return {
						  ...state,
						  geometry: state.geometry.set(geo.id, {
							id: geo.id,
							timeStamp: geo.timeStamp,
							name: geo.name,
							coalition: geo.side,
							discordName: geo.discordName,
							avatar: geo.avatar,
							type: "waypoints",
							points: geo.points,
							screenshot: geo.screenshot,
							description: geo.description,
							status: geo.status,
							clickable: geo.clickable,
							color: geo.color,
							store: "server"
						  }),
						};
					  });
				} else if (geo.type === "circle") {
					  geometryStore.setState((state) => {
						return {
						  ...state,
						  geometry: state.geometry.set(geo.id, {
							id: geo.id,
							timeStamp: geo.timeStamp,
							name: geo.name,
							coalition: geo.side,
							discordName: geo.discordName,
							avatar: geo.avatar,
							type: "circle",
							center: geo.center,
							radius: geo.radius,
							screenshot: geo.screenshot,
							description: geo.description,
							status: geo.status,
							clickable: geo.clickable,
							color: geo.color,
							store: "server"
						  }),
						};
					  });
				} else if (geo.type === "line") {
					  geometryStore.setState((state) => {
						return {
						  ...state,
						  geometry: state.geometry.set(geo.id, {
							id: geo.id,
							timeStamp: geo.timeStamp,
							name: geo.name,
							coalition: geo.side,
							discordName: geo.discordName,
							avatar: geo.avatar,
							type: "line",
							points: geo.points,
							screenshot: geo.screenshot,
							description: geo.description,
							status: geo.status,
							clickable: geo.clickable,
							color: geo.color,
							store: "server"
						  }),
						};
					  });
				} else if (geo.type === "border") {
					  geometryStore.setState((state) => {
						return {
						  ...state,
						  geometry: state.geometry.set(geo.id, {
							id: geo.id,
							timeStamp: geo.timeStamp,
							name: geo.name,
							coalition: geo.side,
							discordName: geo.discordName,
							avatar: geo.avatar,
							type: "border",
							points: geo.points,
							screenshot: geo.screenshot,
							description: geo.description,
							status: geo.status,
							clickable: geo.clickable,
							color: geo.color,
							store: "server"
						  }),
						};
					  });
				} else if (geo.type === "recon") {
					const coord = mgrs.toPoint(geo.posMGRS.replace(" ", ""));
					  geometryStore.setState((state) => {
						return {
						  ...state,
						  geometry: state.geometry.set(geo.id, {
							id: geo.id,
							timeStamp: geo.timeStamp,
							name: geo.name,
							coalition: geo.side,
							discordName: geo.discordName,
							avatar: geo.avatar,
							type: "recon",
							position: [coord[1], coord[0]],
							screenshot: geo.screenshot,
							description: geo.description,
							status: geo.status,
							clickable: geo.clickable,
							color: geo.color,
							store: "server"
						  }),
						};
					  });
				} else if (geo.type === "quest") {
					const coord = mgrs.toPoint(geo.posMGRS.replace(" ", ""));
					  geometryStore.setState((state) => {
						return {
						  ...state,
						  geometry: state.geometry.set(geo.id, {
							id: geo.id,
							timeStamp: geo.timeStamp,
							name: geo.name,
							coalition: geo.side,
							discordName: geo.discordName,
							avatar: geo.avatar,
							type: "quest",
							position: [coord[1], coord[0]],
							screenshot: geo.screenshot,
							description: geo.description,
							task: geo.task,
							status: geo.status,
							clickable: geo.clickable,
							color: geo.color,
							subType: geo.subType,
							store: "server"
						  }),
						};
					  });
				}
			}
		}
	});
}


export function deleteGlobalGeometry(idList:any, side:string) {
	idList.forEach((id:any) => {
		deleteGeometry(id);
	});
}

