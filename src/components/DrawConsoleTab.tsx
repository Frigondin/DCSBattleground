import classNames from "classnames";
import * as maptalks from "maptalks";
import React, { useState } from "react";
import { BiShapeCircle, BiShapeSquare, BiRadioCircle, BiPencil, BiShareAlt, BiRuler, BiMinus } from "react-icons/bi";
import {
  addMarkPoint,
  addZone,
  addWaypoints,
  addCircle,
  addLine,
  geometryStore,
  setSelectedGeometry
} from "../stores/GeometryStore";
import { iconCache } from "../components/MapEntity";
import { setSelectedEntityId,  serverStore} from "../stores/ServerStore";
import { ColorPicker, useColor } from "react-color-palette";
import "react-color-palette/css";

export default function DrawConsoleTab({ map }: { map: maptalks.Map }) {
  const [geometry, selectedId] = geometryStore((state) => [
    state.geometry,
    state.selectedGeometry,
  ]);
const [color, setColor] = useColor("#0068FF");
const [draw, setDraw] = useState("");

  return (
    <div className="p-2">
      <div className="">
		<ColorPicker color={color} hideInput={["rgb", "hsv"]} height={100} onChange={setColor} />
	  </div>
      <div className="flex flex-row text-left items-center w-full gap-2 ml-auto">
		<table>
			<tr>
				<td>
					<button
					  className={classNames("bg-green-100 hover:bg-green-200 border-green-400 p-1 border rounded-sm text-sm text-green-700 flex-row items-center w-full",
									{ "bg-green-300 border-green-600": draw === "Mark" }
								  )}
					  
					  onClick={() => {
						setDraw("Mark");
						var drawTool = new maptalks.DrawTool({
							mode: 'Point',
							once: true,
							symbol: {
								markerFile: iconCache["GHG-GPRN--"],
								markerDy: 10,
							}
						}).addTo(map).disable();
						drawTool.on('drawend', function(param) {
							setDraw("")
							const pos = param!.geometry!.getFirstCoordinate();
							addMarkPoint([pos.y, pos.x], color.hex);
						});
						drawTool.setMode('Point').enable(); 
						
					  }}
					>
					  Mark
					  <BiShapeCircle className="ml-2 inline-block" />
					</button>
				</td>
				<td>
					<button
					  className={classNames("bg-green-100 hover:bg-green-200 border-green-400 p-1 border rounded-sm text-sm text-green-700 flex-row items-center w-full",
									{ "bg-green-300 border-green-600": draw === "Zone" }
								  )}
					  onClick={() => {
						setDraw("Zone");
						var drawTool = new maptalks.DrawTool({
							mode: 'Point',
							once: true,
							symbol: {
								'lineColor': "#FBBF24",
								'lineWidth': 2,
								'polygonFill': "#D97706",
								'polygonOpacity': 0.1
							}
						}).addTo(map).disable();
						drawTool.on('drawend', function(param) {
							setDraw("")
							let coordsTmp = param!.geometry!.getCoordinates()[0] as Array<{x:number,y:number}>;
							let coords:[number, number][] = [];
							coordsTmp.forEach((coord) => {
								coords.push([ coord.y, coord.x]);
							});
							addZone(coords, color.hex);
						});
						drawTool.setMode('Polygon').enable(); 
					  }}
					>
					  Zone
					  <BiShapeSquare className="ml-2 inline-block" />
					</button>
				</td>
				<td>
					<button
					  className={classNames("bg-green-100 hover:bg-green-200 border-green-400 p-1 border rounded-sm text-sm text-green-700 flex-row items-center w-full",
									{ "bg-green-300 border-green-600": draw === "Wpts" }
								  )}
					  onClick={() => {
						setDraw("Wpts");
						var drawTool = new maptalks.DrawTool({
							mode: 'Point',
							once: true,
							symbol: {
								'lineColor' : '#1bbc9b',
								'lineWidth' : 3
							}
						}).addTo(map).disable();

						drawTool.on('drawend', function(param) {
							setDraw("")
							let coordsTmp = param!.geometry!.getCoordinates() as Array<{x:number,y:number}>;
							let coords:[number, number][] = [];
							coordsTmp.forEach((coord) => {
								coords.push([ coord.y, coord.x]);
							});
							addWaypoints(coords, color.hex) 
						});
						drawTool.setMode('LineString').enable(); 
						
					  }}
					>
					  Wpts.
					  <BiShareAlt className="ml-2 inline-block" />
					</button>
				</td>
			</tr>
			<tr>
				<td>
					<button
					  className={classNames("bg-green-100 hover:bg-green-200 border-green-400 p-1 border rounded-sm text-sm text-green-700 flex-row items-center w-full",
									{ "bg-green-300 border-green-600": draw === "Circle" }
								  )}
					  onClick={() => {
						setDraw("Circle");
						var drawTool = new maptalks.DrawTool({
							mode: 'Point',
							once: true,
							symbol: {
								'lineColor': "#FBBF24",
								'lineWidth': 2,
								'polygonFill': "#D97706",
								'polygonOpacity': 0.1
							}
						}).addTo(map).disable();

						drawTool.on('drawend', function(param) {
							setDraw("")
							const pos = param!.geometry!.getCoordinates();
							const radius = param!.geometry!.getRadius();
							addCircle([pos.y, pos.x], radius, color.hex) 
						});
						drawTool.setMode('Circle').enable(); 
					  }}
					>
					  Circle
					  <BiRadioCircle className="ml-2 inline-block" />
					</button>
				</td>
				<td>
					<button
					  className={classNames("bg-green-100 hover:bg-green-200 border-green-400 p-1 border rounded-sm text-sm text-green-700 flex-row items-center w-full",
									{ "bg-green-300 border-green-600": draw === "Line" }
								  )}
					  onClick={() => {
						setDraw("Line");
						var drawTool = new maptalks.DrawTool({
							mode: 'Point',
							once: true,
							symbol: {
								'lineColor' : '#FBBF24',
								'lineWidth' : 2
							}
						}).addTo(map).disable();

						drawTool.on('drawend', function(param) {
							setDraw("")
							let coordsTmp = param!.geometry!.getCoordinates() as Array<{x:number,y:number}>;
							let coords:[number, number][] = [];
							coordsTmp.forEach((coord) => {
								coords.push([ coord.y, coord.x]);
							});
							addLine(coords, color.hex) 
						});
						drawTool.setMode('LineString').enable(); 
						
					  }}
					>
					  Line.
					  <BiMinus className="ml-2 inline-block" />
					</button>
				</td>
				<td>
					<button
					  className={classNames("bg-green-100 hover:bg-green-200 border-green-400 p-1 border rounded-sm text-sm text-green-700 flex-row items-center w-full",
									{ "bg-green-300 border-green-600": draw === "Free" }
								  )}
					  onClick={() => {
						setDraw("Free");
						var drawTool = new maptalks.DrawTool({
							mode: 'Point',
							once: true,
							symbol: {
								'lineColor': "#FBBF24",
								'lineWidth': 2,
								'polygonFill': "#D97706",
								'polygonOpacity': 0.1
							}
						}).addTo(map).disable();

						drawTool.on('drawend', function(param) {
							setDraw("")
							let coordsTmp = param!.geometry!.getCoordinates() as Array<{x:number,y:number}>;
							let coords:[number, number][] = [];
							coordsTmp.forEach((coord) => {
								coords.push([ coord.y, coord.x]);
							});
							addLine(coords, color.hex) 
						});
						drawTool.setMode('FreeHandLineString').enable(); 
					  }}
					>
					  Free
					  <BiPencil className="ml-2 inline-block" />
					</button>
				</td>
			</tr>
			<tr>
				<td>
					<button
					  className={classNames("bg-green-100 hover:bg-green-200 border-green-400 p-1 border rounded-sm text-sm text-green-700 flex-row items-center w-full",
									{ "bg-green-300 border-green-600": draw === "Dist" }
								  )}
					  onClick={() => {
						setDraw("Dist");
						addMeasure({map});
					  }}
					>
					  Dist.
					  <BiRuler className="ml-2 inline-block" />
					</button>
				</td>
			</tr>
		</table>
      </div>
	  <div>
			{(draw === "Mark"  || draw === "Circle"  || draw === "Free" || draw === "") && (<br/>)}
			{(draw === "Zone"  || draw === "Wpts"  || draw === "Line" || draw === "Dist") && (<div>Double click to end drawing</div>)}
	  </div>
      <div className="my-2 flex flex-col gap-1 max-h-56 overflow-auto">
        {geometry.valueSeq().map((it) => {
		  const { editor_mode_on } = serverStore.getState();
		  if (it.type !== "quest" && (it.clickable || editor_mode_on)) {
			  return (
				<button
				  key={it.id}
				  className={classNames(
					"bg-indigo-100 hover:border-indigo-300 hover:bg-indigo-200 border-indigo-200 border rounded-sm p-1",
					{ "bg-indigo-200 border-indigo-300": it.id === selectedId }
				  )}
				  onClick={() => {
					setSelectedGeometry(it.id);
					setSelectedEntityId(null);

					let position;
					if (it.type === "markpoint") {
						position = [it.position[1], it.position[0]];
					} else if (it.type === "recon") {
						position = [it.position[1], it.position[0]];
					} else if (it.type === "zone") {
						position = [it.points[0][1], it.points[0][0]];
					} else if (it.type === "waypoints") {
						position = [it.points[0][1], it.points[0][0]];
					} else if (it.type === "circle") {
						position = [it.center[1], it.center[0]];
					} else if (it.type === "line") {
						position = [it.points[0][1], it.points[0][0]];
					}

					if (position) {
					  map.animateTo(
						{
						  center: position,
						  zoom: 10,
						},
						{
						  duration: 250,
						  easing: "out",
						}
					  );
					}
				  }}
				>
				  {it.name || `${it.type} #${it.id}`}
				</button>
			  );
		  }
		})}
      </div>
    </div>
  );
}

function addMeasure({ map }: { map: maptalks.Map }){
	var distanceTool = new maptalks.DistanceTool({
	  'symbol': {
		'lineColor': '#34495e',
		'lineWidth': 2
	  },
	  'vertexSymbol': {
		'markerType': 'ellipse',
		'markerFill': '#1bbc9b',
		'markerLineColor': '#000',
		'markerLineWidth': 3,
		'markerWidth': 10,
		'markerHeight': 10
	  },

	  'labelOptions': {
		'textSymbol': {
		  'textFaceName': 'monospace',
		  'textFill': '#fff',
		  'textLineSpacing': 1,
		  'textHorizontalAlignment': 'right',
		  'textDx': 15,
		  'markerLineColor': '#b4b3b3',
		  'markerFill': '#000'
		},
		'boxStyle': {
		  'padding': [6, 2],
		  'symbol': {
			'markerType': 'square',
			'markerFill': '#000',
			'markerFillOpacity': 0.9,
			'markerLineColor': '#b4b3b3'
		  }
		}
	  },
	  'clearButtonSymbol': [{
		'markerType': 'square',
		'markerFill': '#000',
		'markerLineColor': '#b4b3b3',
		'markerLineWidth': 2,
		'markerWidth': 15,
		'markerHeight': 15,
		'markerDx': 20
	  }, {
		'markerType': 'x',
		'markerWidth': 10,
		'markerHeight': 10,
		'markerLineColor': '#fff',
		'markerDx': 20
	  }],
	  'language': 'en-US',
	  'once' : true,
	  'metric'  : true,
	  'imperial' : true
	}).addTo(map);
}
