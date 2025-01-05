import classNames from "classnames";
import * as maptalks from "maptalks";
import React, { useState } from "react";
import { BiMapPin } from "react-icons/bi";
import {
  addQuest,
  geometryStore,
  setSelectedGeometry
} from "../stores/GeometryStore";
import { iconCache } from "../components/MapEntity";
import { setSelectedEntityId } from "../stores/ServerStore";
import { ColorPicker, useColor } from "react-color-palette";
import "react-color-palette/css";

export default function QuestConsoleTab({ map }: { map: maptalks.Map }) {
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
					<button
					  className={classNames("bg-green-100 hover:bg-green-200 border-green-400 p-1 border rounded-sm text-sm text-green-700 flex-row items-center w-full",
									{ "bg-green-300 border-green-600": draw === "Quest" }
								  )}
					  
					  onClick={() => {
						setDraw("Quest");
						var drawTool = new maptalks.DrawTool({
							mode: 'Point',
							once: true,
							symbol:{
								'markerFile'   : '/static/Map-Marker-Ball-Chartreuse-icon.png',
								'markerWidth'  : 28,
								'markerHeight' : 28,
								'markerDx'     : 0,
								'markerDy'     : 0,
								'markerOpacity': 1
							}
						}).addTo(map).disable();
						drawTool.on('drawend', function(param) {
							setDraw("")
							const pos = param!.geometry!.getFirstCoordinate();
							addQuest([pos.y, pos.x], color.hex);
						});
						drawTool.setMode('Point').enable(); 
						
					  }}
					>
					  Mission
					  <BiMapPin className="ml-2 inline-block" />
					</button>
	  </div>
      <div className="my-2 flex flex-col gap-1 max-h-72 overflow-auto">
        {geometry.valueSeq().sort((a, b) => a.id > b.id ? 1 : -1).map((it) => {
			  if (it.type === "quest") {
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
						position = [it.position[1], it.position[0]];

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


