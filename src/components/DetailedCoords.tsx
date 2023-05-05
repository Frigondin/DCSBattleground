import * as mgrs from "mgrs";
import React from "react";
import { formatDDM, formatDMS } from "../util";


function parseMgrs(coords:[number, number]){
	var val:string = mgrs.forward([coords[1], coords[0]])
	//console.log("test")
	return val.slice(0, 3) + " " + val.slice(3, 5) + " " + val.slice(5, 10) + " " + val.slice(10)
}

export default function DetailedCoords({
  coords,
}: {
  coords: [number, number];
}) {
  return (
    <>
      <div className="flex flex-row w-full">
        <span className="pr-2 flex-grow">DMS</span>
        <span className="select-text font-mono">{formatDMS(coords)}</span>
      </div>
      <div className="flex flex-row w-full">
        <span className="pr-2 flex-grow">DDM</span>
        <span className="select-text font-mono">{formatDDM(coords)}</span>
      </div>
      <div className="flex flex-row w-full">
        <span className="pr-2 flex-grow">MGRS</span>
        <span className="select-text font-mono">
          {parseMgrs(coords)}
        </span>
      </div>
    </>
  );
}
