import classNames from "classnames";
import * as maptalks from "maptalks";
import React from "react";
import { BiShapeCircle, BiShapeSquare, BiRadioCircle, BiPencil, BiShareAlt, BiRuler, BiMinus } from "react-icons/bi";
import {
  addMarkPoint,
  addZone,
  addWaypoints,
  addCircle,
  addLine,
  geometryStore,
  setSelectedGeometry,
} from "../stores/GeometryStore";
import { iconCache } from "../components/MapEntity";
import { setSelectedEntityId } from "../stores/ServerStore";

export default function QuestConsoleTab({ map }: { map: maptalks.Map }) {
  const [geometry, selectedId] = geometryStore((state) => [
    state.geometry,
    state.selectedGeometry,
  ]);

  return (
    <div className="p-2">
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


