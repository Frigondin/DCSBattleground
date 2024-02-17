import classNames from "classnames";
import * as maptalks from "maptalks";
import React, { useMemo, useState } from "react";
import ReactRoundedImage from "react-rounded-image"
import { BiCog, BiNote, BiHide, BiShow, BiBrush, BiLayer, BiExit, BiSolidMap } from "react-icons/bi";
import { entityMetadataStore } from "../stores/EntityMetadataStore";
import { serverStore, setSelectedEntityId } from "../stores/ServerStore";
import {
  EntityTrackPing,
  estimatedSpeed,
  trackStore,
} from "../stores/TrackStore";
import { Entity } from "../types/entity";
import DrawConsoleTab from "./DrawConsoleTab";
import QuestConsoleTab from "./QuestConsoleTab";

function WatchTab({ map }: { map: maptalks.Map }) {
  const [selectedButton, setSelectedButton] = useState<
    null | "FancyMap-On" | "FancyMap-Off" | "CaucasusMap-On" | "CaucasusMap-Off" | "CaucasusBorder-On" | "CaucasusBorder-Off" | "Statics-On" | "Statics-Off" | "Combatzones-On" | "Combatzones-Off" | "Groundunits-On" | "Groundunits-Off" | "Customgeo-On" | "Customgeo-Off" | "Aircrafts-On" | "Aircrafts-Off"
  >(null);
  const is_connected = serverStore((state) => state?.server?.player_is_connected);
  const view_aircraft_when_in_flight = serverStore((state) => state?.server?.view_aircraft_when_in_flight);
  return (
    <div className="p-2">
		<table>
			<tr>
				<td>
					<div className="my-2 flex flex-col gap-1">
						{map.getLayer("fancy").isVisible() === true && (
								<button 
									className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
									onClick={() => {map.getLayer("fancy").hide(); map.getLayer("base").show(); setSelectedButton("FancyMap-Off")}}
								>
									<BiShow className="inline-block w-4 h-4" />
								</button>
						)}
						{!map.getLayer("fancy").isVisible() && (
							<button 
								className="border bg-grey-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
								onClick={() => {map.getLayer("fancy").show(); map.getLayer("base").hide(); map.getLayer("CaucasusMap").hide(); map.getLayer("CaucasusBorder").hide(); setSelectedButton("FancyMap-On")}}
							>
								<BiHide className="inline-block w-4 h-4" />
							</button>
						)}
					</div>
				</td>
				<td>
					Fancy Map
				</td>
			</tr>
			<tr>
				<td>
					<div className="my-2 flex flex-col gap-1">
						{map.getLayer("CaucasusMap").isVisible() === true && (
								<button 
									className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
									onClick={() => {map.getLayer("CaucasusMap").hide(); setSelectedButton("CaucasusMap-Off")}}
								>
									<BiShow className="inline-block w-4 h-4" />
								</button>
						)}
						{!map.getLayer("CaucasusMap").isVisible() && (
							<button 
								className="border bg-grey-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
								onClick={() => {map.getLayer("CaucasusMap").show(); setSelectedButton("CaucasusMap-On")}}
							>
								<BiHide className="inline-block w-4 h-4" />
							</button>
						)}
					</div>
				</td>
				<td>
					DCS Caucasus Map
				</td>
			</tr>
			<tr>
				<td>
					<div className="my-2 flex flex-col gap-1">
						{map.getLayer("CaucasusBorder").isVisible() === true && (
								<button 
									className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
									onClick={() => {map.getLayer("CaucasusBorder").hide(); setSelectedButton("CaucasusBorder-Off")}}
								>
									<BiShow className="inline-block w-4 h-4" />
								</button>
						)}
						{!map.getLayer("CaucasusBorder").isVisible() && (
							<button 
								className="border bg-grey-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
								onClick={() => {map.getLayer("CaucasusBorder").show(); setSelectedButton("CaucasusBorder-On")}}
							>
								<BiHide className="inline-block w-4 h-4" />
							</button>
						)}
					</div>
				</td>
				<td>
					DCS Caucasus Borders
				</td>
			</tr>
			<tr>
				<td>
					<div className="my-2 flex flex-col gap-1">
						{map.getLayer("airports").isVisible() === true && (
								<button 
									className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
									onClick={() => {map.getLayer("airports").hide(); map.getLayer("farp-name").hide(); map.getLayer("farp-icon").hide(); setSelectedButton("Statics-Off")}}
								>
									<BiShow className="inline-block w-4 h-4" />
								</button>
						)}
						{!map.getLayer("airports").isVisible() && (
							<button 
								className="border bg-grey-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
								onClick={() => {map.getLayer("airports").show(); map.getLayer("farp-name").show(); map.getLayer("farp-icon").show(); setSelectedButton("Statics-On")}}
							>
								<BiHide className="inline-block w-4 h-4" />
							</button>
						)}
					</div>
				</td>
				<td>
					Statics
				</td>
			</tr>
			<tr>
				<td>
					<div className="my-2 flex flex-col gap-1">
						{map.getLayer("combat-zones").isVisible() === true && (
								<button 
									className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
									onClick={() => {map.getLayer("combat-zones").hide(); map.getLayer("combat-zones-blue").hide(); map.getLayer("combat-zones-red").hide(); setSelectedButton("Combatzones-Off")}}
								>
									<BiShow className="inline-block w-4 h-4" />
								</button>
						)}
						{!map.getLayer("combat-zones").isVisible() && (
							<button 
								className="border bg-grey-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
								onClick={() => {map.getLayer("combat-zones").show(); map.getLayer("combat-zones-blue").show(); map.getLayer("combat-zones-red").show(); setSelectedButton("Combatzones-On")}}
							>
								<BiHide className="inline-block w-4 h-4" />
							</button>
						)}
					</div>
				</td>
				<td>
					Combat zones
				</td>
			</tr>
			<tr>
				<td>
					<div className="my-2 flex flex-col gap-1">
						{map.getLayer("ground-units").isVisible() === true && (
								<button 
									className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
									onClick={() => {map.getLayer("ground-units").hide(); map.getLayer("ground-units-blue").hide(); map.getLayer("ground-units-red").hide(); setSelectedButton("Groundunits-Off")}}
								>
									<BiShow className="inline-block w-4 h-4" />
								</button>
						)}
						{!map.getLayer("ground-units").isVisible() && (
							<button 
								className="border bg-grey-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
								onClick={() => {map.getLayer("ground-units").show(); map.getLayer("ground-units-blue").show(); map.getLayer("ground-units-red").show(); setSelectedButton("Groundunits-On")}}
							>
								<BiHide className="inline-block w-4 h-4" />
							</button>
						)}
					</div>
				</td>
				<td>
					Ground units
				</td>
			</tr>
			<tr>
				<td>
					<div className="my-2 flex flex-col gap-1">
						{map.getLayer("custom-geometry").isVisible() === true && (
								<button 
									className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
									onClick={() => {map.getLayer("custom-geometry").hide(); setSelectedButton("Customgeo-Off")}}
								>
									<BiShow className="inline-block w-4 h-4" />
								</button>
						)}
						{!map.getLayer("custom-geometry").isVisible() && (
							<button 
								className="border bg-grey-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
								onClick={() => {map.getLayer("custom-geometry").show(); setSelectedButton("Customgeo-On")}}
							>
								<BiHide className="inline-block w-4 h-4" />
							</button>
						)}
					</div>
				</td>
				<td>
					Draw
				</td>
			</tr>
			<tr>
				<td>
					<div className="my-2 flex flex-col gap-1">
						{map.getLayer("track-icons").isVisible() === true && (
								<button 
									className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
									onClick={() => {map.getLayer("track-icons").hide(); map.getLayer("track-trails").hide(); map.getLayer("track-vv").hide(); map.getLayer("track-name").hide(); map.getLayer("track-altitude").hide(); map.getLayer("track-speed").hide(); map.getLayer("track-verticalvelo").hide(); setSelectedButton("Aircrafts-Off")}}
								>
									<BiShow className="inline-block w-4 h-4" />
								</button>
						)}
						{(view_aircraft_when_in_flight || !is_connected) && !map.getLayer("track-icons").isVisible() && (
							<button 
								className="border bg-grey-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
								onClick={() => {map.getLayer("track-icons").show(); map.getLayer("track-trails").show(); map.getLayer("track-vv").show(); map.getLayer("track-name").show(); map.getLayer("track-altitude").show(); map.getLayer("track-speed").show(); map.getLayer("track-verticalvelo").show(); setSelectedButton("Aircrafts-On")}}
							>
								<BiHide className="inline-block w-4 h-4" />
							</button>
						)}
						{!view_aircraft_when_in_flight && is_connected && !map.getLayer("track-icons").isVisible() && (
							<button 
								className="border bg-red-300 border-red-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
							>
								<BiHide className="inline-block w-4 h-4" />
							</button>
						)}
					</div>
				</td>
				<td>
					Aircrafts
				</td>
			</tr>
		</table>
    </div>
  );
}

function SearchTab({ map }: { map: maptalks.Map }) {
  const [search, setSearch] = useState("");

  const entityMetadata = entityMetadataStore((state) => state.entities);
  const matchFn = useMemo(() => {
    // Label query
    if (search.startsWith("@")) {
      const tag = search.slice(1).toLowerCase();
      if (!tag) return null;

      return (it: Entity) => {
        const meta = entityMetadata.get(it.id);
        return meta && meta.tags.includes(tag);
      };
    } else {
      return (it: Entity) =>
        ((it.types.includes("Air") || it.types.includes("Sea")) &&
          it.name.toLowerCase().includes(search)) ||
        (it.pilot !== undefined && it.pilot.toLowerCase().includes(search));
    }
  }, [search, entityMetadata]);

  const matchedEntities = serverStore((state) =>
    matchFn ? state.entities.valueSeq().filter(matchFn).toArray() : []
  );
  const tracks = new Map(
    trackStore((state) =>
      matchedEntities.map((it) => [it.id, state.tracks.get(it.id)])
    )
  );
  const targetEntities = matchedEntities
    .map(
      (it) =>
        [it, tracks.get(it.id)] as [Entity, Array<EntityTrackPing> | undefined]
    )
    .filter(
      (it) =>
        it[0].types.includes("Sea") ||
        (it[1] !== undefined && estimatedSpeed(it[1]) >= 25)
    )
    .map((it) => it[0]);

  return (
    <div className="p-2">
      <input
        className="form-input mt-1 block w-full p-1"
        value={search}
        onChange={(e) => setSearch(e.target.value.toLowerCase())}
      />
      {search !== "" && matchedEntities && (
        <div className="my-2 flex flex-col gap-1">
          {targetEntities.map((entity) => {
            return (
              <button
                onClick={() => {
                  setSelectedEntityId(entity.id);
                  map.animateTo(
                    {
                      center: [entity.longitude, entity.latitude],
                      zoom: 10,
                    },
                    {
                      duration: 250,
                      easing: "out",
                    }
                  );
                }}
                className="bg-indigo-100 hover:border-indigo-300 hover:bg-indigo-200 border-indigo-200 border rounded-sm"
              >
                {entity.name} ({entity.pilot || ""})
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Console({
  map,
  setSettingsOpen,
  setScratchPadOpen,
}: {
  setSettingsOpen: (value: boolean) => void;
  setScratchPadOpen: (value: boolean) => void;
  map: maptalks.Map;
}) {
  const [selectedTab, setSelectedTab] = useState<
    null | "search" | "watch" | "draw" | "quest"
  >(null);
  const discord_name = serverStore((state) => state?.server?.discord_name);
  const avatar = serverStore((state) => state?.server?.avatar);
  const is_connected = serverStore((state) => state?.server?.player_is_connected);
  const player_name = serverStore((state) => state?.server?.player_name);
  return (
    <div className="m-2 absolute flex flex-col bg-gray-200 border border-gray-500 shadow select-none rounded-sm right-0 w-60">
	  <div className="p-2 flex flex-row gap-2 align-middle ml-auto">
			<div>Connected as {discord_name}</div>
			<div className="flex flex-row gap-2"><ReactRoundedImage image={avatar} imageWidth="30" imageHeight="30" roundedSize="3"/></div>
	  </div>
	  {is_connected && (<div className="p-2 flex flex-row gap-2 align-middle ml-auto text-xs pr-4 pt-0">
			<div>{player_name}</div>
			<div style={{maxWidth: "15px"}} className="flex flex-row gap-2"><img src="/static/connected.png"/></div>
	  </div>)
	  }
	  {!is_connected && (<div className="p-2 flex flex-row gap-2 align-middle ml-auto text-xs pr-4 pt-0">
			<div>Not connected to DCS</div>
			<div style={{maxWidth: "15px"}} className="flex flex-row gap-2"><img src="/static/notconnected.png"/></div>
	  </div>)
	  }
      <div className="bg-gray-300 text-sm p-2 flex flex-row gap-2">
        <div>
          <button
            onClick={() => setSelectedTab("draw")}
            className={classNames(
              "border bg-blue-100 border-blue-300 p-1 rounded-sm shadow-sm flex flex-row items-center",
              { "bg-blue-200": selectedTab === "draw" }
            )}
          >
            <BiBrush className="inline-block w-4 h-4" />
          </button>
        </div>
        <div>
          <button
            onClick={() => setSelectedTab("quest")}
            className={classNames(
              "border bg-blue-100 border-blue-300 p-1 rounded-sm shadow-sm flex flex-row items-center",
              { "bg-blue-200": selectedTab === "quest" }
            )}
          >
            <BiSolidMap className="inline-block w-4 h-4" />
          </button>
        </div>
        <div>
          <button
            onClick={() => setSelectedTab("watch")}
            className={classNames(
              "border bg-blue-100 border-blue-300 p-1 rounded-sm shadow-sm flex flex-row items-center",
              { "bg-blue-200": selectedTab === "watch" }
            )}
          >
            <BiLayer className="inline-block w-4 h-4" />
          </button>
        </div>
        <div className="ml-auto flex flex-row gap-2">
          { selectedTab !== null && (
            <button
              className="border bg-red-100 border-red-300 p-1 rounded-sm shadow-sm flex flex-row items-center"
              onClick={() => setSelectedTab(null)}
            >
              <BiExit className="inline-block w-4 h-4" />
            </button>
          )} 
        </div>
        <div>
          <button
            className="border bg-yellow-100 border-yellow-300 p-1 rounded-sm shadow-sm flex flex-row items-center"
            onClick={() => setScratchPadOpen(true)}
          >
            <BiNote className="inline-block w-4 h-4" />
          </button>
        </div>
      </div>
      {selectedTab === "search" && <SearchTab map={map} />}
      {selectedTab === "watch" && <WatchTab map={map} />}
	  {selectedTab === "quest" && <QuestConsoleTab map={map} />}
      {selectedTab === "draw" && <DrawConsoleTab map={map} />}
    </div>
  );
}
