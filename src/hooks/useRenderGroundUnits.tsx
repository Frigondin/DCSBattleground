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
import { setSelectedGeometry } from "../stores/GeometryStore";
import { GroundUnitMode, FlightUnitMode, settingsStore } from "../stores/SettingsStore";
import {
  Entity,
  getCoalitionColor,
  getCoalitionIdentity,
} from "../types/entity";
import { colorMode } from "../components/MapIcon";
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

var counter=0;
function renderGroundUnit(layer: maptalks.VectorLayer, unit: Entity, coalition: string | undefined, guRatio: number | undefined, guMaxQty: number | undefined) {
  const collection = layer.getGeometryById(
    unit.id
  ) as maptalks.GeometryCollection;
  if (collection) {
    return;
  }
  
  if (!guRatio) return;
  if (!guMaxQty) return;
  
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
      size: 16,
      frame: true,
      fill: true,
	  fillOpacity: 1,
      strokeWidth: 8,
	  colorMode: "Light",
    }).toDataURL();
  }

  const icon = new maptalks.Marker([unit.longitude, unit.latitude], {
    draggable: false,
    visible: true,
    editable: false,
    symbol: {
      markerFile: sidc && groundIconCache[sidc],
      markerDy: {
        stops: [
          [8, 6],
          [10, 12],
          [12, 18],
          [14, 24],
        ],
      },
      markerOpacity: 1,
      markerWidth: {
        stops: [
          [8, 12],
          [10, 24],
          [12, 36],
          [14, 48],
        ],
      },
      markerHeight: {
        stops: [
          [8, 12],
          [10, 24],
          [12, 36],
          [14, 48],
        ],
      },
    },
  });
  
	var displayUnit;
	const { editor_mode_on } = serverStore.getState();
	if (coalition === "GM" || guMaxQty === -1 || editor_mode_on) {
		displayUnit = true;
	} else if (coalition === "blue" && unit.coalition === "Enemies") {
		displayUnit = true;
	} else if (coalition === "blue" && unit.coalition === "Allies") {
		displayUnit = unit.visible;
	} else if (coalition === "red" && unit.coalition === "Allies") {
		displayUnit = true;
	} else if (coalition === "red" && unit.coalition === "Enemies") {
		displayUnit = unit.visible;
	} else {
		displayUnit = unit.visible;
	}
	
	if (displayUnit) {
		const col = new maptalks.GeometryCollection([icon], {
			id: unit.id,
			draggable: false,
		});
		col.on("click", (e) => {
			setSelectedEntityId(unit.id);
			setSelectedGeometry(null);
		});
		layer.addGeometry(col);
	}  
}

function renderGroundUnits(
  map: maptalks.Map,
  [entities, offset, server]: [
    Immutable.Map<number, Entity>,
    number,
    Server | null
  ],
  [_x, lastOffset, _y]: [unknown, number, unknown]
) {
  const groundUnitMode = settingsStore.getState().map.groundUnitMode;
  const coalition = server?.coalition;
  const guRatio = server?.ground_unit_ratio;
  const guMaxQty = server?.ground_unit_max_qty;
  const { editor_mode_on } = serverStore.getState();
  const isVisible = (target: Entity) => {
    if (coalition === "GM" || editor_mode_on) {
		return true
	} else if (coalition === "blue" && target.coalition === "Enemies") {
		return server?.ground_unit_modes.includes(GroundUnitMode.FRIENDLY)
	} else if (coalition === "blue" && target.coalition === "Allies" && target.visible) {
		return server?.ground_unit_modes.includes(GroundUnitMode.ENEMY)
	} else if (coalition === "red" && target.coalition === "Enemies" && target.visible) {
		return server?.ground_unit_modes.includes(GroundUnitMode.ENEMY)
	} else if (coalition === "red" && target.coalition === "Allies") {
		return server?.ground_unit_modes.includes(GroundUnitMode.FRIENDLY)
	}
    return false;
  };

  var layer
  layer = map.getLayer("ground-units-blue") as maptalks.VectorLayer;
  for (const geo of layer.getGeometries()) {
    const entity = entities.get((geo as any)._id as number);
    if (!entity || !isVisible(entity)) {
      geo.remove();
    }
  }
  
  layer = map.getLayer("ground-units-red") as maptalks.VectorLayer;
  for (const geo of layer.getGeometries()) {
    const entity = entities.get((geo as any)._id as number);
    if (!entity || !isVisible(entity)) {
      geo.remove();
    }
  }
  
  layer = map.getLayer("ground-units") as maptalks.VectorLayer;
  for (const geo of layer.getGeometries()) {
    const entity = entities.get((geo as any)._id as number);
    if (!entity || !isVisible(entity)) {
      geo.remove();
    }
  }

  for (const entity of entities.valueSeq()) {
    if (
      isVisible(entity) &&
      (lastOffset === 0 || entity.updatedAt > lastOffset || editor_mode_on)
    ) {
	  if (entity.coalition === "Allies") {
		layer = map.getLayer("ground-units-red") as maptalks.VectorLayer;
	  } else if (entity.coalition === "Enemies") {
		layer = map.getLayer("ground-units-blue") as maptalks.VectorLayer;
	  } else {
		layer = map.getLayer("ground-units") as maptalks.VectorLayer;
	  }
      renderGroundUnit(layer, entity, coalition, guRatio, guMaxQty);
    }
  }

  lastOffset = offset;
}

export default function useRenderGroundUnit(map: maptalks.Map | null) {
  const [groundUnitMode] = settingsStore((state) => [state.map.groundUnitMode]);

  useEffect(() => {
    if (!map) return;
    const { entities, offset, server } = serverStore.getState();
    if (!server) return;
    renderGroundUnits(
      map,
      [
        entities.filter(
          (it) =>
            (it.types.includes("Ground") || it.types.includes("Sea")) &&
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
        renderGroundUnits(map, a, b),
      (state) =>
        [
          state.entities.filter(
            (it) =>
              (it.types.includes("Ground") || it.types.includes("Sea")) &&
              !it.types.includes("Air") &&
              !it.types.includes("Static")
          ),
          state.offset,
          state.server,
        ] as [Immutable.Map<number, Entity>, number, Server | null]
    );
  }, [map]);
}
