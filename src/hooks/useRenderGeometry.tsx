import Immutable from "immutable";
import * as maptalks from "maptalks";
import * as animatemarker from "maptalks.animatemarker";
import ms from "milsymbol";
import { useEffect } from "react";
import { iconCache } from "../components/MapEntity";
import * as mgrs from "mgrs";
import { getFlyDistance } from "../util";
import { settingsStore, UnitSystem } from "../stores/SettingsStore";
import {
  Geometry,
  geometryStore,
  MarkPoint,
  getSelectedGeometry,
  setSelectedGeometry,
  updateGeometrySafe,
  updateGeometryStore,
  deleteGeometry,
  Zone,
  Waypoints,
  Circle,
  Line,
  Border,
  Recon,
  Quest
} from "../stores/GeometryStore";
import { setSelectedEntityId, serverStore } from "../stores/ServerStore";


const markPointSIDC = "GHG-GPRN--";
const reconSIDC = "GHGPGPPO----";
const MARKER_CLUSTER_ZOOM_THRESHOLD = 10;
const MARKER_CLUSTER_PIXEL_RADIUS = 48;
const clusterIconCache: Record<string, string> = {};

type ClusterableGeometry = MarkPoint | Recon | Quest;

type MarkerCluster = {
	center: maptalks.Point;
	items: ClusterableGeometry[];
	type: ClusterableGeometry["type"];
};

const MAP_MAG_DEC: Record<string, number> = {
	Caucasus: -6,
	Sinai: 5,
	SinaiMap: 5,
	Syria: 5,
	PersianGulf: 2,
	Marianas: 0,
	Falklands: 6,
	Normandy: 1,
	Nevada: 11,
	Kola: 13,
	Afghanistan: 3,
	GermanyCW: 1,
	TheChannel: 1,
};

function normalizeBearing(bearing: number): number {
	let normalized = Math.round(bearing) % 360;
	if (normalized < 0) normalized += 360;
	return normalized;
}

function getWaypointMagneticBearing(trueBearing: number): number {
	const mapName = serverStore.getState().server?.map ?? "";
	const magDec = MAP_MAG_DEC[mapName] ?? 0;
	return normalizeBearing(trueBearing - magDec);
}

function getWaypointPointName(waypoints: Waypoints, index: number): string {
	return waypoints.pointNames?.[index] || `WPT#${index}`;
}

function areWaypointPointsClose(a: [number, number], b: [number, number]): boolean {
	const epsilon = 0.00001;
	return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

function alignWaypointNames(
	oldPoints: [number, number][],
	oldNames: string[],
	newPoints: [number, number][]
): string[] {
	const aligned = newPoints.map((_, index) => `WPT#${index}`);
	let i = 0; // old index
	let j = 0; // new index

	while (i < oldPoints.length && j < newPoints.length) {
		if (areWaypointPointsClose(oldPoints[i], newPoints[j])) {
			aligned[j] = oldNames[i] || `WPT#${j}`;
			i += 1;
			j += 1;
			continue;
		}

		// Insertion in the new path at index j.
		if (j + 1 < newPoints.length && areWaypointPointsClose(oldPoints[i], newPoints[j + 1])) {
			j += 1;
			continue;
		}

		// Deletion from old path at index i.
		if (i + 1 < oldPoints.length && areWaypointPointsClose(oldPoints[i + 1], newPoints[j])) {
			i += 1;
			continue;
		}

		// Fallback for moved/edited node: keep same relative slot name.
		aligned[j] = oldNames[i] || `WPT#${j}`;
		i += 1;
		j += 1;
	}

	return aligned;
}

function waypointPointsEqual(a: [number, number][], b: [number, number][]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (!areWaypointPointsClose(a[i], b[i])) return false;
	}
	return true;
}

function waypointNamesEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function getWaypointBearing(
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

function formatWaypointDistance(distanceNm: number, unitSystem: UnitSystem): string {
	return unitSystem === UnitSystem.IMPERIAL
		? `${distanceNm.toFixed(1)}nm`
		: `${(distanceNm * 1.852).toFixed(1)}km`;
}

function getReadableSegmentTextRotation(
	from: [number, number],
	to: [number, number]
): number {
	// Use lon/lat vector as a stable approximation for on-map segment angle.
	const dx = to[1] - from[1];
	const dy = to[0] - from[0];
	let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
	// Keep text readable left-to-right: flip upside-down orientations.
	if (angle > 90 || angle < -90) {
		angle += 180;
	}
	// Normalize to [-180, 180]
	if (angle > 180) angle -= 360;
	if (angle < -180) angle += 360;
	return angle;
}

function appendWaypointSegmentLabels(
	labelList: Array<maptalks.Geometry>,
	waypoints: Waypoints,
	unitSystem: UnitSystem
) {
	if (waypoints.points.length < 2) return;
	for (let i = 1; i < waypoints.points.length; i++) {
		const from = waypoints.points[i - 1];
		const to = waypoints.points[i];
		const midLat = (from[0] + to[0]) / 2;
		const midLon = (from[1] + to[1]) / 2;
		const trueBearing = getWaypointBearing(from, to);
		const magneticBearing = getWaypointMagneticBearing(trueBearing);
		const distanceNm = getFlyDistance(from, to);
		const segmentText = `${magneticBearing.toString().padStart(3, "0")}°M / ${trueBearing
			.toString()
			.padStart(3, "0")}°T / ${formatWaypointDistance(
			distanceNm,
			unitSystem
		)}`;
		const textRotation = getReadableSegmentTextRotation(from, to);
		const segmentLabel = new maptalks.Label(segmentText, [midLon, midLat], {
			draggable: false,
			visible: true,
			editable: false,
			boxStyle: {
				padding: [2, 3],
				horizontalAlignment: "center",
				verticalAlignment: "middle",
				symbol: {
					markerType: "square",
					markerFill: "#111827",
					markerFillOpacity: 0.65,
					markerLineOpacity: 0,
					markerRotation: textRotation,
				},
			},
			textSymbol: {
				textFaceName: '"microsoft yahei"',
				textFill: "#FBBF24",
				textSize: 11,
				textRotation,
			},
		});
		labelList.push(segmentLabel);
	}
}

function isClusterableGeometry(geo: Geometry): geo is ClusterableGeometry {
	return geo.type === "markpoint" || geo.type === "recon" || geo.type === "quest";
}

function buildMarkerClusters(
	map: maptalks.Map,
	items: ClusterableGeometry[],
	pixelRadius: number
): MarkerCluster[] {
	const clusters: MarkerCluster[] = [];

	for (const item of items) {
		const coord = new maptalks.Coordinate(
			item.position[1],
			item.position[0]
		);
		const pt = map.coordinateToContainerPoint(coord);

		let target: MarkerCluster | null = null;
		for (const cluster of clusters) {
			if (cluster.type !== item.type) {
				continue;
			}
			const dx = cluster.center.x - pt.x;
			const dy = cluster.center.y - pt.y;
			if (dx * dx + dy * dy <= pixelRadius * pixelRadius) {
				target = cluster;
				break;
			}
		}

		if (!target) {
			clusters.push({
				center: pt,
				items: [item],
				type: item.type,
			});
		} else {
			const n = target.items.length;
			target.center = new maptalks.Point(
				(target.center.x * n + pt.x) / (n + 1),
				(target.center.y * n + pt.y) / (n + 1)
			);
			target.items.push(item);
		}
	}

	return clusters;
}

function getClusterDropIcon(color: string, count: number): string {
	const key = `${color}-${count}`;
	if (clusterIconCache[key]) {
		return clusterIconCache[key];
	}

	const safeCount = count > 99 ? "99+" : `${count}`;
	const fontSize = safeCount.length >= 3 ? 14 : 16;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="56" viewBox="0 0 44 56">
  <path d="M22 2C10.4 2 1 11.4 1 23c0 14.9 17.5 29.8 20.3 32.1.4.3 1 .3 1.4 0C25.5 52.8 43 37.9 43 23 43 11.4 33.6 2 22 2z" fill="${color}" stroke="#111827" stroke-width="2"/>
  <text x="22" y="28" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff">${safeCount}</text>
</svg>`;
	const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
	clusterIconCache[key] = url;
	return url;
}

function updateMarkerClusters(
	map: maptalks.Map,
	geometry: Immutable.Map<number, Geometry>,
	localHiddenGeometryIds: Immutable.Set<number>,
	zoom: number,
	editorModeOn: boolean
): Set<number> {
	const clusteredIds = new Set<number>();
	const clusterLayer = map.getLayer("recon-cluster") as
		| maptalks.VectorLayer
		| undefined;
	const missionPulseLayer = map.getLayer("quest") as
		| maptalks.VectorLayer
		| undefined;
	if (!clusterLayer) {
		return clusteredIds;
	}

	for (const geo of clusterLayer.getGeometries()) {
		geo.remove();
	}
	if (missionPulseLayer) {
		for (const geo of missionPulseLayer.getGeometries()) {
			const id = geo.getId();
			if (typeof id === "string" && id.startsWith("mission-cluster-")) {
				geo.remove();
			}
		}
	}

	if (zoom > MARKER_CLUSTER_ZOOM_THRESHOLD) {
		return clusteredIds;
	}

	const markers: ClusterableGeometry[] = [];
	for (const geo of geometry.valueSeq()) {
		if (
			geo.status !== "Deleted" &&
			(editorModeOn || !geo.hidden) &&
			!localHiddenGeometryIds.has(geo.id) &&
			isClusterableGeometry(geo)
		) {
			markers.push(geo);
		}
	}

	if (markers.length === 0) {
		return clusteredIds;
	}

	const clusters = buildMarkerClusters(map, markers, MARKER_CLUSTER_PIXEL_RADIUS);
	for (const cluster of clusters) {
		if (cluster.items.length <= 1) {
			continue;
		}

		for (const item of cluster.items) {
			clusteredIds.add(item.id);
		}

		const coord = map.containerPointToCoordinate(cluster.center);
		const lng = coord.x;
		const lat = coord.y;
		const primary = cluster.items[0];
		const count = cluster.items.length;

		const icon = new maptalks.Marker([lng, lat], {
			draggable: false,
			visible: true,
			editable: false,
			symbol: {
				markerFile: getClusterDropIcon(primary.color, count),
				markerWidth: 30,
				markerHeight: 38,
				markerDy: 10
			},
		});

		const col = new maptalks.GeometryCollection([icon], {
			id: `marker-cluster-${primary.id}`,
			draggable: false,
		});

		col.on("click", () => {
			const targetZoom = zoom + 2;
			map.animateTo(
				{
					center: [lng, lat],
					zoom: targetZoom,
				},
				{
					duration: 450,
					easing: "out",
				}
			);
		});

		clusterLayer.addGeometry(col);

		if (cluster.type === "quest" && missionPulseLayer) {
			const pulse = new maptalks.Marker([lng, lat], {
				id: `mission-cluster-${primary.id}-pulse`,
				symbol: {
					markerType: "ellipse",
					markerFill: primary.color,
					markerFillOpacity: 0.8,
					markerLineWidth: 0,
					markerWidth: 75,
					markerHeight: 75
				}
			});
			missionPulseLayer.addGeometry(pulse);
		}
	}

	return clusteredIds;
}


function endEditSelectedGeometry(layer: maptalks.VectorLayer, geo: Geometry) {
	const selectedGeometry = getSelectedGeometry()
	const map = layer.getMap();
    if (selectedGeometry && selectedGeometry.id !== geo.id) {
		const layer = map.getLayer("custom-geometry") as maptalks.VectorLayer;
		const layerQuest = map.getLayer("quest-pin") as maptalks.VectorLayer;
		var item = layer.getGeometryById(
			selectedGeometry.id
		) as maptalks.GeometryCollection | null;
		if (!item) {
			item = layerQuest.getGeometryById(
				selectedGeometry.id
			) as maptalks.GeometryCollection | null;
		}
		if (!item) return;
		
		if (item.isEditing() && (selectedGeometry.type === "zone" ||
			selectedGeometry.type === "waypoints" ||
			selectedGeometry.type === "line" ||
			selectedGeometry.type === "circle" )) {
			item.endEdit();
		} else if (selectedGeometry.type !== "quest"){
			item.config("draggable", false);
		}
	}
}





function renderWaypoints(layer: maptalks.VectorLayer, waypoints: Waypoints) {
	const unitSystem = settingsStore.getState().unitSystem || UnitSystem.IMPERIAL;
	const isSelected = geometryStore.getState().selectedGeometry === waypoints.id;
	const collection = layer.getGeometryById(
		waypoints.id
	) as maptalks.GeometryCollection;
	if (collection) {
		const [lineString, text] = collection.getGeometries() as [
		  maptalks.LineString,
		  maptalks.Label
		];
		if (lineString.isEditing()) return;
		const labelListTmp = collection.getGeometries()
		var counter = -1;
		
		labelListTmp.forEach((geo) => {
			counter = counter + 1
			if (counter === 0) {
				const geo2 = geo as maptalks.LineString
				geo2.setCoordinates(waypoints.points.map((it) => [it[1], it[0]]));
				(geo2.setSymbol as any)({
					lineColor: waypoints.color,
					lineWidth: 3
				});
				geo2.remove();
			} else if (counter === 1){
				const geo2 = geo as maptalks.Label
				geo2.setCoordinates([waypoints.points[0][1], waypoints.points[0][0]]);
				(geo2.setContent as any)(waypoints.name || `Waypoints #${waypoints.id}`);
				geo2.remove()
			} else {
				const geo2 = geo as maptalks.Label
				geo2.remove()
			};
		});
		let labelList1 = [labelListTmp[0], labelListTmp[1]];
		var counter = -1;
		if (isSelected) {
			waypoints.points.forEach((point) => {
				counter = counter + 1;
				if (counter > 0) {
					const textWpt = new maptalks.Label(
						getWaypointPointName(waypoints, counter),
						[point[1], point[0]],
						{
							draggable: false,
							visible: true,
							editable: false,
							boxStyle: {
								padding: [2, 2],
								horizontalAlignment: "left",
								verticalAlignment: "middle",
								symbol: {
									markerType: "square",
									markerFill: "#4B5563",
									markerFillOpacity: 0.5,
									markerLineOpacity: 0,
									textHorizontalAlignment: "right",
									textVerticalAlignment: "middle",
									textDx: 10,
								},
							},
							textSymbol: {
								textFaceName: '"microsoft yahei"',
								textFill: "#FBBF24",
								textSize: 12,
							},
						}
					);
					labelList1.push(textWpt);
				}
			});
		}
		if (isSelected) {
			appendWaypointSegmentLabels(labelList1, waypoints, unitSystem);
		}
		collection.setGeometries(labelList1);
    return;
  }

  var color = '#FBBF24'
  if (waypoints.coalition == "blue") {
	color = '#0068FF'
  } else if (waypoints.coalition == "red") {
	color = '#FF0032'
  }
  const lineString = new maptalks.LineString(
    waypoints.points.map((it) => [it[1], it[0]]),
    {
        arrowStyle : 'classic', // arrow-style : now we only have classic
        arrowPlacement : 'vertex-last', // arrow's placement: vertex-first, vertex-last, vertex-firstlast, point
        visible : true,
        editable : true,
        cursor : null,
        draggable : false,
        dragShadow : false, // display a shadow during dragging
        drawOnAxis : null,  // force dragging stick on a axis, can be: x, y
        symbol: {
          'lineColor' : waypoints.color, //color,
          'lineWidth' : 3
        }
	}
  );

  const text = new maptalks.Label(
    waypoints.name || `Waypoints #${waypoints.id}`,
    [waypoints.points[0][1], waypoints.points[0][0]],
    {
      draggable: false,
      visible: true,
      editable: false,
      boxStyle: {
        padding: [2, 2],
        horizontalAlignment: "left",
        verticalAlignment: "middle",
        symbol: {
          markerType: "square",
          markerFill: "#4B5563",
          markerFillOpacity: 0.5,
          markerLineOpacity: 0,
          textHorizontalAlignment: "right",
          textVerticalAlignment: "middle",
          textDx: 10,
        },
      },
      textSymbol: {
        textFaceName: '"microsoft yahei"',
        textFill: "#FBBF24",
        textSize: 12,
      },
    }
  );

  let labelList = [lineString, text];
  var counter = -1;
  if (isSelected) {
	waypoints.points.forEach((point) => {
		counter = counter + 1;
		if (counter > 0) {
			const textWpt = new maptalks.Label(
				getWaypointPointName(waypoints, counter),
				[point[1], point[0]],
				{
					draggable: false,
					visible: true,
					editable: false,
					boxStyle: {
						padding: [2, 2],
						horizontalAlignment: "left",
						verticalAlignment: "middle",
						symbol: {
							markerType: "square",
							markerFill: "#4B5563",
							markerFillOpacity: 0.5,
							markerLineOpacity: 0,
							textHorizontalAlignment: "right",
							textVerticalAlignment: "middle",
							textDx: 10,
						},
					},
					textSymbol: {
						textFaceName: '"microsoft yahei"',
						textFill: "#FBBF24",
						textSize: 12,
					},
				}
			);
			labelList.push(textWpt);
		}
	});
  }
  if (isSelected) {
	appendWaypointSegmentLabels(labelList, waypoints, unitSystem);
  }
  
  const col = new maptalks.GeometryCollection(labelList, {
    id: waypoints.id,
    draggable: false,
  });
  col.on("click", (e) => {
    const { editor_mode_on } = serverStore.getState();
	const clickable = geometryStore!.getState()!.geometry!.get(waypoints.id)!.clickable
	
	if (clickable || editor_mode_on){
		endEditSelectedGeometry(layer, waypoints)
		setSelectedGeometry(waypoints.id);
		setSelectedEntityId(null);
	}
  });
  const syncWaypointsFromEditor = () => {
	if (!lineString.isEditing()) {
		return;
	}
	let coords = lineString.getCoordinates() as Array<{x:number,y:number}>;
	const nextPoints = coords.map((it) => [it.y, it.x] as [number, number]);
	const currentWaypoints = geometryStore.getState().geometry.get(waypoints.id) as Waypoints | undefined;
	const prevPoints = currentWaypoints?.points || [];
	const prevNames = currentWaypoints?.pointNames || [];
	const nextPointNames = alignWaypointNames(prevPoints, prevNames, nextPoints);
	if (
		waypointPointsEqual(prevPoints as [number, number][], nextPoints) &&
		waypointNamesEqual(prevNames, nextPointNames)
	) {
		return;
	}
	updateGeometrySafe(waypoints.id, {
      points: nextPoints,
      pointNames: nextPointNames,
    });
  };

  // Keep store synced during edition so newly inserted middle points
  // are immediately available in the left panel for renaming.
  col.on("shapechange", syncWaypointsFromEditor);
  col.on("editend", () => {
	syncWaypointsFromEditor();
	// Ensure label refresh runs after Maptalks leaves editing state.
	requestAnimationFrame(() => {
		updateGeometryStore({ testUpdateStore: Math.random() });
	});
  });  

  layer.addGeometry(col);
}



function renderLine(layer: maptalks.VectorLayer, line: Line | Border) {
	const collection = layer.getGeometryById(
		line.id
	) as maptalks.GeometryCollection;
	if (collection) {
		const [lineString, text] = collection.getGeometries() as [
		  maptalks.LineString,
		  maptalks.Label
		];
		if (lineString.isEditing()) return;
		const labelListTmp = collection.getGeometries()
		var counter = -1;
		
		labelListTmp.forEach((geo) => {
			counter = counter + 1
			if (counter === 0) {
				const geo2 = geo as maptalks.LineString
				geo2.setCoordinates(line.points.map((it) => [it[1], it[0]]));
				(geo2.setSymbol as any)({
					lineColor: line.color,
					lineWidth: 2
				});
				geo2.remove();
			} else if (counter === 1){
				const geo2 = geo as maptalks.Label
				geo2.setCoordinates([line.points[0][1], line.points[0][0]]);
				(geo2.setContent as any)(line.name || `Line #${line.id}`);
				geo2.remove()
			};
		});
		let labelList1 = [labelListTmp[0], labelListTmp[1]];
		collection.setGeometries(labelList1);
    return;
  }

  var color = '#FBBF24'
  if (line.coalition == "blue") {
	color = '#0068FF'
  } else if (line.coalition == "red") {
	color = '#FF0032'
  }
  if (line.type === "border"){
	color = '#FBBF24'
  }
  const lineString = new maptalks.LineString(
    line.points.map((it) => [it[1], it[0]]),
    {
        visible : true,
        editable : true,
        cursor : null,
        draggable : false,
        dragShadow : false, // display a shadow during dragging
        drawOnAxis : null,  // force dragging stick on a axis, can be: x, y
        symbol: {
          'lineColor' : line.color, //color,
          'lineWidth' : 2
        }
	}
  );

  const text = new maptalks.Label(
    line.name || `Line #${line.id}`,
    [line.points[0][1], line.points[0][0]],
    {
      draggable: false,
      visible: true,
      editable: false,
      boxStyle: {
        padding: [2, 2],
        horizontalAlignment: "left",
        verticalAlignment: "middle",
        symbol: {
          markerType: "square",
          markerFill: "#4B5563",
          markerFillOpacity: 0.5,
          markerLineOpacity: 0,
          textHorizontalAlignment: "right",
          textVerticalAlignment: "middle",
          textDx: 10,
        },
      },
      textSymbol: {
        textFaceName: '"microsoft yahei"',
        textFill: "#FBBF24",
        textSize: 12,
      },
    }
  );

  let labelList = [lineString, text];
  var counter = -1;
  
  const col = new maptalks.GeometryCollection(labelList, {
    id: line.id,
    draggable: false,
  });
  col.on("click", (e) => {
    const { editor_mode_on } = serverStore.getState();
	const clickable = geometryStore!.getState()!.geometry!.get(line.id)!.clickable
	
	if (clickable || editor_mode_on){
		endEditSelectedGeometry(layer, line)
		setSelectedGeometry(line.id);
		setSelectedEntityId(null);
	}
  });
  col.on("editend", (e) => {
	let coords = lineString.getCoordinates() as Array<{x:number,y:number}>;
	updateGeometrySafe(line.id, {
      points: coords.map((it) => [it.y, it.x]),
    });
  });  

  layer.addGeometry(col);
}




function renderZone(layer: maptalks.VectorLayer, zone: Zone) {
  const editor_mode_on1 = serverStore.getState().editor_mode_on;
  const clickable1 = geometryStore!.getState()!.geometry!.get(zone.id)!.clickable
  var interactive
  if (clickable1 || editor_mode_on1) {
	interactive = true
  } else {
	interactive = false
  }
  
  const collection = layer.getGeometryById(
    zone.id
  ) as maptalks.GeometryCollection;
  if (collection) {
    const [polygon, text] = collection.getGeometries() as [
      maptalks.Polygon,
      maptalks.Label
    ];
	if (polygon.isEditing()) return;
    polygon.setCoordinates(zone.points.map((it) => [it[1], it[0]]));
	(polygon.setSymbol as any)({
		lineColor: zone.color,
		lineWidth: 2,
		polygonFill: zone.color,
		polygonOpacity: 0.1
	});
    text.setCoordinates([zone.points[0][1], zone.points[0][0]]);
    (text.setContent as any)(zone.name || `Zone #${zone.id}`);
	collection.setOptions({interactive});
    return;
  }

  var color = '#FBBF24'
  if (zone.coalition == "blue") {
	color = '#0068FF'
  } else if (zone.coalition == "red") {
	color = '#FF0032'
  }
  const polygon = new maptalks.Polygon(
    zone.points.map((it) => [it[1], it[0]]),
    {
      draggable: false,
      visible: true,
      editable: true,
      symbol: {
        lineColor: zone.color, //color,
        lineWidth: 2,
        polygonFill: zone.color, //color,
        polygonOpacity: 0.1,
      },
    }
  );

  const text = new maptalks.Label(
    zone.name || `Zone #${zone.id}`,
    [zone.points[0][1], zone.points[0][0]],
    {
      draggable: false,
      visible: true,
      editable: false,
      boxStyle: {
        padding: [2, 2],
        horizontalAlignment: "left",
        verticalAlignment: "middle",
        symbol: {
          markerType: "square",
          markerFill: "#4B5563",
          markerFillOpacity: 0.5,
          markerLineOpacity: 0,
          textHorizontalAlignment: "right",
          textVerticalAlignment: "middle",
          textDx: 10,
        },
      },
      textSymbol: {
        textFaceName: '"microsoft yahei"',
        textFill: "#FBBF24",
        textSize: 12,
      },
    }
  );

  
  const col = new maptalks.GeometryCollection([polygon, text], {
    id: zone.id,
    draggable: false,
  });
  
  col.setOptions({interactive});
  col.on("click", (e) => {
    const { editor_mode_on } = serverStore.getState();
	const clickable = geometryStore!.getState()!.geometry!.get(zone.id)!.clickable
	
	if (clickable || editor_mode_on){
		endEditSelectedGeometry(layer, zone)
		setSelectedGeometry(zone.id);
		setSelectedEntityId(null);
	}
  });
  col.on("editend", (e) => {
    const coords = polygon.getCoordinates()[0];
    updateGeometrySafe(zone.id, {
      points: coords.map((it) => [it.y, it.x]),
    });
  });

  layer.addGeometry(col);
}



function renderCircle(layer: maptalks.VectorLayer, circle: Circle) {
  const editor_mode_on1 = serverStore.getState().editor_mode_on;
  const clickable1 = geometryStore!.getState()!.geometry!.get(circle.id)!.clickable
  var interactive
  if (clickable1 || editor_mode_on1) {
	interactive = true
  } else {
	interactive = false
  }
  const collection = layer.getGeometryById(
    circle.id
  ) as maptalks.GeometryCollection;
  if (collection) {
    const [circleMap, text] = collection.getGeometries() as [
      maptalks.Circle,
      maptalks.Label
    ];
	if (circleMap.isEditing()) return;

    circleMap.setCoordinates([circle.center[1], circle.center[0]]);
	circleMap.setRadius(circle.radius);
	(circleMap.setSymbol as any)({
		lineColor: circle.color,
		lineWidth: 2,
		polygonFill: circle.color,
		polygonOpacity: 0.1
	});
    text.setCoordinates([circle.center[1], circle.center[0]]);
    (text.setContent as any)(circle.name || `Circle #${circle.id}`);
	collection.setOptions({interactive});

    return;
  }

  var color = '#FBBF24'
  if (circle.coalition == "blue") {
	color = '#0068FF'
  } else if (circle.coalition == "red") {
	color = '#FF0032'
  }
  const circleMap = new maptalks.Circle(
    [circle.center[1], circle.center[0]],
	circle.radius,
    {
      draggable: false,
      visible: true,
      editable: true,
      symbol: {
		'lineColor': circle.color, //color,
		'lineWidth': 2,
		'polygonFill': circle.color, //color,
		'polygonOpacity': 0.1
      },
    }
  );

  const text = new maptalks.Label(
    circle.name || `Circle #${circle.id}`,
    [circle.center[1], circle.center[0]],
    {
      draggable: false,
      visible: true,
      editable: false,
      boxStyle: {
        padding: [2, 2],
        horizontalAlignment: "left",
        verticalAlignment: "middle",
        symbol: {
          markerType: "square",
          markerFill: "#4B5563",
          markerFillOpacity: 0.5,
          markerLineOpacity: 0,
          textHorizontalAlignment: "right",
          textVerticalAlignment: "middle",
          textDx: 10,
        },
      },
      textSymbol: {
        textFaceName: '"microsoft yahei"',
        textFill: "#FBBF24",
        textSize: 12,
      },
    }
  );

  
  const col = new maptalks.GeometryCollection([circleMap, text], {
    id: circle.id,
    draggable: false,
  });
  
  col.setOptions({interactive});
  col.on("click", (e) => {
    const { editor_mode_on } = serverStore.getState();
	const clickable = geometryStore!.getState()!.geometry!.get(circle.id)!.clickable
	
	if (clickable || editor_mode_on){
		endEditSelectedGeometry(layer, circle)
		setSelectedGeometry(circle.id);
		setSelectedEntityId(null);
	}
  });
  

  col.on("editend", (e) => {
    const pos = circleMap.getCoordinates();
    updateGeometrySafe(circle.id, {
      center: [pos.y, pos.x],
	  radius: circleMap.getRadius()
    });
  });
  
  layer.addGeometry(col);
}




function renderMarkPoint(layer: maptalks.VectorLayer, markPoint: MarkPoint) {
  const collection = layer.getGeometryById(
    markPoint.id
  ) as maptalks.GeometryCollection;
  if (collection) {
    const [icon, text] = collection.getGeometries() as [
      maptalks.Marker,
      maptalks.Label
    ];

    (icon.setSymbol as any)({
      markerFile: new ms.Symbol(markPointSIDC, {
					  size: 14,
					  frame: false,
					  fill: true,
					  strokeWidth: 8,
					  monoColor: markPoint.color,
					}).toDataURL(),
	  monocolor: markPoint.color,
      markerDy: 7
    });
    icon.setCoordinates([markPoint.position[1], markPoint.position[0]]);
    text.setCoordinates([markPoint.position[1], markPoint.position[0]]);
    (text.setContent as any)(markPoint.name || `Mark #${markPoint.id}`);

    return;
  }

  var color = '#FBBF24'
  if (markPoint.coalition == "blue") {
	color = '#0068FF'
  } else if (markPoint.coalition == "red") {
	color = '#FF0032'
  }
  const icon = new maptalks.Marker(
    [markPoint.position[1], markPoint.position[0]],
    {
      draggable: false,
      visible: true,
      editable: false,
      symbol: {
        markerFile: new ms.Symbol(markPointSIDC, {
						  size: 14,
						  frame: false,
						  fill: true,
						  strokeWidth: 8,
						  monoColor: markPoint.color, //color,
						}).toDataURL(),
		monocolor: markPoint.color, //color,
        markerDy: 7
      },
    }
  );

  const text = new maptalks.Label(
    markPoint.name || `Mark #${markPoint.id}`,
    [markPoint.position[1], markPoint.position[0]],
    {
      draggable: false,
      visible: true,
      editable: false,
      boxStyle: {
        padding: [2, 2],
        horizontalAlignment: "left",
        verticalAlignment: "middle",
        symbol: {
          markerType: "square",
          markerFill: "#4B5563",
          markerFillOpacity: 0.5,
          markerLineOpacity: 0,
          textHorizontalAlignment: "right",
          textVerticalAlignment: "middle",
          textDx: 20,
        },
      },
      textSymbol: {
        textFaceName: '"microsoft yahei"',
        textFill: "#FBBF24",
        textSize: 12,
      },
    }
  );

  const col = new maptalks.GeometryCollection([icon, text], {
    id: markPoint.id,
    draggable: false,
  });
  col.on("click", (e) => {
    const { editor_mode_on } = serverStore.getState();
	const clickable = geometryStore!.getState()!.geometry!.get(markPoint.id)!.clickable
	
	if (clickable || editor_mode_on){
		endEditSelectedGeometry(layer, markPoint)
		setSelectedGeometry(markPoint.id);
		setSelectedEntityId(null);
	}
  });
  col.on("dragend", (e) => {
    const pos = col.getFirstCoordinate();
    updateGeometrySafe(markPoint.id, {
      position: [pos.y, pos.x],
    });
  });

  layer.addGeometry(col);
}

function renderRecon(layer: maptalks.VectorLayer, recon: Recon) {
  const collection = layer.getGeometryById(
    recon.id
  ) as maptalks.GeometryCollection;
  if (collection) {
    const [icon, text] = collection.getGeometries() as [
      maptalks.Marker,
      maptalks.Label
    ];

	(icon.setSymbol as any)({
		markerFile: new ms.Symbol(reconSIDC, {
					  size: 20,
					  frame: false,
					  fill: true,
					  strokeWidth: 11,
					  monoColor: recon.color,
					}).toDataURL(),
        markerDy: 10
	});
	icon.setCoordinates([recon.position[1], recon.position[0]]);
	text.setCoordinates([recon.position[1], recon.position[0]]);
	(text.setContent as any)(recon.name || `Recon #${recon.id}`);
    return;
  }

  var color = '#FBBF24'
  if (recon.coalition == "blue") {
	color = '#0068FF'
  } else if (recon.coalition == "red") {
	color = '#FF0032'
  }
  const icon = new maptalks.Marker(
	[recon.position[1], recon.position[0]],
	{
	  draggable: false,
	  visible: true,
	  editable: false,
	  symbol: {
		markerFile: new ms.Symbol(reconSIDC, {
					  size: 20,
					  frame: false,
					  fill: true,
					  strokeWidth: 11,
					  monoColor: recon.color, //color,
					}).toDataURL(),
        markerDy: 10
	  },
	}
  );

  const text = new maptalks.Label(
	recon.name || `Recon #${recon.id}`,
	[recon.position[1], recon.position[0]],
	{
	  draggable: false,
	  visible: true,
	  editable: false,
	  boxStyle: {
		padding: [2, 2],
		horizontalAlignment: "left",
		verticalAlignment: "middle",
		symbol: {
		  markerType: "square",
		  markerFill: "#4B5563",
		  markerFillOpacity: 0.5,
		  markerLineOpacity: 0,
		  textHorizontalAlignment: "right",
		  textVerticalAlignment: "middle",
		  textDx: 20,
		},
	  },
	  textSymbol: {
		textFaceName: '"microsoft yahei"',
		textFill: "#FBBF24",
		textSize: 12,
	  },
	}
  );

  const col = new maptalks.GeometryCollection([icon, text], {
	id: recon.id,
	draggable: false,
  });
  col.on("click", (e) => {
    const { editor_mode_on } = serverStore.getState();
	const clickable = geometryStore!.getState()!.geometry!.get(recon.id)!.clickable
	
	if (clickable || editor_mode_on){
		endEditSelectedGeometry(layer, recon)
		setSelectedGeometry(recon.id);
		setSelectedEntityId(null);
	}
  });
  col.on("dragend", (e) => {
	const pos = col.getFirstCoordinate();
	updateGeometrySafe(recon.id, {
	  position: [pos.y, pos.x],
	});
  });

  layer.addGeometry(col);

}

function getGradient(colors:any) {
    return {
        type: 'radial',
        colorStops: [[0.70, 'rgba(' + colors.join() + ', 0.5)'], [0.30, 'rgba(' + colors.join() + ', 1)'], [0.20, 'rgba(' + colors.join() + ', 1)'], [0.00, 'rgba(' + colors.join() + ', 0)']]
    };
}

function renderQuest(layer: maptalks.VectorLayer, layerQuest: maptalks.VectorLayer, quest: Quest) {
  const collection = layer.getGeometryById(
    quest.id
  ) as maptalks.GeometryCollection;
  if (collection) {
    const [icon, text] = collection.getGeometries() as [
      maptalks.Marker,
      maptalks.Label
    ];

    icon.setCoordinates([quest.position[1], quest.position[0]]);
    text.setCoordinates([quest.position[1], quest.position[0]]);
    (text.setContent as any)(quest.name || `Mission #${quest.id}`);
	const pulse = layerQuest.getGeometryById(quest.id) as maptalks.Marker;
	if (pulse) {
		(pulse.setSymbol as any)({
			markerType: 'ellipse',
			markerFill: quest.color,
			markerFillOpacity: 0.8,
			markerLineWidth: 0,
			markerWidth: 75,
			markerHeight: 75
		});
	}

    return;
  }

  var icon = new maptalks.Marker(
        [quest.position[1], quest.position[0]],
		{
			'id': quest.id,
			symbol:{
				'markerType': 'ellipse',
				'markerFill': quest.color, //'#FBBF24',//color,
				'markerFillOpacity': 0.8,
				'markerLineWidth': 0,
				'markerWidth': 75,
				'markerHeight': 75
			}
		}
      );
  var icon2 = new maptalks.Marker(
        [quest.position[1], quest.position[0]],
		{
			'id': quest.id,
			symbol:{
				'markerFile'   : quest.marker,
				'markerWidth'  : 28,
				'markerHeight' : 28,
				'markerDx'     : 0,
				'markerDy'     : 0,
				'markerOpacity': 1
			}
		}
      );

  const text = new maptalks.Label(
	quest.name || `Mission #${quest.id}`,
	[quest.position[1], quest.position[0]],
	{
	  draggable: false,
	  visible: true,
	  editable: false,
	  boxStyle: {
		padding: [2, 2],
		horizontalAlignment: "left",
		verticalAlignment: "middle",
		symbol: {
		  markerType: "square",
		  markerFill: "#4B5563",
		  markerFillOpacity: 0.5,
		  markerLineOpacity: 0,
		  textHorizontalAlignment: "right",
		  textVerticalAlignment: "middle",
		  textDx: 20,
		},
	  },
	  textSymbol: {
		textFaceName: '"microsoft yahei"',
		textFill: "#FBBF24",
		textSize: 12,
	  },
	}
  );

  const col = new maptalks.GeometryCollection([icon2, text], {
	id: quest.id,
	draggable: false,
  });
  col.on("click", (e) => {
    const { editor_mode_on } = serverStore.getState();
	const clickable = geometryStore!.getState()!.geometry!.get(quest.id)!.clickable
	
	if (clickable || editor_mode_on){
		endEditSelectedGeometry(layer, quest)
		setSelectedGeometry(quest.id);
		setSelectedEntityId(null);
	}
  });
  col.on("dragend", (e) => {
	const pos = col.getFirstCoordinate();
	updateGeometrySafe(quest.id, {
		position: [pos.y, pos.x],
	});
  });
  layer.addGeometry(col);
  layerQuest.addGeometry(icon);

}




function renderGeometry(
  map: maptalks.Map,
  geometry: Immutable.Map<number, Geometry>,
  localHiddenGeometryIds: Immutable.Set<number>
) {
  const { editor_mode_on } = serverStore.getState();
  const layer = map.getLayer("custom-geometry") as maptalks.VectorLayer;
  const layerQuest = map.getLayer("quest") as maptalks.VectorLayer;
  const layerQuestPin = map.getLayer("quest-pin") as maptalks.VectorLayer;
  const zoom = map.getZoom();
  const clusteredMarkerIds = updateMarkerClusters(
	map,
	geometry,
	localHiddenGeometryIds,
	zoom,
	editor_mode_on
  );

  for (const geo of layer.getGeometries() ) {
    const id = (geo as any)._id as number;
    const storeGeo = geometry.get(id);
    const removeForCluster =
      !!storeGeo &&
      (storeGeo.type === "recon" || storeGeo.type === "markpoint") &&
      clusteredMarkerIds.has(storeGeo.id);
    const removeForHidden = !!storeGeo && !editor_mode_on && storeGeo.hidden;
    const removeForLocalHidden = !!storeGeo && localHiddenGeometryIds.has(storeGeo.id);
    if (!storeGeo || storeGeo.status === "Deleted" || removeForCluster || removeForHidden || removeForLocalHidden) {
      geo.remove();
    }
  }
  for (const geo of layerQuest.getGeometries()) {
    const rawId = (geo as any)._id as number | string;
    if (typeof rawId === "string" && rawId.startsWith("mission-cluster-")) {
      continue;
    }
    const id = rawId as number;
    const storeGeo = geometry.get(id);
    const removeForCluster =
      !!storeGeo && storeGeo.type === "quest" && clusteredMarkerIds.has(storeGeo.id);
    const removeForHidden = !!storeGeo && !editor_mode_on && storeGeo.hidden;
    const removeForLocalHidden = !!storeGeo && localHiddenGeometryIds.has(storeGeo.id);
    if (!storeGeo || storeGeo.status === "Deleted" || removeForCluster || removeForHidden || removeForLocalHidden) {
      geo.remove();
    } 
  }
  for (const geo of layerQuestPin.getGeometries()) {
    const id = (geo as any)._id as number;
    const storeGeo = geometry.get(id);
    const removeForCluster =
      !!storeGeo && storeGeo.type === "quest" && clusteredMarkerIds.has(storeGeo.id);
    const removeForHidden = !!storeGeo && !editor_mode_on && storeGeo.hidden;
    const removeForLocalHidden = !!storeGeo && localHiddenGeometryIds.has(storeGeo.id);
    if (!storeGeo || storeGeo.status === "Deleted" || removeForCluster || removeForHidden || removeForLocalHidden) {
      geo.remove();
    }
  }

  for (const geo of geometry.valueSeq()) {
	if (
		geo.status !== "Deleted" &&
		(editor_mode_on || !geo.hidden) &&
		!localHiddenGeometryIds.has(geo.id)
	) {
		if (geo.type === "markpoint") {
			if (!clusteredMarkerIds.has(geo.id)) {
				renderMarkPoint(layer, geo);
			}
		} else if (geo.type === "zone") {
			renderZone(layer, geo);
		} else if (geo.type === "waypoints") {
			renderWaypoints(layer, geo);
		} else if (geo.type === "circle") {
			renderCircle(layer, geo);
		} else if (geo.type === "line") {
			renderLine(layer, geo);
		} else if (geo.type === "border") {
			renderLine(layer, geo);
		} else if (geo.type === "recon") {
			if (!clusteredMarkerIds.has(geo.id)) {
				renderRecon(layer, geo);
			}
		} else if (geo.type === "quest") {
			if (!clusteredMarkerIds.has(geo.id)) {
				renderQuest(layerQuestPin, layerQuest, geo);
			}
		}
	}
  }
}

export default function useRenderGeometry(map: maptalks.Map | null) {
	if (iconCache[markPointSIDC] === undefined) {
		iconCache[markPointSIDC] = new ms.Symbol(markPointSIDC, {
			size: 14,
			frame: false,
			fill: true,
			strokeWidth: 8,
			monoColor: "#FDE68A",
		}).toDataURL();
	}
	if (iconCache[reconSIDC] === undefined) {
		iconCache[reconSIDC] = new ms.Symbol(reconSIDC, {
			size: 20,
			frame: false,
			fill: true,
			strokeWidth: 11,
			monoColor: "#FF2802",
		}).toDataURL();
	}
	
	useEffect(() => {
		return geometryStore.subscribe(
			([geometry, localHiddenGeometryIds, testUpdateStore, selectedGeometry]) => {
				if (map === null) return;
				renderGeometry(map, geometry, localHiddenGeometryIds);
			},
			(state) =>
				[
					state.geometry,
					state.localHiddenGeometryIds,
					state.testUpdateStore,
					state.selectedGeometry,
				] as [
					Immutable.Map<number, Geometry>,
					Immutable.Set<number>,
					number,
					number | null
				]
		);
	}, [map]);

	useEffect(() => {
		if (map !== null) {
			renderGeometry(map, geometryStore.getState().geometry, geometryStore.getState().localHiddenGeometryIds);
		}
	}, [map]);

	useEffect(() => {
		if (map === null) {
			return;
		}
		const handler = () => {
			renderGeometry(map, geometryStore.getState().geometry, geometryStore.getState().localHiddenGeometryIds);
		};
		map.on("zoomend", handler);
		return () => {
			map.off("zoomend", handler);
		};
	}, [map]);

	useEffect(() => {
		if (map === null) {
			return;
		}
		return settingsStore.subscribe(
			() => {
				renderGeometry(
					map,
					geometryStore.getState().geometry,
					geometryStore.getState().localHiddenGeometryIds
				);
			},
			(state) => state.unitSystem
		);
	}, [map]);
}

