import Immutable from "immutable";
import * as maptalks from "maptalks";
import ms from "milsymbol";
import { useEffect } from "react";
import GroundUnitData from "../data/units/ground.json";
import {
  Server,
  serverStore,
  setSelectedEntityId,
} from "../stores/ServerStore";
import { GroundUnitMode, settingsStore } from "../stores/SettingsStore";
import {
  Entity,
  getCoalitionColor,
  getCoalitionIdentity,
} from "../types/entity";

type UnitData = {
  code: string;
  dcs_codes: Array<string>;
  mil_std_2525_d: number;
  name: string;
  sidc?: string;
};

export const groundIconCache: Record<string, string> = {};
export const groundUnitData = Immutable.Map(
  GroundUnitData.map((it) => [it.dcs_codes[0], it] as [string, UnitData])
);

function renderCombatZone(layer: maptalks.VectorLayer, unit: Entity, zoneSize: number) {
  const collection = layer.getGeometryById(
    unit.id
  ) as maptalks.GeometryCollection;
  if (collection) {
    return;
  }

  const unitData = groundUnitData.get(unit.name);
  let sidc;
  if (unitData && unitData.sidc) {
    sidc = `${unitData.sidc[0]}${getCoalitionIdentity(
      unit.coalition
    )}${unitData.sidc.slice(2)}`;
  } else {
    sidc = `S${getCoalitionIdentity(unit.coalition)}G-E-----`;
  }

  if (sidc && !groundIconCache[sidc]) {
    groundIconCache[sidc] = new ms.Symbol(sidc, {
      size: 32,
      frame: true,
      fill: true,
      strokeWidth: 8,
      monoColor: getCoalitionColor(unit.coalition),
    }).toDataURL();
  }

  //const icon = new maptalks.Circle([(unit.longitude+(Math.random() * 0.04)-0.02), (unit.latitude+(Math.random() * 0.04)-0.02)], 10000, {
  //const icon = new maptalks.Circle([(unit.longitude+((Math.random() * 0.04)-0.02)*zoneSize/5000), (unit.latitude+((Math.random() * 0.04)-0.02)*zoneSize/5000)], zoneSize, {
  const icon = new maptalks.Circle([(unit.longitude+((unit.ratioLong * 0.04)-0.02)*zoneSize/5000), (unit.latitude+((unit.ratioLat * 0.04)-0.02)*zoneSize/5000)], zoneSize, {
    draggable: false,
    visible: true,
    editable: false,
    symbol: {
      lineColor: getCoalitionColor(unit.coalition),
	  lineWidth: 0,
	  polygonFill: getCoalitionColor(unit.coalition)
    },
  });

  const col = new maptalks.GeometryCollection([icon], {
    id: unit.id,
    draggable: false,
  });
  // col.on("click", (e) => {
    // setSelectedEntityId(unit.id);
  // });

  layer.addGeometry(col);
}

function renderCombatZones(
  map: maptalks.Map,
  [entities, offset, server]: [
    Immutable.Map<number, Entity>,
    number,
    Server | null
  ],
  [_x, lastOffset, _y]: [unknown, number, unknown]
) {
  //const layer = map.getLayer("combat-zones") as maptalks.VectorLayer;
  const groundUnitMode = settingsStore.getState().map.groundUnitMode;
  const coalition = server?.coalition;
  //console.log (coalition);
  const isVisible = (target: Entity) => {
	if (coalition === "blue" && target.coalition === "Enemies") {
		return server?.ground_unit_modes.includes(GroundUnitMode.FRIENDLY)
	} else if (coalition === "blue" && target.coalition === "Allies") {
		return server?.ground_unit_modes.includes(GroundUnitMode.ENEMY)
	} else if (coalition === "red" && target.coalition === "Enemies") {
		return server?.ground_unit_modes.includes(GroundUnitMode.ENEMY)
	} else if (coalition === "red" && target.coalition === "Allies") {
		return server?.ground_unit_modes.includes(GroundUnitMode.FRIENDLY)
	} else if (coalition === "GM") {
		return true
	}
    return false;
  };
	
  var layer
  layer = map.getLayer("combat-zones-blue") as maptalks.VectorLayer;
  for (const geo of layer.getGeometries()) {
    const entity = entities.get((geo as any)._id as number);
    if (!entity || !isVisible(entity)) {
      geo.remove();
    }
  }
  
  layer = map.getLayer("combat-zones-red") as maptalks.VectorLayer;
  for (const geo of layer.getGeometries()) {
    const entity = entities.get((geo as any)._id as number);
    if (!entity || !isVisible(entity)) {
      geo.remove();
    }
  }
  
  layer = map.getLayer("combat-zones") as maptalks.VectorLayer;
  for (const geo of layer.getGeometries()) {
    const entity = entities.get((geo as any)._id as number);
    if (!entity || !isVisible(entity)) {
      geo.remove();
    }
  }
  
  for (const entity of entities.valueSeq()) {
    if (
      isVisible(entity) &&
      (lastOffset === 0 || entity.updatedAt > lastOffset)
    ) {
	  if (entity.coalition === "Allies") {
		layer = map.getLayer("combat-zones-red") as maptalks.VectorLayer;
	  } else if (entity.coalition === "Enemies") {
		layer = map.getLayer("combat-zones-blue") as maptalks.VectorLayer;
	  } else {
		layer = map.getLayer("combat-zones") as maptalks.VectorLayer;
	  }
	  
	  var zoneSize = 10;
	  if (server?.zones_size && server?.zones_size.length > 0) {
		  for(var i = 0;i < server?.zones_size.length;i += 1) {
			if (entity.types.includes(server?.zones_size[i][0])) {
				zoneSize = server?.zones_size[i][1];
				break;
			} else if ( server?.zones_size[i][0] === "default") {
				zoneSize = server?.zones_size[i][1];
			}
		  }
	  }
      renderCombatZone(layer, entity, zoneSize);
    }
  }

  lastOffset = offset;
}

export default function useRenderCombatZones(map: maptalks.Map | null) {
  const [groundUnitMode] = settingsStore((state) => [state.map.groundUnitMode]);

  useEffect(() => {
    if (!map) return;
    const { entities, offset, server } = serverStore.getState();
    if (!server) return;
    renderCombatZones(
      map,
      [
        entities.filter(
          (it) =>
            it.types.includes("Ground") &&
            !it.types.includes("Air") &&
            !it.types.includes("Static")
        ),
        offset,
        server,
      ],
      [null, 0, null]
    );
  }, [map, groundUnitMode]);

  useEffect(() => {
    if (!map) return;

    return serverStore.subscribe(
      (a: [Immutable.Map<number, Entity>, number, Server | null], b) =>
        renderCombatZones(map, a, b),
      (state) =>
        [
          state.entities.filter(
            (it) =>
              it.types.includes("Ground") &&
              !it.types.includes("Air") &&
              !it.types.includes("Static")
          ),
          state.offset,
          state.server,
        ] as [Immutable.Map<number, Entity>, number, Server | null]
    );
  }, [map]);
}
