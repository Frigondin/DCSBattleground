import classNames from "classnames";
import * as maptalks from "maptalks";
import React, { useEffect, useRef, useState } from "react";
import { BiMapPin, BiHide, BiShow } from "react-icons/bi";
import {
  addQuest,
  geometryStore,
  setSelectedGeometry,
  toggleLocalGeometryHidden
} from "../stores/GeometryStore";
import { iconCache } from "../components/MapEntity";
import { setSelectedEntityId, serverStore } from "../stores/ServerStore";
import { ColorPicker, useColor } from "react-color-palette";
import "react-color-palette/css";

const DEFAULT_DRAW_MARKER_COLOR = "#0068FF";
const DRAW_MARKER_COLOR_STORAGE_KEY = "draw:markerColor";

function getInitialDrawMarkerColor(): string {
  const raw = localStorage.getItem(DRAW_MARKER_COLOR_STORAGE_KEY);
  if (raw && /^#[0-9A-Fa-f]{6}$/.test(raw)) {
    return raw;
  }
  return DEFAULT_DRAW_MARKER_COLOR;
}

export default function QuestConsoleTab({ map }: { map: maptalks.Map }) {
  const [geometry, selectedId, localHiddenGeometryIds] = geometryStore((state: any) => [
    state.geometry,
    state.selectedGeometry,
    state.localHiddenGeometryIds,
  ]);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
const [initialColor] = useState(getInitialDrawMarkerColor);
const [color, setColor] = useColor(initialColor);
const [draw, setDraw] = useState("");

  useEffect(() => {
    if (typeof selectedId !== "number") return;
    const row = rowRefs.current[selectedId];
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedId]);

  useEffect(() => {
    if (/^#[0-9A-Fa-f]{6}$/.test(color.hex)) {
      localStorage.setItem(DRAW_MARKER_COLOR_STORAGE_KEY, color.hex);
    }
  }, [color.hex]);

  return (
    <div className="p-2">
      <div className="">
		<ColorPicker color={color} hideInput={["rgb", "hsv"]} height={72} onChange={setColor} />
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
        {geometry
          .valueSeq()
          .toArray()
          .filter((it: any) => {
            const { editor_mode_on } = serverStore.getState();
            return it.type === "quest" && (editor_mode_on || (it.clickable && !it.hidden));
          })
          .sort((a: any, b: any) => {
            const aLabel = (a.name || `${a.type} #${a.id}`).toString().toLowerCase();
            const bLabel = (b.name || `${b.type} #${b.id}`).toString().toLowerCase();
            return aLabel.localeCompare(bLabel);
          })
          .map((it: any) => {
          const isLocallyHidden = !!localHiddenGeometryIds?.has?.(it.id);
				  return (
          <div
            key={it.id}
            ref={(element) => {
              rowRefs.current[it.id] = element;
            }}
            className={classNames("flex flex-row items-center gap-1 rounded-sm transition-all", {
              "ring-2 ring-amber-400 bg-amber-50/40": it.id === selectedId,
            })}
          >
            <button
              className={classNames(
                "flex-1 text-left bg-indigo-100 hover:border-indigo-300 hover:bg-indigo-200 border-indigo-200 border rounded-sm p-1",
                { "bg-indigo-200 border-indigo-300": it.id === selectedId }
              )}
              onClick={() => {
                setSelectedGeometry(it.id);
                setSelectedEntityId(null);

                const position = [it.position[1], it.position[0]];
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
            <button
              title={isLocallyHidden ? "Show locally" : "Hide locally"}
              className={classNames(
                "p-1 border rounded-sm",
                isLocallyHidden
                  ? "bg-red-100 border-red-400 text-red-600 hover:bg-red-200"
                  : "bg-gray-200 border-gray-400 text-gray-700 hover:bg-gray-300"
              )}
              onClick={(event) => {
                event.stopPropagation();
                toggleLocalGeometryHidden(it.id);
              }}
            >
              {isLocallyHidden ? (
                <BiHide className="inline-block w-4 h-4" />
              ) : (
                <BiShow className="inline-block w-4 h-4" />
              )}
            </button>
          </div>
				  );
        })}
      </div>
    </div>
  );
}


