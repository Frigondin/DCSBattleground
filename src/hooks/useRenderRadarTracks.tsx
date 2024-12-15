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
import { GroundUnitMode, FlightUnitMode, settingsStore } from "../stores/SettingsStore";
import {
  Entity,
  getCoalitionColor,
  getCoalitionIdentity,
} from "../types/entity";
import {
  estimatedAltitudeRate,
  estimatedSpeed,
  isTrackVisible,
  trackStore,
} from "../stores/TrackStore";
import { alertStore } from "../stores/AlertStore";
import { EntityInfo, iconCache, MapSimpleEntity } from "../components/MapEntity";
import { colorMode } from "../components/MapIcon";
import { planes } from "../dcs/aircraft";
import { FONT_FAMILY } from "../Constants";
import {
  computeBRAA,
  getBearingMap,
  getCardinal,
  getFlyDistance,
} from "../util";

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


function pruneLayer(
  layer: maptalks.VectorLayer,
  keepFn: (geoId: number) => boolean
) {
  for (const geo of layer.getGeometries()) {
    if (!keepFn((geo as any)._id)) {
      geo.remove();
    }
  }
}

const syncVisibility = (geo: maptalks.Geometry, value: boolean) => {
  const isVisible = geo.isVisible();
  if (!isVisible && value) {
    geo.show();
  } else if (isVisible && !value) {
    geo.hide();
  }
};


export default function useRenderRadarTracks(map: maptalks.Map | null, selectedEntityId: number | null) {
  const radarTracks = trackStore((state) => state.tracks.entrySeq().toArray());
  const triggeredEntityIds = alertStore((state) =>
    state.triggeredEntities.keySeq().toSet()
  );

  useEffect(() => {
	if (!map) return;
	

    const settings = settingsStore.getState();
	const { entities, offset, server } = serverStore.getState();
	const coalition = server?.coalition;
    //const entities = serverStore.getState().entities;
    const tracks = trackStore.getState().tracks;

    const vvLayer = map.getLayer("track-vv") as maptalks.VectorLayer;
    const trailLayer = map.getLayer("track-trails") as maptalks.VectorLayer;
    const iconLayer = map.getLayer("track-icons") as maptalks.VectorLayer;
    const nameLayer = map.getLayer("track-name") as maptalks.VectorLayer;
    const altLayer = map.getLayer("track-altitude") as maptalks.VectorLayer;
    const speedLayer = map.getLayer("track-speed") as maptalks.VectorLayer;
    const vertLayer = map.getLayer(
      "track-verticalvelo"
    ) as maptalks.VectorLayer;
    const alertLayer = map.getLayer(
      "track-alert-radius"
    ) as maptalks.VectorLayer;

    pruneLayer(vvLayer, (it) => tracks.has(it));
    pruneLayer(iconLayer, (it) => entities.has(it));
    pruneLayer(trailLayer, (it) => entities.has(it));
    pruneLayer(nameLayer, (it) => entities.has(it));
    pruneLayer(altLayer, (it) => entities.has(it));
    pruneLayer(speedLayer, (it) => entities.has(it));
    pruneLayer(vertLayer, (it) => entities.has(it));

	if (server?.toggle_connection) {
		server.toggle_connection = false
		if (!server?.view_aircraft_when_in_flight && server?.player_is_connected) {
			vvLayer.hide()
			trailLayer.hide()
			iconLayer.hide()
			nameLayer.hide()
			altLayer.hide()
			speedLayer.hide()
			vertLayer.hide()
		} else {
			vvLayer.show()
			trailLayer.show()
			iconLayer.show()
			nameLayer.show()
			altLayer.show()
			speedLayer.show()
			vertLayer.show()
		}
	}
	
    for (const geo of alertLayer.getGeometries()) {
      const geoA: any = geo;
      if (!geoA._id) continue;
      const [geoId, _] = (geoA._id as string).split("-");
      if (!entities.has(parseInt(geoId))) {
        geo.remove();
      }
    }
	var layerRed = map.getLayer("ground-units-red") as maptalks.VectorLayer;
	var layerBlue = map.getLayer("ground-units-blue") as maptalks.VectorLayer;
	const { editor_mode_on } = serverStore.getState();
	const isVisible = (target: Entity) => {
		if (coalition === "GM" || editor_mode_on)  {
			return true
		} else if (coalition === "blue" && target.coalition === "Enemies" && target.types.includes("Air")) {
			return server?.flight_unit_modes.includes(FlightUnitMode.FRIENDLY)
		} else if (coalition === "blue" && target.coalition === "Allies" && target.types.includes("Air")) {
			return server?.flight_unit_modes.includes(FlightUnitMode.ENEMY)
		} else if (coalition === "red" && target.coalition === "Enemies" && target.types.includes("Air")) {
			return server?.flight_unit_modes.includes(FlightUnitMode.ENEMY)
		} else if (coalition === "red" && target.coalition === "Allies" && target.types.includes("Air")) {
			return server?.flight_unit_modes.includes(FlightUnitMode.FRIENDLY)
		} else if (target.types.includes("Ground") && target.coalition === "Allies" && layerRed.getGeometryById(target.id)) {
			return true
		} else if (target.types.includes("Ground") && target.coalition === "Enemies" && layerBlue.getGeometryById(target.id)) {
			return true
		} else if (target.types.includes("Sea") && target.coalition === "Allies" && layerRed.getGeometryById(target.id)) {
			return true
		} else if (target.types.includes("Sea") && target.coalition === "Enemies" && layerBlue.getGeometryById(target.id)) {
			return true
		} else {
			return false;
		}
	  };
    for (const [entityId, track] of radarTracks) {
      const trackVisible = isTrackVisible(track);
      const entity = entities.get(entityId);
      if (!entity) {
        continue;
      }
	  if (!isVisible(entity)) continue;

      const trackOptions = trackStore.getState().trackOptions.get(entityId);
	  var iconGeo;
	  //console.log(entity);
	  if ((entity.types.includes("Ground") || entity.types.includes("Sea")) && entity.coalition === "Allies") {
		const collection = layerRed.getGeometryById(entityId) as maptalks.GeometryCollection;
		iconGeo = collection.getGeometries()[0] as maptalks.Marker;
	  } else if((entity.types.includes("Ground") || entity.types.includes("Sea")) && entity.coalition === "Enemies") {
		const collection = layerBlue.getGeometryById(entityId) as maptalks.GeometryCollection;
		iconGeo = collection.getGeometries()[0] as maptalks.Marker;
	  } else {
		iconGeo = iconLayer.getGeometryById(entityId) as maptalks.Marker;
	  }
      if (!iconGeo) {
        if (iconCache[entity.sidc] === undefined) {
          iconCache[entity.sidc] = new ms.Symbol(entity.sidc, {
            size: 16,
            frame: true,
            fill: false,
            colorMode: colorMode,
            strokeWidth: 8,
          }).toDataURL();
        }
        const iconGeo = new maptalks.Marker(
          [entity.longitude, entity.latitude],
          {
            id: entityId,
            draggable: false,
            visible: false,
            editable: false,
            symbol: {
              markerFile: iconCache[entity.sidc],
              markerDy: 10,
            },
          }
        );

        iconLayer.addGeometry(iconGeo);
        iconGeo.on("click", (e) => {
          setSelectedEntityId(entity.id);
          return false;
        });
      } else {
        iconGeo.setCoordinates([entity.longitude, entity.latitude]);
        syncVisibility(iconGeo, trackVisible);
      }
	
	  if (entity.types.includes("Ground")) continue;
	  if (entity.types.includes("Sea")) continue;
	  
      const nameGeo = nameLayer.getGeometryById(entityId) as maptalks.Label;
      if (!nameGeo) {
        let name = entity.name;
        if (entity.pilot && !entity.pilot.startsWith(entity.group)) {
          name = `${entity.pilot} (${name})`;
        } else if (planes[entity.name]?.natoName !== undefined) {
          name = `${planes[entity.name].natoName} (${entity.name})`;
        }

        let color = entity.coalition !== "Allies" ? "#17c2f6" : "#ff8080";
        if (trackOptions?.watching) {
          color = "yellow";
        }

        const nameLabel = new maptalks.Label(name, [0, 0], {
          id: entityId,
          draggable: false,
          visible: false,
          editable: false,
          boxStyle: {
            padding: [2, 2],
            horizontalAlignment: "left",
            symbol: {
              markerType: "square",
              markerFill: "#4B5563",
              markerFillOpacity: 0.5,
              markerLineColor: color,
              textHorizontalAlignment: "right",
              textDx: 20,
            },
          },
          textSymbol: {
            textFaceName: FONT_FAMILY,
            textFill: "white",
            textSize: 12,
          },
        });
        nameLabel.on("click", (e) => {
          setSelectedEntityId(entity.id);
          return false;
        });
        nameLayer.addGeometry(nameLabel);
      } else {
        const symbol = nameGeo.getSymbol();
        if (triggeredEntityIds.has(entity.id)) {
          if ((symbol as any).markerLineWidth !== 4) {
            nameGeo.setSymbol({
              ...symbol,
              markerLineWidth: 4,
            });
          }
        } else {
          if ((symbol as any).markerLineWidth !== 1) {
            nameGeo.setSymbol({
              ...symbol,
              markerLineWidth: 1,
            });
          }
        }

        let color = entity.coalition !== "Allies" ? "#17c2f6" : "#ff8080";
        if (trackOptions?.watching) {
          color = "yellow";
        }

        const style: any = nameGeo.getBoxStyle();
        if (style.symbol.markerLineColor !== color) {
          nameGeo.setBoxStyle({
            ...style,
            symbol: { ...style.symbol, markerLineColor: color },
          });
        }

        nameGeo.setCoordinates([entity.longitude, entity.latitude]);
        syncVisibility(nameGeo, trackVisible);
      }

      const altGeo = altLayer.getGeometryById(entityId) as maptalks.Label;
      if (!altGeo) {
        const altLabel = new maptalks.Label("", [0, 0], {
          id: entityId,
          draggable: false,
          visible: false,
          editable: false,
          boxStyle: {
            padding: [2, 2],
            horizontalAlignment: "left",
            symbol: {
              markerType: "square",
              markerFillOpacity: 0,
              markerLineOpacity: 0,
              textHorizontalAlignment: "right",
              textDx: 20,
              textDy: 18,
            },
          },
          textSymbol: {
            textFaceName: FONT_FAMILY,
            textFill: "#FFC0CB",
            textSize: 12,
          },
        });
        altLayer.addGeometry(altLabel);
      } else {
        (altGeo.setContent as any)(
          `${((entity.altitude * 3.28084) / 1000)
            .toFixed(1)
            .toString()
            .padStart(3, "0")}`
        );
        altGeo.setCoordinates([entity.longitude, entity.latitude]);
        syncVisibility(altGeo, trackVisible);
      }

      const speedGeo = speedLayer.getGeometryById(entityId) as maptalks.Label;
      if (!speedGeo) {
        const speedLabel = new maptalks.Label("", [0, 0], {
          id: entityId,
          draggable: false,
          visible: false,
          editable: false,
          boxStyle: {
            padding: [2, 2],
            horizontalAlignment: "left",
            symbol: {
              markerType: "square",
              markerFillOpacity: 0,
              markerLineOpacity: 0,
              textHorizontalAlignment: "right",
              textDx: 47,
              textDy: 18,
            },
          },
          textSymbol: {
            textFaceName: FONT_FAMILY,
            textFill: "orange",
            textSize: 12,
          },
        });
        speedLayer.addGeometry(speedLabel);
      } else {
        (speedGeo.setContent as any)(`${Math.round(estimatedSpeed(track))}`);
        speedGeo.setCoordinates([entity.longitude, entity.latitude]);

        syncVisibility(speedGeo, trackVisible);
      }

      const vertGeo = vertLayer.getGeometryById(entityId) as maptalks.Label;
      if (!vertGeo) {
        const vertLabel = new maptalks.Label("", [0, 0], {
          id: entityId,
          draggable: false,
          visible: false,
          editable: false,
          boxStyle: {
            padding: [2, 2],
            horizontalAlignment: "left",
            symbol: {
              markerType: "square",
              markerFillOpacity: 0,
              markerLineOpacity: 0,
              textHorizontalAlignment: "right",
              textDx: 72,
              textDy: 18,
            },
          },
          textSymbol: {
            textFaceName: FONT_FAMILY,
            textFill: "#6EE7B7",
            textSize: 12,
          },
        });
        vertLayer.addGeometry(vertLabel);
      } else {
        (vertGeo.setContent as any)(
          `${Math.round(estimatedAltitudeRate(track))}`
        );
        vertGeo.setCoordinates([entity.longitude, entity.latitude]);
        syncVisibility(vertGeo, trackVisible);
      }

      let threatCircle = alertLayer.getGeometryById(
        `${entityId}-threat`
      ) as maptalks.Circle;
      if (!threatCircle) {
        threatCircle = new maptalks.Circle([0, 0], 500, {
          id: `${entityId}-threat`,
          draggable: false,
          visible: false,
          editable: false,
          symbol: {
            lineColor: "red",
            lineWidth: 2,
            lineOpacity: 0.75,
          },
        });
        alertLayer.addGeometry(threatCircle);
      } else {
        const threatRadius =
          trackOptions &&
          (trackOptions.threatRadius || trackOptions.profileThreatRadius);
        if (threatRadius) {
          threatCircle.setCoordinates([entity.longitude, entity.latitude]);
          threatCircle.setRadius(threatRadius * 1852);
          trackVisible ? threatCircle.show() : threatCircle.hide();
        } else {
          threatCircle.hide();
        }
      }

      let warningCircle = alertLayer.getGeometryById(
        `${entityId}-warning`
      ) as maptalks.Circle;
      if (!warningCircle) {
        warningCircle = new maptalks.Circle([0, 0], 500, {
          id: `${entityId}-warning`,
          draggable: false,
          visible: false,
          editable: false,
          symbol: {
            lineColor: "yellow",
            lineWidth: 2,
            lineOpacity: 0.75,
          },
        });
        alertLayer.addGeometry(warningCircle);
      } else {
        const warningRadius =
          trackOptions &&
          (trackOptions.warningRadius || trackOptions.profileWarningRadius);
        syncVisibility(warningCircle, (warningRadius && trackVisible) || false);
        if (warningRadius) {
          warningCircle.setCoordinates([entity.longitude, entity.latitude]);
          warningCircle.setRadius(warningRadius * 1852);
        }
      }

      const trailLength = settings.map.trackTrailLength;
      if (trailLength !== undefined && trailLength > 0) {
        let trackPingGroup = trailLayer.getGeometryById(
          entityId
        ) as maptalks.GeometryCollection;
        if (!trackPingGroup) {
          trackPingGroup = new maptalks.GeometryCollection([], {
            id: entityId,
          });
          trailLayer.addGeometry(trackPingGroup);
        }

        let trackPointGeos =
          trackPingGroup.getGeometries() as Array<maptalks.Marker>;
        if (trackPointGeos.length !== settings.map.trackTrailLength) {
          trackPointGeos = [];

          for (let i = 0; i < trailLength; i++) {
            trackPointGeos.push(
              new maptalks.Marker([0, 0], {
                id: i,
                visible: false,
                editable: false,
                shadowBlur: 0,
                draggable: false,
                dragShadow: false,
                drawOnAxis: null,
                symbol: {},
              })
            );
          }
          trackPingGroup.setGeometries(trackPointGeos);
        }

        if (estimatedSpeed(track) < 25) {
          for (const trackGeo of trackPointGeos) {
            if (trackGeo.isVisible()) {
              trackGeo.hide();
            }
          }
        } else {
          for (
            let index = 0;
            index < track.length && index < trailLength;
            index++
          ) {
            const trackPoint = track[index];
            const trackPointGeo = trackPointGeos[index];
            syncVisibility(trackPointGeo, true);
            trackPointGeo.setCoordinates([
              trackPoint.position[1],
              trackPoint.position[0],
            ]);

            let color = "white";
            if (trackVisible) {
              color = entity.coalition !== "Allies" ? "#17c2f6" : "#ff8080";
            }

            trackPointGeo.setSymbol({
              markerType: "square",
              markerFill: color,
              markerLineColor: "black",
              markerLineOpacity: 0.1,
              markerLineWidth: 1,
              markerWidth: 5,
              markerHeight: 5,
              markerDx: 0,
              markerDy: 0,
              markerFillOpacity: (100 - index * 10) / 100,
            });
          }
        }
      }

      const speed = track && estimatedSpeed(track);
      const dirArrowEnd =
        speed &&
        track &&
        isTrackVisible(track) &&
        computeBRAA(
          track[0].position[0],
          track[0].position[1],
          track[0].heading,
          // knots -> meters per second -> 30 seconds
          speed * 0.514444 * 30
        );
      const geo = vvLayer.getGeometryById(
        entityId
      ) as maptalks.LineString | null;

      if (dirArrowEnd) {
        if (!geo) {
          vvLayer.addGeometry(
            new maptalks.LineString(
              [
                [track[0].position[1], track[0].position[0]],
                [dirArrowEnd[1], dirArrowEnd[0]],
              ],
              {
                id: entityId,
                arrowStyle: "classic",
                arrowPlacement: "vertex",
                symbol: {
                  lineColor:
                    entity.coalition !== "Allies" ? "#17c2f6" : "#ff8080",
                  lineWidth: 1.5,
                },
              }
            )
          );
        } else {
          geo.setCoordinates([
            [track[0].position[1], track[0].position[0]],
            [dirArrowEnd[1], dirArrowEnd[0]],
          ]);
        }
        geo?.show();
      } else {
        geo?.hide();
        // TODO: idk
      }
    }
  }, [radarTracks, triggeredEntityIds]);
  
  useEffect(() => {
	if (!map) return;
    const alertLayer = map.getLayer(
      "track-alert-radius"
    ) as maptalks.VectorLayer;
    for (const geo of alertLayer.getGeometries()) {
      const [entityId, typeName] = ((geo as any)._id as string).split("-");
      if (selectedEntityId && parseInt(entityId) === selectedEntityId) {
        if (typeName === "threat") {
          geo.setSymbol({
            lineColor: "red",
            lineWidth: 2,
            lineOpacity: 0.75,
          });
        } else if (typeName === "warning") {
          geo.setSymbol({
            lineColor: "yellow",
            lineWidth: 2,
            lineOpacity: 0.6,
          });
        }
      } else {
        if (typeName === "threat") {
          geo.setSymbol({
            lineColor: "red",
            lineWidth: 1,
            lineOpacity: 0.5,
          });
        } else if (typeName === "warning") {
          geo.setSymbol({
            lineColor: "yellow",
            lineWidth: 1,
            lineOpacity: 0.25,
          });
        }
      }
    }
  }, [radarTracks, selectedEntityId]);

  return <></>;
}

