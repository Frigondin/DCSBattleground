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
import shallow from "zustand/shallow";
import { FONT_FAMILY } from "../Constants";
import { planes } from "../dcs/aircraft";
import { DCSMap } from "../dcs/maps/DCSMap";
import { useKeyPress } from "../hooks/useKeyPress";
import useRenderGeometry from "../hooks/useRenderGeometry";
import useRenderMgrsGrid from "../hooks/useRenderMgrsGrid";
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
	return val.slice(0, 3) + " " + val.slice(3, 5) + " " + val.slice(5, 10) + " " + val.slice(10)
}

function getTrueBearing(
  [startLat, startLong]: [number, number],
  [endLat, endLong]: [number, number]
) {
  const radians = (n: number) => n * (Math.PI / 180);
  const degrees = (n: number) => n * (180 / Math.PI);

  const startLatRad = radians(startLat);
  const startLongRad = radians(startLong);
  const endLatRad = radians(endLat);
  const endLongRad = radians(endLong);

  let dLong = endLongRad - startLongRad;
  const dPhi = Math.log(
    Math.tan(endLatRad / 2.0 + Math.PI / 4.0) /
      Math.tan(startLatRad / 2.0 + Math.PI / 4.0)
  );
  if (Math.abs(dLong) > Math.PI) {
    if (dLong > 0.0) {
      dLong = -(2.0 * Math.PI - dLong);
    } else {
      dLong = 2.0 * Math.PI + dLong;
    }
  }

  return Math.round((degrees(Math.atan2(dLong, dPhi)) + 360.0) % 360.0);
}

function normalizeBearing(bearing: number): number {
  let normalized = Math.round(bearing) % 360;
  if (normalized < 0) normalized += 360;
  return normalized;
}

function getMagneticBearing(trueBearing: number, dcsMap: DCSMap): number {
  return normalizeBearing(trueBearing + dcsMap.magDec);
}

export function Map({ dcsMap }: { dcsMap: DCSMap }) {
  const mapContainer: MutableRefObject<HTMLDivElement | null> = useRef(null);
  const map: MutableRefObject<maptalks.Map | null> = useRef(null);
  const entityInfoPanel: MutableRefObject<maptalks.control.Panel | null> =
    useRef(null);
  const selectedCircle: MutableRefObject<maptalks.Circle | null> = useRef(null);
  const [zoom, setZoom] = useState<number>(8);
  const noZoomLevel: MutableRefObject<maptalks.control.Zoom | null> = useRef(null);
  //const compass: MutableRefObject<maptalks.control.Compass | null> = useRef(null);
  const url = new URL(window.location.href)
  //console.log(url.origin.concat("/maps/{z}/{x}/{y}.png"))

  const [drawBraaStart, setDrawBraaStart] = useState<
    number | [number, number] | null
  >(null);
  const [cursorPos, setCursorPos] = useState<[number, number] | null>(null);
  const cursorRafRef = useRef<number | null>(null);
  const pendingCursorPosRef = useRef<[number, number] | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scratchPadOpen, setScratchPadOpen] = useState(false);

  const [entities, selectedEntity, server] = serverStore(
    (state) => [
      state.entities,
      state.selectedEntityId && state.entities.get(state.selectedEntityId),
      state.server,
    ],
    shallow
  );


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
  const unitSystem = settingsStore((state: any) =>
    state?.unitSystem === "metric" ? "metric" : "imperial"
  );
  const getBrightnessFilter = (value: number | undefined, fallback: number) => {
    const brightness = value ?? fallback;
    return Math.abs(brightness - 1) < 0.001
      ? null
      : `brightness(${brightness})`;
  };

  const formatDistanceByUnitSystem = (distanceNm: number) =>
    unitSystem === "metric"
      ? `${(distanceNm * 1.852).toFixed(1)}km`
      : `${distanceNm.toFixed(1)}nm`;

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
	  //'position': 'bottom-right', 
	  'position':  { 'bottom' : 50, 'right' : 20 },
	  'slider': false,
	  'zoomLevel': true
	});
	
	//compass.current = new maptalks.control.Compass({
//		'position':  { 'bottom' : 50, 'left' : 20 }
//	});
      
    map.current = new maptalks.Map(mapContainer.current, {
      hitDetect: false,
      panAnimation: false,
      dragRotate: false,
      dragPitch: false,
      touchZoom: true,
	  touchRotate: false,
	  touchPitch: false,
	  touchZoomRotate: false,
	  //zoomAnimationDuration:2000,
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
		visible : false
      }),
      layers: [
      new maptalks.TileLayer("pretty", {
        urlTemplate:"https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
		//urlTemplate:"https://maps.dcsolympus.com/maps/alt-syria/{z}/{x}/{y}.png",
		//urlTemplate:"https://server.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
		//urlTemplate:"https://tiles.arcgis.com/tiles/P3ePLMYs2RVChkJx/arcgis/rest/services/NatGeoStyleBase/MapServer/tile/{z}/{y}/{x}",
		//attribution: '&copy; <a href="http://osm.org">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>',
		opacity: 0.8,
		cssFilter: getBrightnessFilter(settings.map?.prettyMapBrightness, 1),
		maxAvailableZoom  : 12,
        maxCacheSize: 2048,
        hitDetect: false,
		visible : true
      }),
      new maptalks.TileLayer("DCSMap", {
        //urlTemplate:"https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
		//urlTemplate:"https://maps.dcsolympus.com/maps/alt-syria/{z}/{x}/{y}.png",
		urlTemplate: url.origin.concat("/maps/{z}/{x}/{y}.png"),
		//urlTemplate:"https://server.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
		//urlTemplate:"https://tiles.arcgis.com/tiles/P3ePLMYs2RVChkJx/arcgis/rest/services/NatGeoStyleBase/MapServer/tile/{z}/{y}/{x}",
		//attribution: '&copy; <a href="http://osm.org">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>',
		opacity: 0.8,
		// Brightness is user-configurable from the Layers tab.
		cssFilter: getBrightnessFilter(settings.map?.dcsMapBrightness, 1.2),
		maxAvailableZoom  : 15,
        maxCacheSize: 2048,
        hitDetect: false,
		visible : true
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
		visible : false
      }),
	new maptalks.WMSTileLayer("CaucasusBorder", {
		tileSystem: [1, 1, -20037508.34, -20037508.34], 
		renderer: "canvas",
        urlTemplate:"http://dcsmaps.com/cgi-bin/mapserv?map=CAUCASUS_MAPFILE",
		layers:"MGRS-grid,MGRS-37T,MGRS-38T,Cities,Towns",
		format:"image/png",
		transparent:!0,
		attribution: '&copy; <a href="http://dcsmaps.com/">DCS map by Flappie</a>',
		service:"WMS",
		version:"1.1.1",
		styles:"",
		crs:"EPSG:3857",
		visible : false
      }),  
 
        new maptalks.VectorLayer("mgrs-grid", [], {
          hitDetect: false,
          visible: true,
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
          hitDetect: true,
        }),
        new maptalks.VectorLayer("recon-cluster", [], {
          hitDetect: false,
          forceRenderOnZooming: true,
          forceRenderOnMoving: true,
          forceRenderOnRotating: true,
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
	//map.current.addControl(compass);

    const updateCursorPos = (nextPos: [number, number]) => {
      pendingCursorPosRef.current = nextPos;
      if (cursorRafRef.current !== null) {
        return;
      }
      cursorRafRef.current = requestAnimationFrame(() => {
        cursorRafRef.current = null;
        if (!pendingCursorPosRef.current) {
          return;
        }
        setCursorPos((prev) => {
          if (
            prev &&
            prev[0] === pendingCursorPosRef.current![0] &&
            prev[1] === pendingCursorPosRef.current![1]
          ) {
            return prev;
          }
          return pendingCursorPosRef.current;
        });
      });
    };

    const onContextMenu = (_e: any) => {};
    const onZooming = (_e: any) => {
      setZoom(map.current!.getZoom());
    };
    const onMouseMove = (e: any) => {
      updateCursorPos([e.coordinate.y, e.coordinate.x]);
    };
    const onTouchMove = (e: any) => {
      updateCursorPos([e.coordinate.y, e.coordinate.x]);
    };
    const onMouseUp = (e: any) => {
      if (e.domEvent.button === 2) {
        setDrawBraaStart(null);
      }
    };

    map.current.on("contextmenu", onContextMenu);
    map.current.on("zooming", onZooming);
    map.current.on("mousemove", onMouseMove);
    map.current.on("touchmove", onTouchMove);
    map.current.on("mouseup", onMouseUp);

    return () => {
      if (cursorRafRef.current !== null) {
        cancelAnimationFrame(cursorRafRef.current);
        cursorRafRef.current = null;
      }
      map.current?.off("contextmenu", onContextMenu);
      map.current?.off("zooming", onZooming);
      map.current?.off("mousemove", onMouseMove);
      map.current?.off("touchmove", onTouchMove);
      map.current?.off("mouseup", onMouseUp);
      map.current?.remove();
      map.current = null;
    };
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
    const dcsMapLayer = map.current!.getLayer("DCSMap") as any;
    if (dcsMapLayer && dcsMapLayer.config) {
      dcsMapLayer.config(
        "cssFilter",
        getBrightnessFilter(settings.map?.dcsMapBrightness, 1.2)
      );
    }
    const prettyLayer = map.current!.getLayer("pretty") as any;
    if (prettyLayer && prettyLayer.config) {
      prettyLayer.config(
        "cssFilter",
        getBrightnessFilter(settings.map?.prettyMapBrightness, 1)
      );
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
        const trueBearing = getTrueBearing(start, end);
        const magneticBearing = getMagneticBearing(trueBearing, dcsMap);
        line.setCoordinates([
          [start[1], start[0]],
          [end[1], end[0]],
        ]);

        const scale = map.current!.getScale(map.current!.getZoom());
        text.setCoordinates([end[1], end[0]]).translate(scale / 27000, 0);

        (text.setContent as any)(
          `${magneticBearing.toString().padStart(3, "0")}°M / ${trueBearing
            .toString()
            .padStart(3, "0")}°T ${getCardinal(
            magneticBearing
          )} / ${formatDistanceByUnitSystem(getFlyDistance(start, end))}`
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
    if (!bullsEntity && !cursorPos) return;
	if (!bullsEntity && cursorPos) {
		return `${parseMgrs(cursorPos)}`;
	};
	if (!bullsEntity || !cursorPos) return;
    const trueBearing = getTrueBearing(
      [bullsEntity.latitude, bullsEntity.longitude],
      cursorPos
    );
    const magneticBearing = getMagneticBearing(trueBearing, dcsMap);
    return `${magneticBearing.toString().padStart(3, "0")}°M / ${trueBearing
      .toString()
      .padStart(3, "0")}°T ${getCardinal(magneticBearing)} / ${formatDistanceByUnitSystem(
      getFlyDistance(cursorPos, [bullsEntity.latitude, bullsEntity.longitude])
    )} / ${parseMgrs(cursorPos)}`;
  }, [cursorPos, bullsEntity, dcsMap, unitSystem]);

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
  useRenderMgrsGrid(map.current);
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
      <div className="absolute right-0 bottom-0 flex items-end gap-1 p-1">
        {currentCursorBulls && (
          <div className="max-h-32 whitespace-nowrap text-yellow-600 text-2xl bg-gray-700 px-1">
            {currentCursorBulls}
          </div>
        )}
        <button
          type="button"
          className="h-9 min-w-[3.25rem] border border-gray-500 bg-gray-200 px-2 text-sm font-semibold text-gray-800 rounded-sm shadow"
          onClick={() => {
            settingsStore.setState((state: any) => ({
              ...state,
              unitSystem: state?.unitSystem === "metric" ? "imperial" : "metric",
            }));
          }}
          title="Toggle Imperial/Metric units"
        >
          {unitSystem === "metric" ? "MET" : "IMP"}
        </button>
      </div>
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
        {scratchPadOpen && map.current && (
          <ScratchPad close={() => setScratchPadOpen(false)} map={map.current} />
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
