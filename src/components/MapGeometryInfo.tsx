import classNames from "classnames";
import Coord from "coordinate-parser";
import * as maptalks from "maptalks";
import * as mgrs from "mgrs";
import React, { useEffect, useState, useRef } from "react";
import ReactRoundedImage from "react-rounded-image"
import { BiExit, BiEdit, BiTrash, BiMailSend, BiCheck, BiMapPin, BiCheckSquare, BiCheckbox, BiUpload, BiLock, BiLockOpen, BiMouseAlt } from "react-icons/bi";
import Lightbox from 'react-image-lightbox';
import 'react-image-lightbox/style.css';
import {Collapse, UnmountClosed} from 'react-collapse';
import { serverStore } from "../stores/ServerStore";
import { v4 as uuidv4 } from 'uuid';

import {
  deleteGeometry,
  Geometry,
  geometryStore,
  setSelectedGeometry,
  updateGeometrySafe,
} from "../stores/GeometryStore";
import DetailedCoords from "./DetailedCoords";



function maybeParseCoord(newCoord: string): null | [number, number] {
  try {
    const coord = new Coord(newCoord);
    return [coord.getLatitude(), coord.getLongitude()];
  } catch (e) {
    try {
      const coord = mgrs.toPoint(newCoord.replace(" ", ""));
      return [coord[1], coord[0]];
    } catch (e) {}
  }
  return null;
}

function DetailedWaypoints({
	points,
}: {
	points: [number, number][];
}) {
	var counter = -1
	return <div style={{ maxHeight: "600px", overflowY:"scroll" }}>{points.map(point => {
		counter = counter + 1
		return (<div style={{borderTop:"1px solid black"}}><div style={{textDecoration: "underline"}}>Wpt#{counter}<br/></div><DetailedCoords coords={point}/></div>)
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
	id
}: {
	task: any;
	edit: any;
	id: any;
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
						
						return (<div className="my-2">
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
																				//const newTask = task.map(el => (el.id === singleTask.id ? {...el, fata
																				task[i] = newSingleTask
																				updateGeometrySafe(id, { task: task });
																			}}
																		  /></span><span> :</span></span>) : (<span>Task {singleTask.data.title} :</span>)}
								
												</span>
												<span className="select-text font-mono">{singleTask.players.length}/{singleTask.data.field.max_flight}</span>
											</button>
										</div>
										<button onClick={() => {
																	const task_id = singleTask.id;
																	console.log(task_id);
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
										</button>
									</div>		 					
									<UnmountClosed className="flex flex-col" isOpened={isOpen[i]}>
										<div className="border rounded-sm border-indigo-300">
											<div className="flex flex-row w-full pl-1">
												<span className="pr-2 flex-grow">Desc.:</span>					
												{edit ? (<span className="">
														  <textarea 
															rows={5}
															className="flex-grow p-0.5"
															value={singleTask.data.field.description.join('\n')}
															onChange={(e) => {
																//updateGeometrySafe(geo.id, { description: e.target.value.split("\n") });
																const newSingleTask = singleTask;
																newSingleTask.data.field.description = e.target.value.split("\n");
																//const newTask = task.map(el => (el.id === singleTask.id ? {...el, fata
																task[i] = newSingleTask;
																updateGeometrySafe(id, { task: task });
															}}
														  />
														</span>) : (<span className="">
																	{singleTask.data.field.description.map((text:any) => {
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
								</div>)
					})}
				</div>)
}



function submitGeometry(geo:Geometry, typeSubmit:string) {
	var body
	if (geo.type === "markpoint") {
		body = JSON.stringify({"Type":"markpoint","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar,"PosPoint":geo.position, "PosMGRS":mgrs.forward([geo.position[1], geo.position[0]]), "Points":[], "Center":[], "Radius":0, "Screenshot":[], "Side": geo.coalition, "Color": geo.color, "Description":[], "TimeStamp": geo.timeStamp, "Status": geo.status, "Clickable":geo.clickable, "TypeSubmit":typeSubmit})
	} else if (geo.type === "zone") {
		body = JSON.stringify({"Type":"zone","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar, "PosPoint":[], "PosMGRS":"", "Points":geo.points, "Center":[], "Radius":0, "Screenshot":[], "Side": geo.coalition, "Color": geo.color, "Description":[], "TimeStamp": geo.timeStamp, "Status": geo.status, "Clickable":geo.clickable, "TypeSubmit":typeSubmit})
	} else if (geo.type === "waypoints") {
		body = JSON.stringify({"Type":"waypoints","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar,"PosPoint":[], "PosMGRS":"", "Points":geo.points, "Center":[], "Radius":0, "Screenshot":[], "Side": geo.coalition, "Color": geo.color, "Description":[], "TimeStamp": geo.timeStamp, "Status": geo.status, "Clickable":geo.clickable, "TypeSubmit":typeSubmit})
	} else if (geo.type === "line") {
		body = JSON.stringify({"Type":"line","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar,"PosPoint":[], "PosMGRS":"", "Points":geo.points, "Center":[], "Radius":0, "Screenshot":[], "Side": geo.coalition, "Color": geo.color, "Description":[], "TimeStamp": geo.timeStamp, "Status": geo.status, "Clickable":geo.clickable, "TypeSubmit":typeSubmit})
	} else if (geo.type === "circle") {
		body = JSON.stringify({"Type":"circle","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar,"PosPoint":[], "PosMGRS":"", "Points":[], "Center":geo.center, "Radius":geo.radius, "Screenshot":[], "Side": geo.coalition, "Color": geo.color, "Description":[], "TimeStamp": geo.timeStamp, "Status": geo.status, "Clickable":geo.clickable, "TypeSubmit":typeSubmit})
	} else if (geo.type === "recon") {
		body = JSON.stringify({"Type":"recon","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar,"PosPoint":geo.position, "PosMGRS":"", "Points":[], "Center":[], "Radius":0, "Screenshot":[], "Side": geo.coalition, "Color": geo.color, "Description":[], "TimeStamp": geo.timeStamp, "Status": geo.status, "Clickable":geo.clickable, "TypeSubmit":typeSubmit})
	} else if (geo.type === "quest") {
		body = JSON.stringify({"Type":"quest","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar,"PosPoint":geo.position, "PosMGRS":mgrs.forward([geo.position[1], geo.position[0]]), "Points":[], "Center":[], "Radius":0, "Screenshot":geo.screenshot, "Side": geo.coalition, "Color": geo.color, "Description":geo.description, "TimeStamp": geo.timeStamp, "Status": geo.status, "Clickable":geo.clickable, "TypeSubmit":typeSubmit})
	}
	fetch(window.location.href.concat('/share'), {
		headers: {
		  'Accept': 'application/json',
		  'Content-Type': 'application/json'
		},
		method: "POST",
		body: body
	})
	.then(function(res){ console.log(res) })
	.catch(function(res){ console.log(res) })
			
	return;
}

function GeometryDetails({ geo, edit }: { geo: Geometry; edit: boolean }) {
  const [newCoord, setNewCoord] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);
  const [isOpenDesc, setIsOpenDesc] = useState(true);
  //const [picture, setPicture] = useState({});
  const [picture, setPicture] = useState({picturePreview:"", pictureAsFile:""});
  
  const uploadPicture = (e:any) => {
    setPicture({
		  /* contains the preview, if you want to show the picture to the user
			   you can access it with this.state.currentPicture
		   */
		  picturePreview: URL.createObjectURL(e.target.files[0]),
		  /* this contains the file we want to send */
		  pictureAsFile: e.target.files[0],
		});
	
  };
  //const [uploadedFile, setUploadedFile] = useState({});

  const setImageAction = async (event:any) => {
    event.preventDefault();

    const formData = new FormData();
    formData.append("file", picture.pictureAsFile);

    //console.log(picture.pictureAsFile);

    for (var key of formData.entries()) {
      console.log(key[0] + ", " + key[1]);
    }

	const url = new URL(window.location.href)
    const response  = await fetch(url.origin.concat('/upload'), {
		method: "post",
		body: formData,
    });
    const uploadedImage = await response .json();
    if (uploadedImage) {
	 	console.log(uploadedImage);					
		let files:string[] = [];
		uploadedImage.Files.forEach((file:any) => {
			files.push(url.origin.concat('/files/').concat(file));
		});
		//setUploadedFile(files);
		//geo.screenshot = files;
		updateGeometrySafe(geo.id, { screenshot: files });
    } else {
		console.log("Upload error");
    }
	
	// fetch(url.origin.concat('/upload'), {
		// method: "post",
		// body: formData,
    // })  .then(function(response) {
		// const resp = response.json().files;
		// console.log(resp);
	// }).then(function(data) {
		// console.log(data);
	// });
  };
  
  useEffect(() => {
    if (edit) setNewCoord("");
  }, [edit]);

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
	  {geo.type === "waypoints" && <DetailedWaypoints points={geo.points}/>}
      {geo.type === "markpoint" && <DetailedCoords coords={geo.position} />}
      {geo.type === "markpoint" && edit && (
        <>
          {}
          {
            <div className="flex flex-row flex-grow w-full">
              <span className="pr-2 flex-grow">Coords</span>
              <input
                className={classNames("flex-grow p-0.5 text-right rounded-sm", {
                  "ring-red-600 ring":
                    newCoord && maybeParseCoord(newCoord) === null,
                })}
                value={newCoord}
                onChange={(e) => {
                  setNewCoord(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    try {
                      const coord = new Coord(newCoord);
                      updateGeometrySafe(geo.id, {
                        position: [coord.getLatitude(), coord.getLongitude()],
                      });
                    } catch (e) {
                      try {
                        const coord = mgrs.toPoint(newCoord.replace(" ", ""));
                        updateGeometrySafe(geo.id, {
                          position: [coord[1], coord[0]],
                        });
                      } catch (e) {
                        console.error(e);
                      }
                    }
                  }
                }}
              />
            </div>
          }
        </>
      )}
	  {geo.type === "recon" && <DetailedCoords coords={geo.position} />}
	  {geo.type === "recon" && (
		<>
			{}
			{
			<div style={{maxWidth: "250px"}} onClick={() => setIsOpen(true)}>
				<img src={geo.screenshot[0]}/>
			</div>
			}
		</>
	  )}
		{geo.type === "recon" && isOpen && (
			<Lightbox
				mainSrc={geo.screenshot[imgIndex]}
				nextSrc={geo.screenshot[(imgIndex + 1) % geo.screenshot.length]}
				prevSrc={geo.screenshot[(imgIndex + geo.screenshot.length - 1) % geo.screenshot.length]}
			  onCloseRequest={() => setIsOpen(false)}
			  onMovePrevRequest={() =>
				setImgIndex((imgIndex + geo.screenshot.length - 1) % geo.screenshot.length)
			  }
			  onMoveNextRequest={() => setImgIndex((imgIndex + 1) % geo.screenshot.length)}
			/>
		)}
		

		{geo.type === "quest" && <DetailedCoords coords={geo.position} />}
	  	{geo.type === "quest" && edit &&
			<div className="my-2 flex gap-1 overflow-auto">
				<div className="flex flex-col flex-grow">
					<button className="bg-indigo-100 border-indigo-200 border rounded-sm p-1">
						Upload pictures
					</button>
					<div className="border rounded-sm border-indigo-300">
						<form onSubmit={setImageAction}>
							<input type="file" name="image" onChange={uploadPicture} />
							<br />
							{picture.pictureAsFile !== "" &&
								<button type="submit" name="upload" className="bg-blue-100 border-blue-200 border rounded-sm p-1 items-center w-full">
									Upload
									<BiUpload className="ml-2 inline-block"/> 
								</button>
							}
							{picture.pictureAsFile === "" &&
								<div>
									<br />
								</div>
							}
						</form>
					</div>
				</div>
			</div>
		}
		{geo.type === "quest" &&
			<div>
				<div className="my-2 flex gap-1 overflow-auto">
					<div className="flex flex-col flex-grow">
						<button className={classNames("bg-indigo-100 hover:border-indigo-300 hover:bg-indigo-200 border-indigo-200 border rounded-sm p-1", { "bg-indigo-200 border-indigo-300": isOpenDesc === true })}
								onClick={() => {isOpenDesc ? setIsOpenDesc(false) : setIsOpenDesc(true);}}
						>
								Mission description
						</button>

						<UnmountClosed className="flex flex-col" isOpened={isOpenDesc}>
							<div className="border rounded-sm border-indigo-300">
								<div className="w-72" onClick={() => setIsOpen(true)}>
									<img src={geo.screenshot[0]}/>
								</div>
								{isOpen && (
									<Lightbox
										mainSrc={geo.screenshot[imgIndex]}
										nextSrc={geo.screenshot[(imgIndex + 1) % geo.screenshot.length]}
										prevSrc={geo.screenshot[(imgIndex + geo.screenshot.length - 1) % geo.screenshot.length]}
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
											className="flex-grow p-0.5"
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
				<DetailedTask task={geo.task} edit={edit} id={geo.id}/>
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
  const [editing, setEditing] = useState(false);
  const editor_mode_on = serverStore((state) => state?.editor_mode_on);

  useEffect(() => {
    setEditing(false);
  }, [selectedGeometry?.id]);

  useEffect(() => {
    if (!selectedGeometry) return () => {};
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
      if (editing) {
        item.startEdit();
      } else {
        item.endEdit();
      }
    } else if (selectedGeometry.type !== "quest"){
      item.config("draggable", editing);
    }

    return () => {
      if (selectedGeometry.type === "zone" ||
		selectedGeometry.type === "waypoints" ||
		selectedGeometry.type === "line" ||
		selectedGeometry.type === "circle" ) {
		const geo = item.getGeometries()[0];
        geo.endEdit();
      } else {
        item.config("draggable", false);
      }
    };
  }, [editing]);

  if (!selectedGeometry) return <></>;
	
  return (
    <div className="w-80 flex flex-col bg-gray-300 border border-gray-500 shadow select-none rounded-sm">
      <div className="p-2 bg-gray-400 text-sm flex flex-row">
		{editor_mode_on && (selectedGeometry.status === "Locked" ? 
					(<button title="Unlock" onClick={() => {
															setEditing(false);
															selectedGeometry.status = "Shared";
															updateGeometrySafe(selectedGeometry.id, { status: "Shared" });
														}} className="p-1 text-xs bg-red-300 border border-red-400"><BiLock className="inline-block w-4 h-4" /></button>) : 
					(<button title="Lock" onClick={() => {
															setEditing(false);
															selectedGeometry.status = "Locked";
															updateGeometrySafe(selectedGeometry.id, { status: "Locked" });
														}} className="p-1 text-xs bg-green-300 border border-green-400"><BiLockOpen className="inline-block w-4 h-4" /></button>))}
		{editor_mode_on && (selectedGeometry.clickable ? 
					(<button title="Disable" onClick={() => {
															setEditing(false);
															selectedGeometry.clickable = false;
															updateGeometrySafe(selectedGeometry.id, { clickable: false });
														}} className="p-1 text-xs bg-green-300 border border-green-400 ml-2 mr-2"><BiMouseAlt className="inline-block w-4 h-4" /></button>) : 
					(<button title="Enable" onClick={() => {
															setEditing(false);
															selectedGeometry.clickable = true;
															updateGeometrySafe(selectedGeometry.id, { clickable: true });
														}} className="p-1 text-xs bg-red-300 border border-red-400 ml-2 mr-2"><BiMouseAlt className="inline-block w-4 h-4" /></button>))}
        <b className="flex flex-grow"> 
          {editor_mode_on && (selectedGeometry.type.substring(0,5).concat(' #', selectedGeometry.id.toString()))}
        </b>
        {!editing && (selectedGeometry.store === "local") && (
          <button
			title="Share" 
            className="p-1 text-xs bg-yellow-300 border border-yellow-400 ml-2"
            onClick={() => {
				setEditing(false);
				submitGeometry(selectedGeometry, "share");
				selectedGeometry.clickable = false;
				updateGeometrySafe(selectedGeometry.id, { clickable: false });
				setTimeout(function() {deleteGeometry(selectedGeometry.id);}, 5000);
				setSelectedGeometry(null);
            }}
          >
            <BiMailSend className="inline-block w-4 h-4" />
          </button>
        )}
        {!editing && selectedGeometry.store !== "local" && (selectedGeometry.status !== "Locked"|| editor_mode_on) && (
          <button
			title="Update" 
            className="p-1 text-xs bg-yellow-300 border border-yellow-400 ml-2"
            onClick={() => {
				setEditing(false);
				submitGeometry(selectedGeometry, "update");
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
        {!editing && (selectedGeometry.status !== "Locked" || editor_mode_on) && (
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
        {(selectedGeometry.type === "markpoint" || selectedGeometry.type === "recon") && (
			<button
			  title="Go to" 
			  className="p-1 text-xs bg-blue-300 border border-blue-400 ml-2"
			  onClick={() => {
				map.animateTo(
				  {
					center: [selectedGeometry.position[1], selectedGeometry.position[0]],
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
        {(selectedGeometry.type === "zone" || selectedGeometry.type === "waypoints" || selectedGeometry.type === "line") && (
			<button
			  title="Go to" 
			  className="p-1 text-xs bg-blue-300 border border-blue-400 ml-2"
			  onClick={() => {
				map.animateTo(
				  {
					center: [selectedGeometry.points[0][1], selectedGeometry.points[0][0]],
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
        {(selectedGeometry.type === "circle") && (
			<button
			  title="Go to" 
			  className="p-1 text-xs bg-blue-300 border border-blue-400 ml-2"
			  onClick={() => {
				map.animateTo(
				  {
					center: [selectedGeometry.center[1], selectedGeometry.center[0]],
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
		  className="p-1 text-xs bg-red-300 border border-red-400 ml-2"
          onClick={() => {
            setEditing(false);
            setSelectedGeometry(null);
          }}
        >
          <BiExit className="inline-block w-4 h-4" />
        </button>
      </div>
      <div className="p-2 flex flex-row">
        <div className="flex flex-col pr-2 w-full">
          <GeometryDetails geo={selectedGeometry} edit={editing} />
		  {(selectedGeometry.status !== "Locked" || editor_mode_on) && (
				<button
					title="Delete" 
					className="p-1 text-xs bg-red-200 border border-red-500 mt-2"
					onClick={() => {
					  submitGeometry(selectedGeometry, "delete");
					  deleteGeometry(selectedGeometry.id);
					}}
				>
					<BiTrash className="inline-block w-4 h-4" />
				</button>
		  )}
        </div>
      </div>
    </div>
  );
}
