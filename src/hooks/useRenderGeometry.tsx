import Immutable from "immutable";
import * as maptalks from "maptalks";
import * as animatemarker from "maptalks.animatemarker";
import ms from "milsymbol";
import { useEffect } from "react";
import { iconCache } from "../components/MapEntity";
import * as mgrs from "mgrs";
import {
  Geometry,
  geometryStore,
  MarkPoint,
  getSelectedGeometry,
  setSelectedGeometry,
  updateGeometrySafe,
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




function endEditSelectedGeometry(layer: maptalks.VectorLayer, geo: Geometry) {
	console.log("testouille1");
	//const selectedGeometry = geometryStore((state) =>
	//	state.selectedGeometry !== null
	//		? state.geometry.get(state.selectedGeometry)
	//		: undefined
	//);
	
	//const selectedGeometryId = geometryStore!.getState()!.selectedGeometry
	//console.log("testouille2");
	//var selectedGeometry
	//selectedGeometryId ? (selectedGeometry = geometryStore!.getState()!.geometry!.get(geo.id)) : selectedGeometry = null
	
	const selectedGeometry = getSelectedGeometry()
	
	console.log("testouille3");
	console.log(selectedGeometry);
	console.log(geo);
	const map = layer.getMap();
    if (selectedGeometry && selectedGeometry.id !== geo.id) {
		console.log("testouille4");
		
		const layer = map.getLayer("custom-geometry") as maptalks.VectorLayer;
		const layerQuest = map.getLayer("quest-pin") as maptalks.VectorLayer;
		var item = layer.getGeometryById(
			selectedGeometry.id
		) as maptalks.GeometryCollection;
		if (item === null) {
			item = layerQuest.getGeometryById(
				selectedGeometry.id
			) as maptalks.GeometryCollection;
		}
		

		if (selectedGeometry.type === "zone" ||
			selectedGeometry.type === "waypoints" ||
			selectedGeometry.type === "line" ||
			selectedGeometry.type === "circle" ) {
			console.log("testouille5");
			item.endEdit();
		} else if (selectedGeometry.type !== "quest"){
			item.config("draggable", false);
			console.log("testouille6");
		}
	}
}





function renderWaypoints(layer: maptalks.VectorLayer, waypoints: Waypoints) {
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
		waypoints.points.forEach((point) => {
		  counter = counter + 1;
			if (counter > 0) {
				const textWpt = new maptalks.Label(
					`WPT#${counter}`,
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
  waypoints.points.forEach((point) => {
	  counter = counter + 1;
	  if (counter > 0) {
		  const textWpt = new maptalks.Label(
			`WPT#${counter}`,
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
  col.on("editend", (e) => {
	console.log("test editend");
	let coords = lineString.getCoordinates() as Array<{x:number,y:number}>;
	updateGeometrySafe(waypoints.id, {
      points: coords.map((it) => [it.y, it.x]),
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
    text.setCoordinates([zone.points[0][1], zone.points[0][0]]);
    (text.setContent as any)(zone.name || `Zone #${zone.id}`);

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
  col.on("click", (e) => {
    const { editor_mode_on } = serverStore.getState();
	const clickable = geometryStore!.getState()!.geometry!.get(zone.id)!.clickable
	
	if (clickable || editor_mode_on){
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
    text.setCoordinates([circle.center[1], circle.center[0]]);
    (text.setContent as any)(circle.name || `Circle #${circle.id}`);

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
  col.on("click", (e) => {
    const { editor_mode_on } = serverStore.getState();
	const clickable = geometryStore!.getState()!.geometry!.get(circle.id)!.clickable
	
	if (clickable || editor_mode_on){
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
  //console.log(quest.color);
//  if (quest.status !== "Active") {
//	deleteGeometry(quest.id);
//	return;
//  }
  if (collection) {
    const [icon, text] = collection.getGeometries() as [
      maptalks.Marker,
      maptalks.Label
    ];

    icon.setCoordinates([quest.position[1], quest.position[0]]);
    text.setCoordinates([quest.position[1], quest.position[0]]);
    (text.setContent as any)(quest.name || `Quest #${quest.id}`);

    return;
  }

//	var color = getGradient([251, 191, 36]);
//	if (quest.name?.startsWith('POI :')) {
//		color = getGradient([251, 191, 36]);
//	}
//	else {
//		color = getGradient([255, 16, 59]);
//	};
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
				//'markerFile'   : 'https://icons.iconarchive.com/icons/icons-land/vista-map-markers/256/Map-Marker-Ball-Chartreuse-icon.png',
				'markerFile'   : quest.marker, //'/static/Map-Marker-Ball-Chartreuse-icon.png',
				'markerWidth'  : 28,
				'markerHeight' : 28,
				'markerDx'     : 0,
				'markerDy'     : 0,
				'markerOpacity': 1
			}
		}
      );

  const text = new maptalks.Label(
	quest.name || `Quest #${quest.id}`,
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
  geometry: Immutable.Map<number, Geometry>
) {
  const layer = map.getLayer("custom-geometry") as maptalks.VectorLayer;
  const layerQuest = map.getLayer("quest") as maptalks.VectorLayer;
  const layerQuestPin = map.getLayer("quest-pin") as maptalks.VectorLayer;
  for (const geo of layer.getGeometries() ) {
    if (!geometry.has((geo as any)._id as number) || geometry.get((geo as any)._id as number)!.status === "Deleted") {
      geo.remove();
    }
  }
  for (const geo of layerQuest.getGeometries()) {
    if (!geometry.has((geo as any)._id as number) || geometry.get((geo as any)._id as number)!.status === "Deleted") {
      geo.remove();
    } 
  }
  for (const geo of layerQuestPin.getGeometries()) {
    if (!geometry.has((geo as any)._id as number) || geometry.get((geo as any)._id as number)!.status === "Deleted") {
      geo.remove();
    }
  }

  for (const geo of geometry.valueSeq()) {
	if (geo.status !== "Deleted") {
		if (geo.type === "markpoint") {
			renderMarkPoint(layer, geo);
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
			renderRecon(layer, geo);
		} else if (geo.type === "quest") {
			renderQuest(layerQuestPin, layerQuest, geo);
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
			(geometry: Immutable.Map<number, Geometry>) => {
				if (map === null) return;
					renderGeometry(map, geometry);
				},
			(state) => state.geometry
		);
	}, [map]);

	useEffect(() => {
		if (map !== null) {
			renderGeometry(map, geometryStore.getState().geometry);
		}
	}, [map]);
}
