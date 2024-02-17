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
  coalition: string;
  discordName: string;
  avatar: string;
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
  screenshot: string;
} & GeometryBase;

export type Quest = {
  type: "quest";
  position: [number, number];
  screenshot: Array<string>;
  description: Array<string>;
  task:	Array<JSON>;
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
    return { ...state, geometry: state.geometry.set(value.id, value) };
  });
}

export function updateGeometrySafe(id: number, value: Partial<Geometry>) {
  geometryStore.setState((state) => {
    const existing = state.geometry.get(id);
    if (!existing) return;
    return {
      ...state,
      geometry: state.geometry.set(id, { ...existing, ...value } as Geometry),
    };
  });
}

export function setSelectedGeometry(id: number | null) {
  geometryStore.setState({ selectedGeometry: id });
}

export function addZone(points: Array<[number, number]>) {
	const { entities, offset, server } = serverStore.getState();
	geometryStore.setState((state) => {
	return {
		  ...state,
		  id: state.id + 1,
		  geometry: state.geometry.set(state.id, {
			id: state.id,
			coalition: server?.coalition as string,
			discordName: server?.discord_name as string,
			avatar: server?.avatar as string,
			type: "zone",
			points,
		  }),
		};
	});
}

export function addMarkPoint(position: [number, number]) {
	const { entities, offset, server } = serverStore.getState();
	geometryStore.setState((state) => {
		return {
		  ...state,
		  id: state.id + 1,
		  geometry: state.geometry.set(state.id, {
			id: state.id,
			coalition: server?.coalition as string,
			discordName: server?.discord_name as string,
			avatar: server?.avatar as string,
			type: "markpoint",
			position,
		  }),
		};
	});
}

export function addCircle(center: [number, number], radius: number) {
	const { entities, offset, server } = serverStore.getState();

	geometryStore.setState((state) => {
		return {
		  ...state,
		  id: state.id + 1,
		  geometry: state.geometry.set(state.id, {
			id: state.id,
			coalition: server?.coalition as string,
			discordName: server?.discord_name as string,
			avatar: server?.avatar as string,
			type: "circle",
			center,
			radius
		  }),
		};
	});
}

export function addWaypoints(points: Array<[number, number]>) {
	const { entities, offset, server } = serverStore.getState();
	geometryStore.setState((state) => {
		return {
		  ...state,
		  id: state.id + 1,
		  geometry: state.geometry.set(state.id, {
			id: state.id,
			coalition: server?.coalition as string,
			discordName: server?.discord_name as string,
			avatar: server?.avatar as string,
			type: "waypoints",
			points,
		  }),
		};
	});
}

export function addLine(points: Array<[number, number]>) {
	const { entities, offset, server } = serverStore.getState();
	geometryStore.setState((state) => {
		return {
		  ...state,
		  id: state.id + 1,
		  geometry: state.geometry.set(state.id, {
			id: state.id,
			coalition: server?.coalition as string,
			discordName: server?.discord_name as string,
			avatar: server?.avatar as string,
			type: "line",
			points,
		  }),
		};
	});
}



export function addGlobalGeometry(geoList:any, coalition:string) {
	geoList.forEach((geo:any) => {
		if (coalition == "GM" || coalition == geo.side) {
			if (geo.type === "markpoint") {
				  geometryStore.setState((state) => {
					return {
					  ...state,
					  geometry: state.geometry.set(geo.id, {
						id: geo.id,
						name: geo.name,
						coalition: geo.side,
						discordName: geo.discordName,
						avatar: geo.avatar,
						type: "markpoint",
						position: geo.position,
					  }),
					};
				  });
			} else if (geo.type === "zone") {
				  geometryStore.setState((state) => {
					return {
					  ...state,
					  geometry: state.geometry.set(geo.id, {
						id: geo.id,
						name: geo.name,
						coalition: geo.side,
						discordName: geo.discordName,
						avatar: geo.avatar,
						type: "zone",
						points: geo.points,
					  }),
					};
				  });
			} else if (geo.type === "waypoints") {
				  geometryStore.setState((state) => {
					return {
					  ...state,
					  geometry: state.geometry.set(geo.id, {
						id: geo.id,
						name: geo.name,
						coalition: geo.side,
						discordName: geo.discordName,
						avatar: geo.avatar,
						type: "waypoints",
						points: geo.points,
					  }),
					};
				  });
			} else if (geo.type === "circle") {
				  geometryStore.setState((state) => {
					return {
					  ...state,
					  geometry: state.geometry.set(geo.id, {
						id: geo.id,
						name: geo.name,
						coalition: geo.side,
						discordName: geo.discordName,
						avatar: geo.avatar,
						type: "circle",
						center: geo.center,
						radius: geo.radius
					  }),
					};
				  });
			} else if (geo.type === "line") {
				  geometryStore.setState((state) => {
					return {
					  ...state,
					  geometry: state.geometry.set(geo.id, {
						id: geo.id,
						name: geo.name,
						coalition: geo.side,
						discordName: geo.discordName,
						avatar: geo.avatar,
						type: "line",
						points: geo.points,
					  }),
					};
				  });
			} else if (geo.type === "border") {
				  geometryStore.setState((state) => {
					return {
					  ...state,
					  geometry: state.geometry.set(geo.id, {
						id: geo.id,
						name: geo.name,
						coalition: geo.side,
						discordName: geo.discordName,
						avatar: geo.avatar,
						type: "border",
						points: geo.points,
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
						name: geo.name,
						coalition: geo.side,
						discordName: geo.discordName,
						avatar: geo.avatar,
						type: "recon",
						position: [coord[1], coord[0]],
						screenshot: geo.screenshot
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
						name: geo.name,
						coalition: geo.side,
						discordName: geo.discordName,
						avatar: geo.avatar,
						type: "quest",
						position: [coord[1], coord[0]],
						screenshot: geo.screenshot,
						description: geo.description,
						task: geo.task
					  }),
					};
				  });
			}
		}
	});
}


export function deleteGlobalGeometry(idList:any, side:string) {
	idList.forEach((id:any) => {
		deleteGeometry(id);
	});
}

