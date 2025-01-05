import * as maptalks from "maptalks";
import * as animatemarker from "maptalks.animatemarker";
import ms from "milsymbol";
import * as mgrs from "mgrs";
import React, {
  MutableRefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { renderToString } from "react-dom/server";
import { FONT_FAMILY } from "../Constants";
import { planes } from "../dcs/aircraft";
import { DCSMap } from "../dcs/maps/DCSMap";
import { useKeyPress } from "../hooks/useKeyPress";
import useRenderGeometry from "../hooks/useRenderGeometry";
import useRenderGroundUnit from "../hooks/useRenderGroundUnits";
import useRenderCombatZones from "../hooks/useRenderCombatZones";
import useRenderRadarTracks from "../hooks/useRenderRadarTracks";
import { alertStore } from "../stores/AlertStore";
import { serverStore, setSelectedEntityId } from "../stores/ServerStore";
import { settingsStore } from "../stores/SettingsStore";
import {
  estimatedAltitudeRate,
  estimatedSpeed,
  isTrackVisible,
  trackStore,
} from "../stores/TrackStore";
import {
  computeBRAA,
  getBearingMap,
  getCardinal,
  getFlyDistance,
} from "../util";
import { Console } from "./Console";
import { EntityInfo, iconCache, MapSimpleEntity } from "./MapEntity";
import MapGeometryInfo from "./MapGeometryInfo";
import { colorMode } from "./MapIcon";
import { MissionTimer } from "./MissionTimer";
import ScratchPad from "./ScratchPad";


function parseMgrs(coords:[number, number]){
	var val:string = mgrs.forward([coords[1], coords[0]])
	//console.log("test")
	return val.slice(0, 3) + " " + val.slice(3, 5) + " " + val.slice(5, 10) + " " + val.slice(10)
}

export function Map({ dcsMap }: { dcsMap: DCSMap }) {
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const map: MutableRefObject<maptalks.Map | null> = useRef(null);
  const entityInfoPanel: MutableRefObject<maptalks.control.Panel | null> =
    useRef(null);
  const selectedCircle: MutableRefObject<maptalks.Circle | null> = useRef(null);
  const [zoom, setZoom] = useState<number>(8);
  const noZoomLevel: MutableRefObject<maptalks.control.Zoom | null> = useRef(null);

  const [drawBraaStart, setDrawBraaStart] = useState<
    number | [number, number] | null
  >(null);
  const [cursorPos, setCursorPos] = useState<[number, number] | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scratchPadOpen, setScratchPadOpen] = useState(false);

  const [entities, selectedEntity, server] = serverStore((state) => [
    state.entities,
    state.selectedEntityId && state.entities.get(state.selectedEntityId),
	state.server
  ]);


  const bullsEntity = entities.find(
    (it) => {
				if (server?.coalition === "blue") {
					return it.types.includes("Bullseye") && it.coalition === "Enemies"
				} else if (server?.coalition === "red") {
					return it.types.includes("Bullseye") && it.coalition === "Allies"
				} else {
					return it.types.includes("Nada")
				}
	}
  );
  const ships = useMemo(
    () => entities.filter((it) => it.types.includes("Sea")),
    [entities]
  );

  const selectedTrack = trackStore(
    (state) => selectedEntity && state.tracks.get(selectedEntity.id)
  );

  const isSnapPressed = useKeyPress("s");

  const settings = settingsStore();

  useEffect(() => {
    if (!mapContainer.current || map.current !== null) {
      return;
    }

    var braaLine = new maptalks.LineString([], {
      id: "braa-line",
      arrowStyle: null,
      visible: false,
      editable: false,
      cursor: null,
      shadowBlur: 0,
      shadowColor: "black",
      draggable: false,
      dragShadow: false,
      drawOnAxis: null,
      symbol: {
        lineColor: "yellow",
        lineWidth: 2,
      },
    });

    var braaText = new maptalks.Label("", [0, 0], {
      id: "braa-text",
      draggable: false,
      visible: false,
      editable: false,
      boxStyle: {
        padding: [2, 2],
        verticalAlignment: "top",
        horizontalAlignment: "left",
        symbol: {
          markerType: "square",
          markerFill: "rgb(135,196,240)",
          markerFillOpacity: 0.9,
          markerLineColor: "#34495e",
          markerLineWidth: 1,
        },
      },
      textSymbol: {
        textFaceName: FONT_FAMILY,
        textFill: "white",
        textSize: 18,
        textVerticalAlignment: "top",
      },
    });

    selectedCircle.current = new maptalks.Circle([0, 0], 500, {
      visible: false,
      symbol: {
        lineColor: "white",
        lineWidth: 2,
        lineOpacity: 0.75,
      },
    });

    entityInfoPanel.current = new maptalks.control.Panel({
      position: "bottom-left",
      draggable: true,
      custom: false,
      content: renderToString(<div></div>),
    });
	noZoomLevel.current = new maptalks.control.Zoom({
	  'position': 'bottom-right', //  { 'bottom' : '50', 'right' : '20' },
	  'slider': false,
	  'zoomLevel': true
	});
    map.current = new maptalks.Map(mapContainer.current, {
      hitDetect: false,
      panAnimation: false,
      dragRotate: false,
      dragPitch: false,
      touchZoom: true,
      doubleClickZoom: false,
      center: [dcsMap.center[1], dcsMap.center[0]],
      zoom: 8,
	  //maxZoom : 12,
      seamlessZoom: false,
      fpsOnInteracting: 60,
	  zoomControl: false,
      attribution: null,
        spatialReference:{
          projection:'EPSG:3857'
        },
      baseLayer: new maptalks.TileLayer("base", {
        urlTemplate:"https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png",
        subdomains: ["a", "b", "c"],
		attribution: '&copy; <a href="http://osm.org">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>',
        maxCacheSize: 2048,
        hitDetect: false,
		visible : true
      }),
      layers: [
      new maptalks.TileLayer("pretty", {
        urlTemplate:"https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
		//urlTemplate:"https://server.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
		//urlTemplate:"https://tiles.arcgis.com/tiles/P3ePLMYs2RVChkJx/arcgis/rest/services/NatGeoStyleBase/MapServer/tile/{z}/{y}/{x}",
		//attribution: '&copy; <a href="http://osm.org">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>',
		opacity: 0.8,
		maxAvailableZoom  : 12,
        maxCacheSize: 2048,
        hitDetect: false,
		visible : false
      }),
      new maptalks.WMSTileLayer("pretty2", {
        //urlTemplate:"https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
		//urlTemplate:"https://server.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
		urlTemplate:"https://basemaps.arcgis.com/arcgis/rest/services/World_Basemap_v2/VectorTileServer/tile/{z}/{y}/{x}",
		renderer: "canvas",
		layers:"Isolines,Rivers,Water,Railroad,Powerlines,Roads,LBridges,Tunnels,Bridges,Borders,Landmarks,Derricks,Obstacle,MGRS-grid,MGRS-37T,MGRS-38T,Cities,Towns,Airbases,DB,DME,NDB,TACAN,VOR",
		format:"image/png",
		transparent:!0,
		service:"WMS",
		version:"1.1.1",
		styles:"",
		crs:"EPSG:3857",
		visible : false
      }),
	  new maptalks.TileLayer("CaucasusMap", {
		tileSystem: [1, 1, -20037508.34, -20037508.34],
		renderer: "canvas",
        urlTemplate:"http://dcsmaps.com/caucasus/{z}/{x}/{y}.png",
		attribution: '&copy; <a href="http://dcsmaps.com/">DCS map by Flappie</a>',
		opacity: 0.8,
		maxAvailableZoom  : 12,
		visible : true
      }),
	new maptalks.WMSTileLayer("CaucasusBorder", {
		tileSystem: [1, 1, -20037508.34, -20037508.34], 
		renderer: "canvas",
        urlTemplate:"http://dcsmaps.com/cgi-bin/mapserv?map=CAUCASUS_MAPFILE",
		layers:"Isolines,Rivers,Water,Railroad,Powerlines,Roads,LBridges,Tunnels,Bridges,Borders,Landmarks,Derricks,Obstacle,MGRS-grid,MGRS-37T,MGRS-38T,Cities,Towns,Airbases,DB,DME,NDB,TACAN,VOR",
		format:"image/png",
		transparent:!0,
		attribution: '&copy; <a href="http://dcsmaps.com/">DCS map by Flappie</a>',
		service:"WMS",
		version:"1.1.1",
		styles:"",
		crs:"EPSG:3857",
		visible : false
      }),  
 
        new maptalks.VectorLayer("airports", [], {
          hitDetect: false,
        }),
        new maptalks.VectorLayer("farp-name", [], {
          hitDetect: false,
		  visible : false
        }),
        new maptalks.VectorLayer("farp-icon", [], {
          hitDetect: false,
        }),
        new maptalks.VectorLayer("combat-zones", [], {
          opacity: 0.3,
        }),
        new maptalks.VectorLayer("combat-zones-blue", [], {
          opacity: 0.3,
        }),
        new maptalks.VectorLayer("combat-zones-red", [], {
          opacity: 0.3,
        }),
        new maptalks.VectorLayer("custom-geometry", [], {
          hitDetect: false,
        }),	
		new animatemarker.AnimateMarkerLayer("quest", [], {
          forceRenderOnZooming: true,
          forceRenderOnMoving: true,
          forceRenderOnRotating: true,
		  animationDuration: 3000,
		  defaultIconSize: 10000
        }),	
        new maptalks.VectorLayer("ground-units", [], {
          hitDetect: false,
        }),
        new maptalks.VectorLayer("ground-units-blue", [], {
		  hitDetect: false,
		  collision: true,
		}),
        new maptalks.VectorLayer("ground-units-red", [], {
          hitDetect: false,
        }),
		new maptalks.VectorLayer("quest-pin", [], {
          hitDetect: false,
        }),
        new maptalks.VectorLayer("track-trails", [], {
          hitDetect: false,
        }),
        new maptalks.VectorLayer("track-vv", [], {
          hitDetect: false,
          forceRenderOnZooming: true,
          forceRenderOnMoving: true,
          forceRenderOnRotating: true,
        }),
        new maptalks.VectorLayer("track-icons", [], {
          hitDetect: false,
          forceRenderOnZooming: true,
          forceRenderOnMoving: true,
          forceRenderOnRotating: true,
        }),
        new maptalks.VectorLayer("track-name", [], {
          hitDetect: false,
        }),
        new maptalks.VectorLayer("track-alert-radius", [], {
          hitDetect: false,
          forceRenderOnZooming: true,
          forceRenderOnMoving: true,
          forceRenderOnRotating: true,
        }),
        new maptalks.VectorLayer("track-altitude", [], {
          hitDetect: false,
        }),
        new maptalks.VectorLayer("track-speed", [], {
          hitDetect: false,
        }),
        new maptalks.VectorLayer("track-verticalvelo", [], {
          hitDetect: false,
        }),
        new maptalks.VectorLayer(
          "braa",
          [braaLine, braaText, selectedCircle.current],
          {
            hitDetect: false
          }
        ),
      ],
    } as any);


	map.current.addControl(noZoomLevel.current);
    map.current.on("contextmenu", (e) => {});

    map.current.on("zooming", (e) => {
      setZoom(map.current!.getZoom());
    });

    map.current.on("mousemove", (e) => {
      setCursorPos([e.coordinate.y, e.coordinate.x]);
    });

    map.current.on("mouseup", (e) => {
      if (e.domEvent.button === 2) {
        setDrawBraaStart(null);
      }
    });
  }, [mapContainer, map]);

  useEffect(() => {
    if (!map.current) return;
    if (settings.map.trackTrailLength === 0) {
      map.current!.getLayer("track-trails").hide();
    } else {
      map.current!.getLayer("track-trails").show();
    }
    if (settings.map.showTrackIcons === false) {
      map.current!.getLayer("track-icons").hide();
    } else {
      map.current!.getLayer("track-icons").show();
    }
    if (settings.map.showTrackLabels === false) {
      map.current!.getLayer("track-name").hide();
    } else {
      map.current!.getLayer("track-name").show();
    }
  }, [map, settings]);

  // Configure airports
  useEffect(() => {
    if (!map.current) return;
    const layer = map.current.getLayer("airports") as maptalks.VectorLayer;
    const icon = new ms.Symbol("SUG-IBA----", {
      size: 14,
      frame: true,
      fillOpacity: 0.5,
      fill: true,
      colorMode: colorMode,
    }).toDataURL();

    for (const airport of dcsMap.airports) {
      const airportLabel = new maptalks.Label(
        `${airport.name}`,
        [airport.position[1], airport.position[0]],
        {
          draggable: false,
          visible: true,
          editable: false,
          boxStyle: {
            padding: [2, 2],
            horizontalAlignment: "left",
            symbol: {
              markerType: "square",
              markerFill: "black",
              markerFillOpacity: 0,
              markerLineWidth: 0,
              textHorizontalAlignment: "center",
              textDy: -25
            },
          },
          textSymbol: {
            textFaceName: FONT_FAMILY,
            textFill: "white",
            textOpacity: 0.5,
            textSize: 10,
          },
        }
      );
      layer.addGeometry(airportLabel);

      const airportMarker = new maptalks.Marker(
        [airport.position[1], airport.position[0]],
        {
          symbol: {
            markerFile: icon,
			markerDy: 7
          },
        }
      );
      layer.addGeometry(airportMarker);
    }
  }, [map]);

  const mouseDownHandlerRef: MutableRefObject<null | maptalks.EvenableHandlerFun> =
    useRef(null);

  useEffect(() => {
    if (!map.current) return;
    if (mouseDownHandlerRef.current) {
      map.current.removeEventListener("mousedown", mouseDownHandlerRef.current);
    }

    mouseDownHandlerRef.current = (e) => {
      if (!map.current) return;
      const nameLayer = map.current.getLayer("track-name");
      const customGeoLayer = map.current.getLayer("custom-geometry");
      const iconLayer = map.current.getLayer("track-icons");
      const airportsLayer = map.current.getLayer("airports");
      const farpNameLayer = map.current.getLayer("farp-name");
      const farpIconLayer = map.current.getLayer("farp-icon");

      if (e.domEvent.button === 2) {
        if (isSnapPressed) {
          map.current.identify(
            {
              coordinate: e.coordinate,
              layers: [
                nameLayer,
                iconLayer,
                airportsLayer,
                farpNameLayer,
                farpIconLayer,
                customGeoLayer,
              ],
            },
            (geos: Array<maptalks.Geometry>) => {
              if (geos.length >= 1) {
                const rawId = geos[0].getId();
                if (geos[0].options.entityId !== undefined) {
                  setDrawBraaStart(geos[0].options.entityId);
                } else if (typeof rawId === "string") {
                  setDrawBraaStart(parseInt(rawId));
                } else {
                  const coord = geos[0].getCenter();
                  setDrawBraaStart([coord.y, coord.x]);
                }
              }
            }
          );
        } else {
          setDrawBraaStart([e.coordinate.y, e.coordinate.x]);
        }
      }
    };
    map.current.on("mousedown", mouseDownHandlerRef.current);
  }, [map, isSnapPressed]);

  useEffect(() => {
    if (!selectedCircle.current || !map.current) return;

    if (selectedEntity && selectedTrack) {
      const speed = estimatedSpeed(selectedTrack);

      
      selectedCircle.current.setRadius(map.current.getScale(zoom) * 0.5);
	  if (selectedEntity.longitude != selectedCircle.current.getCoordinates().x) {
		selectedCircle.current.show();
		  selectedCircle.current.setCoordinates([
			selectedEntity.longitude,
			selectedEntity.latitude,
		  ]);
	  }
    } else {
      selectedCircle.current.hide();
    }
  }, [
    selectedEntity,
    selectedCircle,
    zoom,
    map,
    selectedEntity,
    selectedTrack,
  ]);

  useEffect(() => {
    if (!map.current) return;
    const braaLayer = map.current.getLayer("braa") as maptalks.VectorLayer;
    const line = braaLayer.getGeometryById("braa-line") as maptalks.LineString;
    const text = braaLayer.getGeometryById("braa-text") as maptalks.Label;

    if (drawBraaStart && cursorPos) {
      let end = cursorPos;

      let start: [number, number];
      let entity;
      if (typeof drawBraaStart === "number") {
        entity = entities.get(drawBraaStart);
        if (!entity) {
          setDrawBraaStart(null);
          return;
        }

        start = [entity.latitude, entity.longitude];
      } else {
        start = drawBraaStart;
      }

      if (typeof start !== "number" && typeof end !== "number") {
        const bearing = getBearingMap(start, end, dcsMap);
        line.setCoordinates([
          [start[1], start[0]],
          [end[1], end[0]],
        ]);

        const scale = map.current!.getScale(map.current!.getZoom());
        text.setCoordinates([end[1], end[0]]).translate(scale / 27000, 0);

        (text.setContent as any)(
          `${bearing.toString().padStart(3, "0")}${getCardinal(
            bearing
          )} / ${Math.round(getFlyDistance(start, end))}`
        );

        text.show();
        line.show();
      }
    } else {
      text.hide();
      line.hide();
    }
  }, [
    drawBraaStart,
    cursorPos,
    typeof drawBraaStart === "number" && entities.get(drawBraaStart),
  ]);

  const currentCursorBulls = useMemo(() => {
    if (!bullsEntity || !cursorPos) return;
    const bearing = getBearingMap(
      [bullsEntity.latitude, bullsEntity.longitude],
      cursorPos,
      dcsMap
    );
    return `${bearing.toString().padStart(3, "0")}${getCardinal(
      bearing
    )} / ${Math.round(
      getFlyDistance(cursorPos, [bullsEntity.latitude, bullsEntity.longitude])
    )} / ${parseMgrs(cursorPos)}`;
  }, [cursorPos, bullsEntity]);

  const farps = useMemo(
    () => {
			const { editor_mode_on } = serverStore.getState();
			if (server?.coalition === "GM" || editor_mode_on) {
				return entities.filter(
					(it) => it.types.includes("Aerodrome")
				)
			} else if (server?.coalition === "blue") {
				return entities.filter(
					(it) => it.types.includes("Aerodrome") && it.coalition === "Enemies"
				)
			} else if (server?.coalition === "red") {
				return entities.filter(
					(it) => it.types.includes("Aerodrome") && it.coalition === "Allies"
				)
			} else {
				return entities.filter(
					(it) => it.types.includes("Nada")
				)
			}
		},
    [entities]
  );
  useEffect(() => {
    if (!map.current) return;
    const farpNameLayer = map.current.getLayer(
      "farp-name"
    ) as maptalks.VectorLayer;
    const farpIconLayer = map.current.getLayer(
      "farp-icon"
    ) as maptalks.VectorLayer;

    for (const farpGeo of farpNameLayer.getGeometries()) {
      if (!farps.has(farpGeo.id as number)) {
        farpGeo.remove();
      }
    }

    for (const farpGeo of farpIconLayer.getGeometries()) {
      if (!farps.has(farpGeo.id as number)) {
        farpGeo.remove();
      }
    }
	


    for (const [_, farp] of farps) {
		var sidc
		if (farp.coalition === "Enemies") {
			sidc = "10032000001213050000"
		} else if (farp.coalition === "Allies") {
			sidc = "10062000001213050000"
		} else {
			sidc = "10012000001213050000"
		}
		const icon = new ms.Symbol(sidc, {
		  size: 20,
		  frame: true,
		  fillOpacity: 0.5,
		  fill: true,
		  colorMode: colorMode,
		}).toDataURL();
	
      let farpNameGeo = farpNameLayer.getGeometryById(
        farp.id
      ) as maptalks.Label;
      if (!farpNameGeo) {
        farpNameGeo = new maptalks.Label(
          `${farp.name}`,
          [farp.longitude, farp.latitude],
          {
            ...({
              entityId: farp.id,
            } as any),
            draggable: false,
            visible: true,
            editable: false,
            boxStyle: {
              padding: [2, 2],
              horizontalAlignment: "left",
              symbol: {
                markerType: "square",
                markerFill: "black",
                markerFillOpacity: 0,
                markerLineWidth: 0,
                textHorizontalAlignment: "center",
                textDy: -25,
              },
            },
            textSymbol: {
              textFaceName: FONT_FAMILY,
              textFill: "white",
              textOpacity: 0.5,
              textSize: 10,
            },
          }
        );
        farpNameLayer.addGeometry(farpNameGeo);
      } else {
        farpNameGeo.setCoordinates([farp.longitude, farp.latitude]);
      }

      let farpIconGeo = farpIconLayer.getGeometryById(
        farp.id
      ) as maptalks.Marker;
      if (!farpIconGeo) {
        farpIconGeo = new maptalks.Marker([farp.longitude, farp.latitude], {
          ...({
            entityId: farp.id,
          } as any),
          symbol: {
            markerFile: icon,
			markerDy: 10
          },
        });
        farpIconLayer.addGeometry(farpIconGeo);
      } else {
        farpNameGeo.setCoordinates([farp.longitude, farp.latitude]);
      }
    }
  }, [farps]);

  useRenderGeometry(map.current);
  useRenderGroundUnit(map.current);
  useRenderCombatZones(map.current);
  var selectedEntityId = selectedEntity ? selectedEntity.id : null
  useRenderRadarTracks(map.current, selectedEntityId);


  return (
    <div
      style={{
        display: "block",
        position: "absolute",
        top: 0,
        bottom: 0,
        width: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "block",
          position: "absolute",
          top: 0,
          bottom: 0,
          width: "100%",
          overflow: "hidden",
        }}
        ref={mapContainer}
      ></div>
      {currentCursorBulls && (
        <div className="absolute right-0 bottom-0 max-w-xl max-h-32 text-yellow-600 text-3xl bg-gray-400 bg-opacity-20 p-1">
          {currentCursorBulls}
        </div>
      )}
      <MissionTimer />
      <div className="m-2 absolute left-0 top-0 flex flex-col gap-2">
        {selectedEntity && map.current && (
          <EntityInfo
            map={map.current}
            dcsMap={dcsMap}
            track={selectedTrack || null}
            entity={selectedEntity}
          />
        )}
        {map.current && <MapGeometryInfo map={map.current} />}
        {scratchPadOpen && (
          <ScratchPad close={() => setScratchPadOpen(false)} />
        )}
      </div>
      {map.current && (
        <Console
          setSettingsOpen={setSettingsOpen}
          setScratchPadOpen={setScratchPadOpen}
          map={map.current}
        />
	  )}
      {map.current && bullsEntity && (
        <MapSimpleEntity
          map={map.current}
          entity={bullsEntity}
          size={32}
          strokeWidth={4}
        />
      )}

    </div>
  );
}
