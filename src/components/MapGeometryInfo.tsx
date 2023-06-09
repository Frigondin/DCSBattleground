import classNames from "classnames";
import Coord from "coordinate-parser";
import * as maptalks from "maptalks";
import * as mgrs from "mgrs";
import React, { useEffect, useState } from "react";
import ReactRoundedImage from "react-rounded-image"
import { BiExit, BiEdit, BiTrash, BiMailSend, BiCheck, BiMapPin } from "react-icons/bi";
import Lightbox from 'react-image-lightbox';
import 'react-image-lightbox/style.css';
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

function submitGeometry(geo:Geometry, typeSubmit:string) {
    
	// var formData = new FormData();
	// formData.append('add', JSON.stringify({"typeGeo":"markpoint","id":10001,"name":"testouille","position":[0,0],"points":[[0,0]]}));
	
    // const requestOptions = {
        // method: 'POST',
        // headers: { 'Content-Type': 'application/json' },
        // body: formData
    // };
	// console.log(requestOptions)
    //fetch(window.location.href.concat('/share'), requestOptions);
	//fetch('http://localhost:8008/share', requestOptions);
	//fetch('/api/share', requestOptions);
        //.then(response => response.json())
        //.then(data => this.setState({ postId: data.id }));
		
/*         var formData = new FormData();
        formData.append('add', JSON.stringify({"typeGeo":"markpoint","id":10001,"name":"testouille","position":[0,0],"points":[[0,0]]}));

        //fetch('http://localhost:8008/share', {
		fetch(window.location.href.concat('/share'), {
            method: 'post',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'multipart/form-data'
            },
            body: formData
        }) */
	var body
	// if (typeSubmit === "delete") {
		// body = JSON.stringify({"Delete":{"Id":geo.id}})
	// } else if (geo.type === "markpoint" && geo.id <= 10000) {
		// body = JSON.stringify({"Add":{"Type":"markpoint","Id":geo.id,"Name":geo.name,"Position":geo.position}})
	// } else if (geo.type === "markpoint" && geo.id > 10000) {
		// body = JSON.stringify({"Update":{"Type":"markpoint","Id":geo.id,"Name":geo.name,"Position":geo.position}})
	// }
	if (geo.type === "markpoint") {
		body = JSON.stringify({"Type":"markpoint","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar,"Position":geo.position, "TypeSubmit":typeSubmit})
	} else if (geo.type === "zone") {
		body = JSON.stringify({"Type":"zone","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar,"Points":geo.points, "TypeSubmit":typeSubmit})
	} else if (geo.type === "waypoints") {
		body = JSON.stringify({"Type":"waypoints","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar,"Points":geo.points, "TypeSubmit":typeSubmit})
	} else if (geo.type === "line") {
		body = JSON.stringify({"Type":"line","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar,"Points":geo.points, "TypeSubmit":typeSubmit})
	} else if (geo.type === "circle") {
		body = JSON.stringify({"Type":"circle","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar,"Center":geo.center, "Radius":geo.radius, "TypeSubmit":typeSubmit})
	} else if (geo.type === "recon") {
		body = JSON.stringify({"Type":"circle","Id":geo.id,"Name":geo.name,"DiscordName":geo.discordName,"Avatar":geo.avatar,"Position":geo.position, "TypeSubmit":typeSubmit})
	}
	fetch(window.location.href.concat('/share'), {
		headers: {
		  'Accept': 'application/json',
		  'Content-Type': 'application/json'
		},
		method: "POST",
		//body: JSON.stringify({"Add":{"Type":"markpoint","Id":10001,"Name":"testouille","Position":[0,0],"Points":[[0,0]]}})
		body: body//JSON.stringify({"Add":{"Type":geo.type,"Id":geo.id,"Name":geo.name,"Position":geo.position,"Points":geo.points}})
		//body: JSON.stringify({"Add":"plip"})
	})
	.then(function(res){ console.log(res) })
	.catch(function(res){ console.log(res) })
			
	return;
}

function GeometryDetails({ geo, edit }: { geo: Geometry; edit: boolean }) {
  const [newCoord, setNewCoord] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);
  
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
          {/* TODO: sort out parsing coords from human input */}
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
					  //imageTitle={images[imgIndex].title}
					  //imageCaption={images[imgIndex].caption}
					  //mainSrc={images[imgIndex].url}
					  //nextSrc={images[(imgIndex + 1) % images.length].url}
					  //prevSrc={images[(imgIndex + images.length - 1) % images.length].url}
					  onCloseRequest={() => setIsOpen(false)}
					  onMovePrevRequest={() =>
						setImgIndex((imgIndex + geo.screenshot.length - 1) % geo.screenshot.length)
					  }
					  onMoveNextRequest={() => setImgIndex((imgIndex + 1) % geo.screenshot.length)}
					/>
				)}
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

  useEffect(() => {
    setEditing(false);
  }, [selectedGeometry?.id]);

  useEffect(() => {
    if (!selectedGeometry) return () => {};
    const layer = map.getLayer("custom-geometry") as maptalks.VectorLayer;
    const item = layer.getGeometryById(
      selectedGeometry.id
    ) as maptalks.GeometryCollection;

    const geo = item.getGeometries()[0];
    if (selectedGeometry.type === "zone" ||
		selectedGeometry.type === "waypoints" ||
		selectedGeometry.type === "line" ||
		selectedGeometry.type === "circle" ) {
      if (editing) {
		//console.log(geo)
        geo.startEdit();
      } else {
        geo.endEdit();
      }
    } else {
      item.config("draggable", editing);
    }

    return () => {
      if (selectedGeometry.type === "zone" ||
		selectedGeometry.type === "waypoints" ||
		selectedGeometry.type === "line" ||
		selectedGeometry.type === "circle" ) {
        geo.endEdit();
      } else {
        item.config("draggable", false);
      }
    };
  }, [editing]);

  if (!selectedGeometry) return <></>;

  return (
    <div className="flex flex-col bg-gray-300 border border-gray-500 shadow select-none rounded-sm">
      <div className="p-2 bg-gray-400 text-sm flex flex-row">
        <b className="flex flex-grow">
          {selectedGeometry.name ||
            `${selectedGeometry.type} #${selectedGeometry.id}`}
        </b>
        {!editing && selectedGeometry.id < 10000 && (
          <button
            className="p-1 text-xs bg-yellow-300 border border-yellow-400 ml-2"
            onClick={() => {
              setEditing(false);
			  submitGeometry(selectedGeometry, "share");
			  deleteGeometry(selectedGeometry.id);
            }}
          >
            <BiMailSend className="inline-block w-4 h-4" />
          </button>
        )}
        {editing && (
          <button
            className="p-1 text-xs bg-green-200 border border-green-500 ml-2"
            onClick={() => {
              setEditing(false);
            }}
          >
            <BiCheck className="inline-block w-4 h-4" />
          </button>
        )}
        {!editing && selectedGeometry.id < 10000 && (
          <button
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
          <button
            className="p-1 text-xs bg-red-200 border border-red-500 mt-2"
            onClick={() => {
			  submitGeometry(selectedGeometry, "delete");
              deleteGeometry(selectedGeometry.id);
            }}
          >
            <BiTrash className="inline-block w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
