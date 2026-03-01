import classNames from "classnames";
import Coord from "coordinate-parser";
import * as maptalks from "maptalks";
import * as mgrs from "mgrs";
import React, { useEffect, useState, useRef } from "react";
import ReactRoundedImage from "react-rounded-image"
import { BiExit, BiEdit, BiTrash, BiMailSend, BiCheck, BiMapPin, BiCheckSquare, BiCheckbox, BiUpload, BiLock, BiLockOpen, BiMouseAlt, BiUndo, BiSolidTrash, BiMinusCircle, BiLoader, BiExport, BiHide, BiShow } from "react-icons/bi";
import Lightbox from 'react-image-lightbox';
import { saveAs } from 'file-saver';
//import Lightbox from 'yet-another-react-lightbox';
//import { Counter, Download, Fullscreen, Thumbnails, Video } from "yet-another-react-lightbox/plugins";

//plugin={[Counter, Download, Fullscreen, Thumbnails, Video]}


import 'react-image-lightbox/style.css';
import {Collapse, UnmountClosed} from 'react-collapse';
import { serverStore } from "../stores/ServerStore";
import { v4 as uuidv4 } from 'uuid';
import { ColorPicker, useColor } from "react-color-palette";
import "react-color-palette/css";

import {
  deleteGeometry,
  Geometry,
  geometryStore,
  setSelectedGeometry,
  updateGeometryComputed,
  updateGeometrySafe,
  updateGeometry
} from "../stores/GeometryStore";
import DetailedCoords from "./DetailedCoords";
import { formatDDM, formatDMS, getFlyDistance, route } from "../util";
import { settingsStore, UnitSystem } from "../stores/SettingsStore";

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



function maybeParseCoord(newCoord: string): null | [number, number] {
  const input = newCoord.trim().toUpperCase().replace(/\s+/g, " ");
  if (!input) return null;

  // DMS: N43°12'34" E001°23'45"
  const dmsMatch = input.match(
    /^([NS])\s*(\d{1,2})\s*(?:°|D)?\s*(\d{1,2})\s*(?:'|’|′|M)?\s*(\d{1,2}(?:\.\d+)?)\s*(?:"|”|″|S)?\s+([EW])\s*(\d{1,3})\s*(?:°|D)?\s*(\d{1,2})\s*(?:'|’|′|M)?\s*(\d{1,2}(?:\.\d+)?)\s*(?:"|”|″|S)?$/
  );
  if (dmsMatch) {
    const latDeg = Number(dmsMatch[2]);
    const latMin = Number(dmsMatch[3]);
    const latSec = Number(dmsMatch[4]);
    const lonDeg = Number(dmsMatch[6]);
    const lonMin = Number(dmsMatch[7]);
    const lonSec = Number(dmsMatch[8]);

    if (
      latDeg <= 90 &&
      lonDeg <= 180 &&
      latMin < 60 &&
      lonMin < 60 &&
      latSec < 60 &&
      lonSec < 60
    ) {
      let lat = latDeg + latMin / 60 + latSec / 3600;
      let lon = lonDeg + lonMin / 60 + lonSec / 3600;
      if (dmsMatch[1] === "S") lat *= -1;
      if (dmsMatch[5] === "W") lon *= -1;
      return [lat, lon];
    }
  }

  // DDM: N43°12.34567 E001°23.45678
  const ddmMatch = input.match(
    /^([NS])\s*(\d{1,2})\s*(?:°|D)?\s*(\d{1,2}(?:\.\d+)?)\s*(?:'|’|′|M)?\s+([EW])\s*(\d{1,3})\s*(?:°|D)?\s*(\d{1,2}(?:\.\d+)?)\s*(?:'|’|′|M)?$/
  );
  if (ddmMatch) {
    const latDeg = Number(ddmMatch[2]);
    const latMin = Number(ddmMatch[3]);
    const lonDeg = Number(ddmMatch[5]);
    const lonMin = Number(ddmMatch[6]);
    if (latDeg <= 90 && lonDeg <= 180 && latMin < 60 && lonMin < 60) {
      let lat = latDeg + latMin / 60;
      let lon = lonDeg + lonMin / 60;
      if (ddmMatch[1] === "S") lat *= -1;
      if (ddmMatch[4] === "W") lon *= -1;
      return [lat, lon];
    }
  }

  try {
    const coord = new Coord(input);
    return [coord.getLatitude(), coord.getLongitude()];
  } catch (e) {
    try {
      const coord = mgrs.toPoint(input.replace(/\s+/g, ""));
      return [coord[1], coord[0]];
    } catch (e) {}
  }
  return null;
}

function formatMgrsForInput(coords: [number, number]): string {
  const val: string = mgrs.forward([coords[1], coords[0]]);
  return (
    val.slice(0, 3) +
    " " +
    val.slice(3, 5) +
    " " +
    val.slice(5, 10) +
    " " +
    val.slice(10)
  );
}

function getGeometryReferencePoint(geo: Geometry): [number, number] | null {
  if (geo.type === "markpoint" || geo.type === "quest" || geo.type === "recon") {
    return geo.position;
  }
  if ((geo.type === "zone" || geo.type === "line" || geo.type === "waypoints" || geo.type === "border") && geo.points.length > 0) {
    return geo.points[0];
  }
  if (geo.type === "circle") {
    return geo.center;
  }
  return null;
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

function DetailedWaypoints({
	points,
  pointNames,
  pointGroundFt,
  pointGroundFtSet,
  unitSystem,
  edit,
  onRename,
  onUpdatePointGround,
}: {
	points: [number, number][];
  pointNames?: string[];
  pointGroundFt?: number[];
  pointGroundFtSet?: boolean[];
  unitSystem: UnitSystem;
  edit?: boolean;
  onRename?: (index: number, value: string) => void;
  onUpdatePointGround?: (index: number, groundFt: number) => void;
}) {
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState<number | null>(null);
  const [groundDrafts, setGroundDrafts] = useState<Record<number, string>>({});

  useEffect(() => {
    if (points.length === 0) {
      setSelectedWaypointIndex(null);
      return;
    }
    if (
      selectedWaypointIndex === null ||
      selectedWaypointIndex < 0 ||
      selectedWaypointIndex >= points.length
    ) {
      setSelectedWaypointIndex(0);
    }
  }, [points.length, selectedWaypointIndex]);

  const formatDistance = (distanceNm: number) =>
    unitSystem === UnitSystem.IMPERIAL
      ? `${distanceNm.toFixed(1)}nm`
      : `${(distanceNm * 1.852).toFixed(1)}km`;

  const renderSegment = (
    label: string,
    fromPoint: [number, number],
    toPoint: [number, number]
  ) => {
    const trueBearing = getWaypointBearing(fromPoint, toPoint);
    const magneticBearing = getWaypointMagneticBearing(trueBearing);
    const distance = getFlyDistance(fromPoint, toPoint);
    return (
      <div className="text-xs text-gray-700">
        {label}: {magneticBearing.toString().padStart(3, "0")}°M /{" "}
        {trueBearing.toString().padStart(3, "0")}°T /{" "}
        {formatDistance(distance)}
      </div>
    );
  };

  const getDisplayGroundValue = (index: number): string => {
    const ft = pointGroundFt?.[index];
    if (typeof ft !== "number") return "";
    const value = unitSystem === UnitSystem.IMPERIAL ? ft : ft * 0.3048;
    return Math.round(value).toString();
  };

  const submitPointGround = (index: number) => {
    if (!onUpdatePointGround) return;
    const raw = (groundDrafts[index] ?? "").trim().replace(",", ".");
    if (!raw) return;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return;
    const nextFt =
      unitSystem === UnitSystem.IMPERIAL ? parsed : parsed / 0.3048;
    onUpdatePointGround(index, Math.round(nextFt));
  };

	return <div className="overflow-y-scroll">{points.map((point, index) => {
      const waypointName = pointNames?.[index] ?? `WPT#${index}`;
      const isSelected = selectedWaypointIndex === index;
      const prevPoint = index > 0 ? points[index - 1] : null;
      const nextPoint = index < points.length - 1 ? points[index + 1] : null;
      const pointGroundRaw = pointGroundFt?.[index];
      const hasPointGround = typeof pointGroundRaw === "number";
      const inputValue = groundDrafts[index] ?? getDisplayGroundValue(index);
      const pointGroundSetFlag = pointGroundFtSet?.[index];
      // Backward compatibility: old persisted rows may have a value
      // without an explicit "set by user" flag.
      const resolvedByUser =
        pointGroundSetFlag === true || (pointGroundSetFlag === undefined && hasPointGround);
		return (
        <div
          key={`waypoint-${index}`}
          style={{borderTop:"1px solid black"}}
          className={classNames("p-1 cursor-pointer", { "bg-yellow-100": isSelected })}
          onClick={() => setSelectedWaypointIndex(index)}
        >
          <div style={{textDecoration: "underline"}}>
            {edit ? (
              <input
                className="p-0.5 text-right rounded-sm"
                value={waypointName}
                onChange={(e) => onRename && onRename(index, e.target.value)}
              />
            ) : (
              <span>{waypointName}</span>
            )}
            <br/>
          </div>
          <DetailedCoords coords={point}/>
          <div className="text-xs mt-1">
            Ground point ({unitSystem === UnitSystem.IMPERIAL ? "ft" : "m"}):{" "}
            {edit ? (
              <input
                className={classNames("p-0.5 text-right rounded-sm w-24", {
                  "ring-red-600 ring":
                    inputValue.trim() !== "" &&
                    Number.isNaN(Number(inputValue.replace(",", "."))),
                })}
                value={inputValue}
                onChange={(e) =>
                  setGroundDrafts((prev) => ({ ...prev, [index]: e.target.value }))
                }
                onBlur={() => submitPointGround(index)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitPointGround(index);
                }}
              />
            ) : (
              <span>
                {hasPointGround ? inputValue : "-"}
                {hasPointGround && !resolvedByUser ? " (auto)" : ""}
              </span>
            )}
          </div>
          {isSelected && (
            <div className="mt-1 border-t border-gray-300 pt-1">
              {prevPoint && renderSegment("Prev -> this", prevPoint, point)}
              {nextPoint && renderSegment("This -> next", point, nextPoint)}
            </div>
          )}
        </div>
      )
	})}</div>
}

function DetailedDescription({
	description,
}: {
	description: Array<string>;
}) {
	return (<div>
				<div>
					{description.map((text) => {
						return (<div>{text}</div>)
					})}
				</div>
			</div>)
}


function DetailedTask({
	task,
	edit,
	id,
	store
}: {
	task: any;
	edit: any;
	id: any;
	store: any;
}) {
	const [isOpen, setIsOpen] = useState(Array(task.length).fill(false));
	const [isOpenTop, setIsOpenTop] = useState(false);
	const [isChecked, setIsChecked] = useState(false);
	const is_editor = serverStore((state) => state?.server?.is_editor);
	const discord_id = serverStore((state) => state?.server?.discord_id);
	return (
				<div className="flex flex-col">
					{task.map((singleTask:any, i:any) => {
						var is_intask = false;
						singleTask.players.map((player:any) => {
													if (player.id === Number(discord_id)){is_intask = true};
												});
						
						return (singleTask.data.fields.status !== "Deleted" && (<div className="my-2">
									<div className="flex gap-1 max-h-72 overflow-auto">
										<div className="flex flex-col flex-grow">
											<button className={classNames("bg-indigo-100 hover:border-indigo-300 hover:bg-indigo-200 border-indigo-200 border rounded-sm p-1", { "bg-indigo-200 border-indigo-300": isOpen[i] === true })}
													onClick={() => {
																		if (isOpen[i] === true) {
																			isOpen[i] = false;
																			setIsOpen(isOpen)
																		} else {
																			isOpen.fill(false);
																			isOpen[i] = true;
																			setIsOpen(isOpen)
																		};
																		isOpenTop ? setIsOpenTop(false) : setIsOpenTop(true);
																	}}
											>
												<span className="pr-2">
																{edit ? (<span><span>Task </span><span><input
																			className="flex-grow p-0.5"
																			value={singleTask.data.title}
																			onChange={(e) => {
																				const newSingleTask = singleTask
																				newSingleTask.data.title = e.target.value
																				task[i] = newSingleTask
																				updateGeometrySafe(id, { task: task });
																			}}
																		  /></span><span> :</span></span>) : (<span>Task {singleTask.data.title} :</span>)}
								
												</span>
												<span className="select-text font-mono">{singleTask.players.length}/{singleTask.data.fields.max_flight}</span>
											</button>
										</div>
										{!edit && store !== "undo" && store !== "local" && store !== "updated" && (<button title="Enrollment" onClick={() => {
																	const task_id = singleTask.id;
																	//console.log(task_id);
																	updateGeometrySafe(id, {store:"undo", timeStamp: new Date("01 January 2001 00:01 UTC").toISOString() });
																	fetch(window.location.href.concat('/taskenrolment'), {
																		headers: {
																		  'Accept': 'application/json',
																		  'Content-Type': 'application/json'
																		},
																		method: "POST",
																		body: JSON.stringify({"TaskId":task_id})
																	})
																	.then(function(res){ console.log(res) })
																	.catch(function(res){ console.log(res) });
																	isChecked ? setIsChecked(false) : setIsChecked(true);
														}}
										>
											{is_intask && (<div className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"><BiCheckSquare className="inline-block w-4 h-4"/></div>)}
											{!is_intask && (<div className="border bg-blue-300 border-blue-600 p-1 rounded-sm shadow-sm flex flex-row items-center"><BiCheckbox className="inline-block w-4 h-4"/></div>)}
										</button>)}
										{!edit && store === "undo" && (<button title="Waiting..." onClick={() => {
														}}
										>
											<div className="border bg-grey-300 border-grey-600 p-1 rounded-sm shadow-sm flex flex-row items-center"><BiLoader className="inline-block w-4 h-4"/></div>
										</button>)}
										{!edit && (store === "updated" || store === "local") && (<button title="Send or undo update to allow enrollment" onClick={() => {
														}}
										>
											<div className="border bg-grey-300 border-grey-600 p-1 rounded-sm shadow-sm flex flex-row items-center"><BiMinusCircle className="inline-block w-4 h-4"/></div>
										</button>)}
										{edit && (<button title="Delete task" onClick={() => {
																const newSingleTask = singleTask;
																newSingleTask.data.fields.status = "Deleted"
																task[i] = newSingleTask;
																updateGeometrySafe(id, { task: task });
														}}
										>
											<div className="border bg-red-300 border-red-600 p-1 rounded-sm shadow-sm flex flex-row items-center"><BiSolidTrash className="inline-block w-4 h-4"/></div>
										</button>)}
									</div>		 					
									<UnmountClosed className="flex flex-col" isOpened={isOpen[i]}>
										<div className="border rounded-sm border-indigo-300">
											<div className="flex flex-row w-full pl-1">
												<span className="pr-2 flex-grow">Desc.:</span>					
												{edit ? (<span className="">
														  <textarea 
															rows={5}
															className="flex-grow p-0.5 scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-300"
															value={singleTask.data.fields.description.join('\n')}
															onChange={(e) => {
																const newSingleTask = singleTask;
																newSingleTask.data.fields.description = e.target.value.split("\n");
																task[i] = newSingleTask;
																updateGeometrySafe(id, { task: task });
															}}
														  />
														</span>) : (<span className="">
																	{singleTask.data.fields.description.map((text:any) => {
																		return (<div>{text}</div>)
																	})}
																</span>)
												}
											</div>
											<div className="flex flex-row w-full pl-1">
												<span className="pr-2 flex-grow">Players :</span>
												<span className="">
													{singleTask.players.map((player:any) => {
														return (<div>{player.name}</div>)
													})}
												</span>
											</div>
										</div>
									</UnmountClosed>
								</div>))
					})}
					{edit && <button className={classNames("bg-indigo-100 hover:border-indigo-300 hover:bg-indigo-200 border-indigo-200 border rounded-sm p-1")}
									onClick={() => {
														updateGeometrySafe(id, { task: [...task, {"id":0, "data":{"title":"", "fields": {"max_flight": 99, "description":[], "status":"Active"}}, "players":[]}]});
													}}
							>
								<span className="pr-2">New task</span>
							</button>}
				</div>)
}


async function submitGeometry(geo:Geometry, typeSubmit:string) {
	if (typeSubmit === "delete" && geo.store === "local") {
		deleteGeometry(geo.id);
	} else {
		const isAuthenticated = !!serverStore.getState().server?.discord_id;
		if (!isAuthenticated) {
			alert("Discord authentication is required to modify points.");
			return;
		}
		var body
		if (geo.type === "markpoint") {
			body = JSON.stringify({"Type":"markpoint","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar,"PosPoint":geo.position, "PosMGRS":mgrs.forward([geo.position[1], geo.position[0]]), "Points":[], "Center":[], "Radius":0, "Screenshot":geo.screenshot, "Side": geo.coalition, "Color": geo.color, "Description":geo.description, "TimeStamp": geo.timeStamp, "Status": geo.status, "Clickable":geo.clickable, "Hidden":geo.hidden, "GroundFt":geo.groundFt, "GroundFtSet":geo.groundFtSet, "TypeSubmit":typeSubmit})
		} else if (geo.type === "zone") {
			body = JSON.stringify({"Type":"zone","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar, "PosPoint":[], "PosMGRS":"", "Points":geo.points, "Center":[], "Radius":0, "Screenshot":geo.screenshot, "Side": geo.coalition, "Color": geo.color, "Description":geo.description, "TimeStamp": geo.timeStamp, "Status": geo.status, "Clickable":geo.clickable, "Hidden":geo.hidden, "GroundFt":geo.groundFt, "GroundFtSet":geo.groundFtSet, "TypeSubmit":typeSubmit})
		} else if (geo.type === "waypoints") {
			body = JSON.stringify({"Type":"waypoints","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar,"PosPoint":[], "PosMGRS":"", "Points":geo.points, "PointNames":geo.pointNames, "PointGroundFt":geo.pointGroundFt, "PointGroundFtSet":geo.pointGroundFtSet, "Center":[], "Radius":0, "Screenshot":geo.screenshot, "Side": geo.coalition, "Color": geo.color, "Description":geo.description, "TimeStamp": geo.timeStamp, "Status": geo.status, "Clickable":geo.clickable, "Hidden":geo.hidden, "GroundFt":geo.groundFt, "GroundFtSet":geo.groundFtSet, "TypeSubmit":typeSubmit})
		} else if (geo.type === "line") {
			body = JSON.stringify({"Type":"line","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar,"PosPoint":[], "PosMGRS":"", "Points":geo.points, "Center":[], "Radius":0, "Screenshot":geo.screenshot, "Side": geo.coalition, "Color": geo.color, "Description":geo.description, "TimeStamp": geo.timeStamp, "Status": geo.status, "Clickable":geo.clickable, "Hidden":geo.hidden, "GroundFt":geo.groundFt, "GroundFtSet":geo.groundFtSet, "TypeSubmit":typeSubmit})
		} else if (geo.type === "circle") {
			body = JSON.stringify({"Type":"circle","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar,"PosPoint":[], "PosMGRS":"", "Points":[], "Center":geo.center, "Radius":geo.radius, "Screenshot":geo.screenshot, "Side": geo.coalition, "Color": geo.color, "Description":geo.description, "TimeStamp": geo.timeStamp, "Status": geo.status, "Clickable":geo.clickable, "Hidden":geo.hidden, "GroundFt":geo.groundFt, "GroundFtSet":geo.groundFtSet, "TypeSubmit":typeSubmit})
		} else if (geo.type === "recon") {
			body = JSON.stringify({"Type":"recon","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar,"PosPoint":geo.position, "PosMGRS":mgrs.forward([geo.position[1], geo.position[0]]), "Points":[], "Center":[], "Radius":0, "Screenshot":geo.screenshot, "Side": geo.coalition, "Color": geo.color, "Description":geo.description, "TimeStamp": geo.timeStamp, "Status": geo.status, "Clickable":geo.clickable, "Hidden":geo.hidden, "GroundFt":geo.groundFt, "GroundFtSet":geo.groundFtSet, "TypeSubmit":typeSubmit})
		} else if (geo.type === "quest") {
			body = JSON.stringify({"Type":"quest","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar,"PosPoint":geo.position, "PosMGRS":mgrs.forward([geo.position[1], geo.position[0]]), "Points":[], "Center":[], "Radius":0, "Screenshot":geo.screenshot, "Side": geo.coalition, "Color": geo.color, "Description":geo.description, "TimeStamp": geo.timeStamp, "Status": geo.status, "Clickable":geo.clickable, "Hidden":geo.hidden, "GroundFt":geo.groundFt, "GroundFtSet":geo.groundFtSet, "TaskUpdated":geo.task, "TypeSubmit":typeSubmit})
		}
		const response  = await fetch(window.location.href.concat('/share'), {
			headers: {
			  'Accept': 'application/json',
			  'Content-Type': 'application/json'
			},
			method: "POST",
			body: body
		})
		if (!response.ok) {
			alert("Update denied. Please authenticate with Discord.");
			return;
		}
		const submitResponse = await response.json();
		if (submitResponse) {
			const NewId = submitResponse.Id;
			const OldId = geo.id;
			if (typeSubmit === "delete") {
				updateGeometrySafe(OldId, { clickable: false });
				setSelectedGeometry(null);
			}
			else if (OldId !== NewId) {
				geo.id = NewId;
				updateGeometry(geo);
				deleteGeometry(OldId);
			}
		} else {
			console.log("Submit error");
		}
	}
			
	return;
}

function GeometryDetails({ geo, edit }: { geo: Geometry; edit: boolean }) {
  const unitSystem = settingsStore((state) => state.unitSystem || UnitSystem.IMPERIAL);
  const initialColor = geo.color && /^#[0-9A-Fa-f]{6}$/.test(geo.color) ? geo.color : "#0068FF";
  const [pickerColor, setPickerColor] = useColor(initialColor);
  const [coordDMS, setCoordDMS] = useState<string>("");
  const [coordDDM, setCoordDDM] = useState<string>("");
  const [coordMGRS, setCoordMGRS] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);
  const [isOpenDesc, setIsOpenDesc] = useState(true);
  const [autoGroundFt, setAutoGroundFt] = useState<number | null>(null);
  const [groundInput, setGroundInput] = useState<string>("");
  const [picture, setPicture] = useState<{ picturePreview: string; pictureAsFiles: FileList | null }>({
    picturePreview: "",
    pictureAsFiles: null,
  });
  const url = new URL(window.location.href)
  const editablePointPosition =
    geo.type === "markpoint" || geo.type === "quest" ? geo.position : null;
  const screenshotCount = Array.isArray(geo.screenshot)
    ? geo.screenshot.filter((s) => !!s).length
    : 0;
  const referencePoint = getGeometryReferencePoint(geo);
  const hasUserGroundFt =
    (geo.groundFtSet === true ||
      (geo.groundFtSet === undefined &&
        typeof geo.groundFt === "number" &&
        geo.groundFt > 0)) &&
    typeof geo.groundFt === "number";
  const effectiveGroundFt = hasUserGroundFt ? geo.groundFt : autoGroundFt;
  
  const uploadPicture = (e:any) => {
    setPicture({
		  picturePreview: URL.createObjectURL(e.target.files[0]),
		  pictureAsFiles: e.target.files,
		});
	
  };

  const setImageAction = async (event:any) => {
    event.preventDefault();
    if (!picture.pictureAsFiles || picture.pictureAsFiles.length === 0) return;

    const formData = new FormData();
	for(let i = 0; i < picture.pictureAsFiles.length; i++) {
		formData.append('attachments', picture.pictureAsFiles[i]);
    }

    const response  = await fetch(url.origin.concat('/upload'), {
		method: "post",
		body: formData,
    });
    const uploadedImage = await response.json();
    if (uploadedImage) {	
		let files:string[] = [];
		uploadedImage.Files.forEach((file:any) => {
			files.push("$CURRENT_SERV".concat('/files/').concat(file));
		});
		updateGeometrySafe(geo.id, { screenshot: [...geo.screenshot, ...files] });
    setPicture({ picturePreview: "", pictureAsFiles: null });
    } else {
		console.log("Upload error");
    }
  };

  const removeScreenshotAtIndex = (index: number) => {
    const nextScreenshots = geo.screenshot.filter((_, i) => i !== index);
    updateGeometrySafe(geo.id, { screenshot: nextScreenshots });
    if (imgIndex >= nextScreenshots.length) {
      setImgIndex(Math.max(0, nextScreenshots.length - 1));
    }
  };

  const moveScreenshot = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= geo.screenshot.length || fromIndex === toIndex) {
      return;
    }
    const nextScreenshots = [...geo.screenshot];
    const [moved] = nextScreenshots.splice(fromIndex, 1);
    nextScreenshots.splice(toIndex, 0, moved);
    updateGeometrySafe(geo.id, { screenshot: nextScreenshots });

    if (imgIndex === fromIndex) {
      setImgIndex(toIndex);
    } else if (fromIndex < imgIndex && toIndex >= imgIndex) {
      setImgIndex(imgIndex - 1);
    } else if (fromIndex > imgIndex && toIndex <= imgIndex) {
      setImgIndex(imgIndex + 1);
    }
  };
  
  useEffect(() => {
    if (!edit || !editablePointPosition) return;
    setCoordDMS(formatDMS(editablePointPosition));
    setCoordDDM(formatDDM(editablePointPosition));
    setCoordMGRS(formatMgrsForInput(editablePointPosition));
  }, [edit, editablePointPosition?.[0], editablePointPosition?.[1]]);

  useEffect(() => {
    if (hasUserGroundFt) {
      setAutoGroundFt(null);
      return;
    }
    if (!referencePoint) {
      setAutoGroundFt(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const [lat, lon] = referencePoint;
        const response = await fetch(route(`/elevation?lat=${lat}&lon=${lon}`), {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (typeof payload.elevation_m !== "number") return;
        const fetchedFt = Math.round(payload.elevation_m * 3.28084);
        setAutoGroundFt(fetchedFt);
        updateGeometryComputed(geo.id, { groundFt: fetchedFt, groundFtSet: false });
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setAutoGroundFt(null);
        }
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [geo.id, geo.groundFt, geo.groundFtSet, hasUserGroundFt, referencePoint?.[0], referencePoint?.[1]]);

  useEffect(() => {
    if (geo.type !== "waypoints") return;
    if (!geo.points || geo.points.length === 0) return;

    const pointGroundFt = geo.pointGroundFt || [];
    const pointGroundFtSet = geo.pointGroundFtSet || [];
    const unresolvedIndexes = geo.points
      .map((_, index) => index)
      .filter(
        (index) =>
          pointGroundFtSet[index] === undefined && typeof pointGroundFt[index] !== "number"
      );

    if (unresolvedIndexes.length === 0) return;

    let cancelled = false;
    const controller = new AbortController();

    const fetchGrounds = async () => {
      const nextGrounds = [...pointGroundFt];
      const nextSets = [...pointGroundFtSet];

      for (const index of unresolvedIndexes) {
        const [lat, lon] = geo.points[index];
        try {
          const response = await fetch(route(`/elevation?lat=${lat}&lon=${lon}`), {
            signal: controller.signal,
          });
          if (!response.ok) {
            // Prevent endless retries on persistent failures for this point.
            nextSets[index] = false;
            continue;
          }
          const payload = await response.json();
          if (typeof payload.elevation_m !== "number") {
            // Water/no-data: mark as auto-resolved without altitude.
            nextSets[index] = false;
            continue;
          }
          nextGrounds[index] = Math.round(payload.elevation_m * 3.28084);
          nextSets[index] = false;
        } catch (err: any) {
          if (err?.name === "AbortError") return;
        }
      }

      if (cancelled) return;
      updateGeometryComputed(geo.id, {
        pointGroundFt: nextGrounds,
        pointGroundFtSet: nextSets,
      } as Partial<Geometry>);
    };

    fetchGrounds();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    geo.id,
    geo.type,
    geo.type === "waypoints" ? geo.points : undefined,
    geo.type === "waypoints" ? geo.pointGroundFt : undefined,
    geo.type === "waypoints" ? geo.pointGroundFtSet : undefined,
  ]);

  useEffect(() => {
    if (effectiveGroundFt === null || effectiveGroundFt === undefined) {
      setGroundInput("");
      return;
    }
    const displayValue =
      unitSystem === UnitSystem.IMPERIAL
        ? effectiveGroundFt
        : effectiveGroundFt * 0.3048;
    setGroundInput(displayValue.toFixed(0));
  }, [effectiveGroundFt, unitSystem, geo.id]);

  const submitCoordUpdate = (rawCoord: string) => {
    const parsed = maybeParseCoord(rawCoord);
    if (!parsed) return;
    updateGeometrySafe(geo.id, { position: parsed });
    setCoordDMS(formatDMS(parsed));
    setCoordDDM(formatDDM(parsed));
    setCoordMGRS(formatMgrsForInput(parsed));
  };

  const submitGroundUpdate = () => {
    const raw = groundInput.trim().replace(",", ".");
    if (!raw) return;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return;
    const nextFt =
      unitSystem === UnitSystem.IMPERIAL ? parsed : parsed / 0.3048;
    const roundedFt = Math.round(nextFt);
    updateGeometrySafe(geo.id, { groundFt: roundedFt, groundFtSet: true });
    setAutoGroundFt(roundedFt);
  };

  return (
    <>
      <div className="flex flex-row flex-grow w-full">
        <span className="pr-2 flex-grow">Name</span>
        {edit ? (
          <input
            className="flex-grow p-0.5 text-right"
            value={geo.name}
            onChange={(e) => {
				updateGeometrySafe(geo.id, { name: e.target.value });
            }}
          />
        ) : (
          geo.name
        )}
      </div>
	  <div className="flex flex-row flex-grow w-full">
        <span className="pr-2 flex-grow">Created by</span>
		<span className="pr-2">{geo.discordName}</span>
		<ReactRoundedImage image={geo.avatar} imageWidth="30" imageHeight="30" roundedSize="3"/>
      </div>
	  <div className="flex flex-row flex-grow w-full">
        <span className="pr-2 flex-grow">Date</span>
		<span className="pr-2">{geo.timeStamp}</span>
      </div>
      <div className="flex flex-row flex-grow w-full items-center">
        <span className="pr-2 flex-grow">
          Ground ({unitSystem === UnitSystem.IMPERIAL ? "ft" : "m"})
        </span>
        {edit ? (
          <input
            className={classNames("flex-grow p-0.5 text-right rounded-sm", {
              "ring-red-600 ring":
                groundInput.trim() !== "" &&
                Number.isNaN(Number(groundInput.replace(",", "."))),
            })}
            value={groundInput}
            onChange={(e) => setGroundInput(e.target.value)}
            onBlur={submitGroundUpdate}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitGroundUpdate();
            }}
          />
        ) : (
          <span className="pr-2">
            {effectiveGroundFt !== null && effectiveGroundFt !== undefined
              ? unitSystem === UnitSystem.IMPERIAL
                ? `${Math.round(effectiveGroundFt)}ft`
                : `${Math.round(effectiveGroundFt * 0.3048)}m`
              : "-"}
            {effectiveGroundFt !== null &&
            effectiveGroundFt !== undefined &&
            !hasUserGroundFt
              ? " (auto)"
              : ""}
          </span>
        )}
      </div>
	  {edit && (
		<div className="flex flex-col flex-grow w-full">
			<span className="pr-2 flex-grow">Color</span>
			<ColorPicker
				color={pickerColor}
				hideInput={["rgb", "hsv"]}
				height={72}
				onChange={(newColor) => {
					setPickerColor(newColor);
					updateGeometrySafe(geo.id, { color: newColor.hex });
				}}
			/>
		</div>
	  )}
	  {geo.type === "waypoints" && (
        <DetailedWaypoints
          points={geo.points}
          pointNames={geo.pointNames}
          pointGroundFt={geo.pointGroundFt}
          pointGroundFtSet={geo.pointGroundFtSet}
          unitSystem={unitSystem}
          edit={edit}
          onRename={(index, value) => {
            const next = [...(geo.pointNames || geo.points.map((_, idx) => `WPT#${idx}`))];
            next[index] = value;
            updateGeometrySafe(geo.id, { pointNames: next });
          }}
          onUpdatePointGround={(index, groundFt) => {
            const nextGroundFt = [...(geo.pointGroundFt || [])];
            const nextGroundFtSet = [...(geo.pointGroundFtSet || [])];
            nextGroundFt[index] = groundFt;
            nextGroundFtSet[index] = true;
            updateGeometrySafe(geo.id, {
              pointGroundFt: nextGroundFt,
              pointGroundFtSet: nextGroundFtSet,
            } as Partial<Geometry>);
          }}
        />
      )}
      {(geo.type === "markpoint" || geo.type === "quest") && !edit && <DetailedCoords coords={geo.position} />}
      {(geo.type === "markpoint" || geo.type === "quest") && edit && (
        <>
          <div className="flex flex-row flex-grow w-full">
            <span className="pr-2 flex-grow">DMS</span>
            <input
              className={classNames("flex-grow p-0.5 text-right rounded-sm", {
                "ring-red-600 ring": coordDMS && maybeParseCoord(coordDMS) === null,
              })}
              value={coordDMS}
              onChange={(e) => setCoordDMS(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCoordUpdate(coordDMS);
              }}
            />
          </div>
          <div className="flex flex-row flex-grow w-full">
            <span className="pr-2 flex-grow">DDM</span>
            <input
              className={classNames("flex-grow p-0.5 text-right rounded-sm", {
                "ring-red-600 ring": coordDDM && maybeParseCoord(coordDDM) === null,
              })}
              value={coordDDM}
              onChange={(e) => setCoordDDM(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCoordUpdate(coordDDM);
              }}
            />
          </div>
          <div className="flex flex-row flex-grow w-full">
            <span className="pr-2 flex-grow">MGRS</span>
            <input
              className={classNames("flex-grow p-0.5 text-right rounded-sm", {
                "ring-red-600 ring": coordMGRS && maybeParseCoord(coordMGRS) === null,
              })}
              value={coordMGRS}
              onChange={(e) => setCoordMGRS(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCoordUpdate(coordMGRS);
              }}
            />
          </div>
        </>
      )}
	  {geo.type === "recon" && <DetailedCoords coords={geo.position} />}
	  {geo.type === "recon" && geo.screenshot[10] && (
			<div className="relative w-72 cursor-pointer" onClick={() => {if (!geo.screenshot[imgIndex]) setImgIndex(0); setIsOpen(true)}}>
				<img src={geo.screenshot[0].replace("$CURRENT_SERV", url.origin)} />
        {screenshotCount > 0 && (
          <span className="absolute bottom-1 right-1 rounded-sm bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white">
            {screenshotCount}
          </span>
        )}
			</div>
	  )}
		{geo.type === "recon" && geo.screenshot[0] && isOpen && (
			<Lightbox
				//plugins={[Counter, Download, Fullscreen, Thumbnails, Video]}
				mainSrc={geo.screenshot[imgIndex].replace("$CURRENT_SERV", url.origin)}
				nextSrc={geo.screenshot[(imgIndex + 1) % geo.screenshot.length].replace("$CURRENT_SERV", url.origin)}
				prevSrc={geo.screenshot[(imgIndex + geo.screenshot.length - 1) % geo.screenshot.length].replace("$CURRENT_SERV", url.origin)}
				onCloseRequest={() => setIsOpen(false)}
				onMovePrevRequest={() =>
					setImgIndex((imgIndex + geo.screenshot.length - 1) % geo.screenshot.length)
				}
				onMoveNextRequest={() => setImgIndex((imgIndex + 1) % geo.screenshot.length)}
			/>
		)}
		

		{edit &&
			<div className="my-2 flex gap-1">
				<div className="flex flex-col flex-grow">
					<button className="bg-indigo-100 border-indigo-200 border rounded-sm p-1">
						Upload pictures
					</button>
					<div className="border rounded-sm border-indigo-300">
						<form onSubmit={setImageAction}>
							<input type="file" name="image" onChange={uploadPicture} multiple={true}/>
							<br />
							{picture.pictureAsFiles && picture.pictureAsFiles.length > 0 &&
								<button type="submit" name="upload" className="bg-blue-100 border-blue-200 border rounded-sm p-1 items-center w-full">
									Upload
									<BiUpload className="ml-2 inline-block"/> 
								</button>
							}
							{(!picture.pictureAsFiles || picture.pictureAsFiles.length === 0) &&
								<div>
									<br />
								</div>
							}
						</form>
					</div>
          {geo.screenshot.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 border rounded-sm border-indigo-300 p-2">
              {geo.screenshot.map((imagePath, index) => (
                <div key={`${imagePath}-${index}`} className="relative">
                  <img
                    src={imagePath.replace("$CURRENT_SERV", url.origin)}
                    className="h-16 w-16 cursor-pointer rounded-sm object-cover border border-indigo-200"
                    onClick={() => {
                      setImgIndex(index);
                      setIsOpen(true);
                    }}
                  />
                  <button
                    type="button"
                    className="absolute right-0 top-0 rounded-bl-sm bg-red-500 px-1 text-xs text-white"
                    onClick={() => removeScreenshotAtIndex(index)}
                    title="Remove image"
                  >
                    x
                  </button>
                  <div className="absolute bottom-0 left-0 flex">
                    <button
                      type="button"
                      className="rounded-tr-sm bg-black/70 px-1 text-xs text-white disabled:opacity-40"
                      onClick={() => moveScreenshot(index, index - 1)}
                      title="Move left"
                      disabled={index === 0}
                    >
                      {"<"}
                    </button>
                    <button
                      type="button"
                      className="bg-black/70 px-1 text-xs text-white disabled:opacity-40"
                      onClick={() => moveScreenshot(index, index + 1)}
                      title="Move right"
                      disabled={index === geo.screenshot.length - 1}
                    >
                      {">"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
				</div>
			</div>
		}
		{geo.type && (edit || geo.screenshot[0] || geo.description[0]) &&
			<div>
				<div className="my-2 flex gap-1">
					<div className="flex flex-col flex-grow">
						<button className={classNames("bg-indigo-100 hover:border-indigo-300 hover:bg-indigo-200 border-indigo-200 border rounded-sm p-1", { "bg-indigo-200 border-indigo-300": isOpenDesc === true })}
								onClick={() => {isOpenDesc ? setIsOpenDesc(false) : setIsOpenDesc(true);}}
						>
								Description
						</button>

						<UnmountClosed className="flex flex-col" isOpened={isOpenDesc}>
							<div className="border rounded-sm border-indigo-300">
								<div className="relative w-72 cursor-pointer" onClick={() => {if (!geo.screenshot[imgIndex]) setImgIndex(0); setIsOpen(true)}}>
									{geo.screenshot[0] && (<img src={geo.screenshot[0].replace("$CURRENT_SERV", url.origin)}/>)}
                  {geo.screenshot[0] && screenshotCount > 0 && (
                    <span className="absolute bottom-1 right-1 rounded-sm bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white">
                      {screenshotCount}
                    </span>
                  )}
								</div>
								{isOpen && (
									<Lightbox
										mainSrc={geo.screenshot[imgIndex].replace("$CURRENT_SERV", url.origin)}
										nextSrc={geo.screenshot[(imgIndex + 1) % geo.screenshot.length].replace("$CURRENT_SERV", url.origin)}
										prevSrc={geo.screenshot[(imgIndex + geo.screenshot.length - 1) % geo.screenshot.length].replace("$CURRENT_SERV", url.origin)}
									  onCloseRequest={() => setIsOpen(false)}
									  onMovePrevRequest={() =>
										setImgIndex((imgIndex + geo.screenshot.length - 1) % geo.screenshot.length)
									  }
									  onMoveNextRequest={() => setImgIndex((imgIndex + 1) % geo.screenshot.length)}
									/>
								)}
								{edit ? (<div className="flex flex-row flex-grow w-full">
										  <textarea 
										    rows={5}
											className="flex-grow p-0.5 scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-300"
											value={geo.description.join('\n')}
											onChange={(e) => {
											  updateGeometrySafe(geo.id, { description: e.target.value.split("\n") });
											}}
										  />
									</div>) : (<DetailedDescription description={geo.description}/>)
								}
							</div>
						</UnmountClosed>
					</div>
				</div>
				{geo.type === "quest" && <DetailedTask task={geo.task} edit={edit} id={geo.id} store={geo.store}/>}
			</div>
		}
    </>
  );
}

export default function MapGeometryInfo({ map }: { map: maptalks.Map }) {
  const selectedGeometry = geometryStore((state) =>
    state.selectedGeometry !== null
      ? state.geometry.get(state.selectedGeometry)
      : undefined
  );
  const [renderGeometry, setRenderGeometry] = useState<Geometry | undefined>(selectedGeometry);
  const [panelPhase, setPanelPhase] = useState<"idle" | "leaving" | "entering">("idle");
  const [editing, setEditing] = useState(false);
  const isAuthenticated = !!serverStore((state) => state?.server?.discord_id);
  const editor_mode_on = serverStore((state) => state?.editor_mode_on);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PANEL_ANIMATION_MS = 180;

  useEffect(() => {
    setEditing(false);
  }, [renderGeometry?.id]);

  useEffect(() => {
	if (!isAuthenticated) {
		setEditing(false);
	}
  }, [isAuthenticated]);

  // Keep rendered object data in sync (same id), without replaying panel transition.
  useEffect(() => {
    if (!selectedGeometry || !renderGeometry) return;
    if (selectedGeometry.id !== renderGeometry.id) return;
    if (selectedGeometry !== renderGeometry) {
      setRenderGeometry(selectedGeometry);
    }
  }, [selectedGeometry, renderGeometry]);

  useEffect(() => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }

    const selectedGeometryId = selectedGeometry?.id ?? null;
    const renderGeometryId = renderGeometry?.id ?? null;

    // Nothing to do if we still render the same object.
    if (selectedGeometryId === renderGeometryId) {
      return;
    }

    // First open: animate from left.
    if (!renderGeometry && selectedGeometry) {
      setRenderGeometry(selectedGeometry);
      setPanelPhase("entering");
      requestAnimationFrame(() => setPanelPhase("idle"));
      return;
    }

    if (!renderGeometry && !selectedGeometry) {
      return;
    }

    // Switch or close: old panel leaves left, then new arrives from left.
    setPanelPhase("leaving");
    transitionTimerRef.current = setTimeout(() => {
      setRenderGeometry(selectedGeometry);
      if (selectedGeometry) {
        setPanelPhase("entering");
        requestAnimationFrame(() => setPanelPhase("idle"));
      } else {
        setPanelPhase("idle");
      }
    }, PANEL_ANIMATION_MS);
  }, [selectedGeometry?.id, renderGeometry?.id]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!renderGeometry) return () => {};
    const layer = map.getLayer("custom-geometry") as maptalks.VectorLayer;
	const layerQuest = map.getLayer("quest-pin") as maptalks.VectorLayer;
    var item = layer.getGeometryById(
		renderGeometry.id
    ) as maptalks.GeometryCollection;
	if (item === null) {
		item = layerQuest.getGeometryById(
			renderGeometry.id
		) as maptalks.GeometryCollection;
	}
	

    if (!item) return () => {};

    const canEditOnMap = isAuthenticated && editing;
    if (renderGeometry.type === "zone" ||
		renderGeometry.type === "waypoints" ||
		renderGeometry.type === "line" ||
		renderGeometry.type === "circle" ) {
      if (canEditOnMap) {
        item.startEdit();
      } else if (item.isEditing()) {
        item.endEdit();
      }
    } else if (renderGeometry.type !== "quest"){
      item.config("draggable", canEditOnMap);
    }

    return () => {
      if (renderGeometry.type === "zone" ||
		renderGeometry.type === "waypoints" ||
		renderGeometry.type === "line" ||
		renderGeometry.type === "circle" ) {
        if (item.isEditing()) {
          item.endEdit();
        }
      } else {
        item.config("draggable", false);
      }
    };
  }, [editing, renderGeometry?.id, renderGeometry?.type, map, isAuthenticated]);

  useEffect(() => {
    if (!renderGeometry) return;
    if (editor_mode_on) return;
    const hiddenForUser = !!renderGeometry.hidden;
    const deletedForUser = renderGeometry.status === "Deleted";
    const disabledForUser = renderGeometry.clickable === false;
    if (hiddenForUser || deletedForUser || disabledForUser) {
      setEditing(false);
      setSelectedGeometry(null);
    }
  }, [
    renderGeometry?.id,
    renderGeometry?.hidden,
    renderGeometry?.status,
    renderGeometry?.clickable,
    editor_mode_on,
  ]);

  if (!renderGeometry) return <></>;
  const canModify = isAuthenticated && (renderGeometry.status !== "Locked" || editor_mode_on);
  const closeSelectedPanel = (event?: React.SyntheticEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    setEditing(false);
    const layer = map.getLayer("custom-geometry") as maptalks.VectorLayer;
    const layerQuest = map.getLayer("quest-pin") as maptalks.VectorLayer;
    let item = layer.getGeometryById(renderGeometry.id) as maptalks.GeometryCollection | null;
    if (!item) {
      item = layerQuest.getGeometryById(renderGeometry.id) as maptalks.GeometryCollection | null;
    }

    if (item) {
      if (
        item.isEditing() &&
        (renderGeometry.type === "zone" ||
          renderGeometry.type === "waypoints" ||
          renderGeometry.type === "line" ||
          renderGeometry.type === "circle")
      ) {
        item.endEdit();
      } else if (renderGeometry.type !== "quest") {
        item.config("draggable", editing);
      }
    }
    setSelectedGeometry(null);
  };

  return (
    <div
      className={classNames(
        "max-h-full w-80 flex flex-col select-none rounded-sm transition-all",
        { "-translate-x-8 opacity-0": panelPhase === "leaving" || panelPhase === "entering" }
      )}
      style={{ transitionDuration: `${PANEL_ANIMATION_MS}ms` }}
    >
      <div className="p-2 bg-gray-400 text-sm flex flex-row border border-gray-500 shadow">
		{isAuthenticated && editor_mode_on && (renderGeometry.status === "Locked" ? 
					(<button title="Unlock" onClick={() => {
															setEditing(false);
															renderGeometry.status = "Shared";
															updateGeometrySafe(renderGeometry.id, { status: "Shared" });
														}} className="p-1 text-xs bg-red-300 border border-red-400"><BiLock className="inline-block w-4 h-4" /></button>) : 
					(<button title="Lock" onClick={() => {
															setEditing(false);
															renderGeometry.status = "Locked";
															updateGeometrySafe(renderGeometry.id, { status: "Locked" });
														}} className="p-1 text-xs bg-green-300 border border-green-400"><BiLockOpen className="inline-block w-4 h-4" /></button>))}
		{isAuthenticated && editor_mode_on && (renderGeometry.clickable ? 
					(<button title="Disable" onClick={() => {
															setEditing(false);
															renderGeometry.clickable = false;
															updateGeometrySafe(renderGeometry.id, { clickable: false });
														}} className="p-1 text-xs bg-green-300 border border-green-400 ml-2 mr-2"><BiMouseAlt className="inline-block w-4 h-4" /></button>) : 
					(<button title="Enable" onClick={() => {
															setEditing(false);
															renderGeometry.clickable = true;
															updateGeometrySafe(renderGeometry.id, { clickable: true });
														}} className="p-1 text-xs bg-red-300 border border-red-400 ml-2 mr-2"><BiMouseAlt className="inline-block w-4 h-4" /></button>))}
		{isAuthenticated && editor_mode_on && (renderGeometry.hidden ? 
					(<button title="Show" onClick={() => {
															setEditing(false);
															renderGeometry.hidden = false;
															updateGeometrySafe(renderGeometry.id, { hidden: false });
														}} className="p-1 text-xs bg-red-300 border border-red-400 mr-2"><BiHide className="inline-block w-4 h-4" /></button>) : 
					(<button title="Hide" onClick={() => {
															setEditing(false);
															renderGeometry.hidden = true;
															updateGeometrySafe(renderGeometry.id, { hidden: true });
														}} className="p-1 text-xs bg-green-300 border border-green-400 mr-2"><BiShow className="inline-block w-4 h-4" /></button>))}
        <b className="flex flex-grow"> 
          {editor_mode_on && (renderGeometry.type.substring(0,5).concat(' #', renderGeometry.id.toString()))}
        </b>
		{!editing && (renderGeometry.type === "waypoints") && (
          <button
			title="Export to the way" 
            className="p-1 text-xs bg-yellow-300 border border-yellow-400 ml-2"
            onClick={async () => {
				const waypointGeo = renderGeometry;
				const pointGroundFt = [...(waypointGeo.pointGroundFt || [])];
				const pointGroundFtSet = [...(waypointGeo.pointGroundFtSet || [])];

				for (let i = 0; i < waypointGeo.points.length; i++) {
					if (typeof pointGroundFt[i] === "number") continue;
					const [lat, lon] = waypointGeo.points[i];
					try {
						const response = await fetch(route(`/elevation?lat=${lat}&lon=${lon}`));
						if (!response.ok) continue;
						const payload = await response.json();
						if (typeof payload.elevation_m === "number") {
							pointGroundFt[i] = Math.round(payload.elevation_m * 3.28084);
							if (pointGroundFtSet[i] === undefined) {
								pointGroundFtSet[i] = false;
							}
						}
					} catch (_err) {
						// Ignore API errors during export; keep available values only.
					}
				}

				updateGeometryComputed(waypointGeo.id, {
					pointGroundFt,
					pointGroundFtSet,
				} as Partial<Geometry>);

				const waypoints = waypointGeo.points.map((point, counter) => {
					const pointElev =
						typeof pointGroundFt[counter] === "number"
							? Math.round(pointGroundFt[counter] as number)
							: 0;
					return `{"id":${counter},"name":"WP${counter+1}","lat":${point[0]},"long":${point[1]},"elev":${pointElev}}`;
				});
				const data = `[${waypoints.toString()}]`;
				const blob = new Blob([data], { type: "text/plain" });
				saveAs(blob, "exported_waypoints.tw");
            }}
          >
            <BiExport className="inline-block w-4 h-4" />
        </button>
		)}
        {!editing && isAuthenticated && (renderGeometry.store === "local") && (
          <button
			title="Share" 
            className="p-1 text-xs bg-yellow-300 border border-yellow-400 ml-2"
            onClick={() => {
				setEditing(false);
				submitGeometry(renderGeometry, "share");
				setSelectedGeometry(null);
            }}
          >
            <BiMailSend className="inline-block w-4 h-4" />
          </button>
        )}
		{!editing && isAuthenticated && renderGeometry.store === "updated" && canModify && (
          <button
			title="Undo" 
            className="p-1 text-xs bg-yellow-300 border border-yellow-400 ml-2"
            onClick={() => {
				setEditing(false);
				updateGeometrySafe(renderGeometry.id, {store:"undo", timeStamp: new Date("01 January 2001 00:01 UTC").toISOString() });
				fetch(window.location.href.concat('/resend'), {
					headers: {
					  'Accept': 'application/json',
					  'Content-Type': 'application/json'
					},
					method: "POST",
					body: JSON.stringify({"Id":renderGeometry.id})
				})
            }}
          >
            <BiUndo className="inline-block w-4 h-4" />
        </button>
        )}
        {!editing && isAuthenticated && renderGeometry.store === "updated" && canModify && (
          <button
			title="Update" 
            className="p-1 text-xs bg-yellow-300 border border-yellow-400 ml-2"
            onClick={() => {
				setEditing(false);
				submitGeometry(renderGeometry, "update");
				updateGeometrySafe(renderGeometry.id, {store:"undo", timeStamp: new Date("01 January 2001 00:01 UTC").toISOString() });
            }}
          >
            <BiMailSend className="inline-block w-4 h-4" />
          </button>
        )}
        {editing && (
          <button
			title="Stop editing" 
            className="p-1 text-xs bg-green-200 border border-green-500 ml-2"
            onClick={() => {
              setEditing(false);
            }}
          >
            <BiCheck className="inline-block w-4 h-4" />
          </button>
        )}
        {!editing && canModify && (
          <button
			 title="Edit" 
            className="p-1 text-xs bg-green-200 border border-green-500 ml-2"
            onClick={() => {
              setEditing(true);
            }}
          >
            <BiEdit className="inline-block w-4 h-4" />
          </button>
        )}
        {(renderGeometry.type === "markpoint" || renderGeometry.type === "recon") && (
			<button
			  title="Go to" 
			  className="p-1 text-xs bg-blue-300 border border-blue-400 ml-2"
			  onClick={() => {
				map.animateTo(
				  {
					center: [renderGeometry.position[1], renderGeometry.position[0]],
					zoom: 10,
				  },
				  {
					duration: 250,
					easing: "out",
				  }
				);
			  }}
			>
			  <BiMapPin className="inline-block w-4 h-4" />
			</button>
        )}
        {(renderGeometry.type === "zone" || renderGeometry.type === "waypoints" || renderGeometry.type === "line") && (
			<button
			  title="Go to" 
			  className="p-1 text-xs bg-blue-300 border border-blue-400 ml-2"
			  onClick={() => {
				map.animateTo(
				  {
					center: [renderGeometry.points[0][1], renderGeometry.points[0][0]],
					zoom: 10,
				  },
				  {
					duration: 250,
					easing: "out",
				  }
				);
			  }}
			>
			  <BiMapPin className="inline-block w-4 h-4" />
			</button>
        )}
        {(renderGeometry.type === "circle") && (
			<button
			  title="Go to" 
			  className="p-1 text-xs bg-blue-300 border border-blue-400 ml-2"
			  onClick={() => {
				map.animateTo(
				  {
					center: [renderGeometry.center[1], renderGeometry.center[0]],
					zoom: 10,
				  },
				  {
					duration: 250,
					easing: "out",
				  }
				);
			  }}
			>
			  <BiMapPin className="inline-block w-4 h-4" />
			</button>
        )}
        <button
          title="Close tab" 
		  className="p-1 text-xs bg-red-300 border border-red-400 ml-2 touch-manipulation"
          onClick={closeSelectedPanel}
          onTouchEnd={closeSelectedPanel}
        >
          <BiExit className="inline-block w-4 h-4" />
        </button>
      </div>
      <div className="max-h-screen flex">
		<div className="flex flex-col w-80">
			<div className="p-2 flex flex-row bg-gray-300 border border-gray-500 overflow-x-hidden overflow-y-auto scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-300 shadow">
				<div className="flex flex-col pr-2 w-full">
				  <GeometryDetails key={renderGeometry.id} geo={renderGeometry} edit={editing} />
				  <div className="flex">
					  {canModify && (
							<button
								title="Delete" 
								className="w-full p-1 text-xs bg-red-200 border border-red-500 mt-2"
								onClick={() => {
									setEditing(false);

									submitGeometry(renderGeometry, "delete");
								}}
							>
								<BiTrash className="inline-block w-4 h-4" />
							</button>
					  )}
				  </div>
				</div>
			</div>
			<div className="flex h-52"/>
		</div>
      </div>
    </div>
  );
}
