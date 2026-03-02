import classNames from "classnames";
import * as maptalks from "maptalks";
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactRoundedImage from "react-rounded-image"
import { BiCog, BiNote, BiHide, BiShow, BiBrush, BiLayer, BiExit, BiSolidMap, BiSolidCctv, BiChevronLeft, BiChevronRight } from "react-icons/bi";
import { AiOutlineDisconnect } from "react-icons/ai";
import { PiPlugsConnectedFill } from "react-icons/pi";
import { entityMetadataStore } from "../stores/EntityMetadataStore";
import { serverStore, setSelectedEntityId, updateServerStore } from "../stores/ServerStore";
import { updateGeometryStore } from "../stores/GeometryStore";
import {
  EntityTrackPing,
  estimatedSpeed,
  trackStore,
} from "../stores/TrackStore";
import { settingsStore } from "../stores/SettingsStore";
import { Entity } from "../types/entity";
import DrawConsoleTab from "./DrawConsoleTab";
import QuestConsoleTab from "./QuestConsoleTab";

function WatchTab({ map }: { map: maptalks.Map }) {
  const [selectedButton, setSelectedButton] = useState<
    null | "PrettyMap-On" | "PrettyMap-Off" | "CaucasusMap-On" | "CaucasusMap-Off" | "MgrsGrid-On" | "MgrsGrid-Off" | "Statics-On" | "Statics-Off" | "Combatzones-On" | "Combatzones-Off" | "Groundunits-On" | "Groundunits-Off" | "Customgeo-On" | "Customgeo-Off" | "Missionpoints-On" | "Missionpoints-Off" | "Aircrafts-On" | "Aircrafts-Off" | "DCSMap-On" | "DCSMap-Off"
  >(null);
  const is_connected = serverStore((state) => state?.server?.player_is_connected);
  const view_aircraft_when_in_flight = serverStore((state) => state?.server?.view_aircraft_when_in_flight);
  const dcs_map = serverStore((state) => state?.server?.dcs_map);
  const prettyMapBrightness = settingsStore((state) => state.map?.prettyMapBrightness ?? 1);
  const dcsMapBrightness = settingsStore((state) => state.map?.dcsMapBrightness ?? 1.2);
  const mgrsGridBrightness = settingsStore((state) => state.map?.mgrsGridBrightness ?? 1);
  return (
    <div className="p-2">
		<table>
			<tr>
				<td>
					<div className="my-2 flex flex-col gap-1">
						{map.getLayer("pretty")!.isVisible() === true && (
								<button 
									className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
									onClick={() => {map.getLayer("pretty")!.hide(); map.getLayer("base")!.show(); setSelectedButton("PrettyMap-Off")}}
								>
									<BiShow className="inline-block w-4 h-4" />
								</button>
						)}
						{!map.getLayer("pretty")!.isVisible() && (
							<button 
								className="border bg-grey-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
								onClick={() => {map.getLayer("pretty")!.show(); map.getLayer("base")!.hide(); setSelectedButton("PrettyMap-On")}}
							>
								<BiHide className="inline-block w-4 h-4" />
							</button>
						)}
					</div>
				</td>
				<td>
					<div className="relative w-full pr-20">
						<span className="whitespace-nowrap">Pretty Map</span>
						<div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1">
							<span className="text-xs whitespace-nowrap">{prettyMapBrightness.toFixed(2)}</span>
							<input
								className="w-12"
								type="range"
								min={0.5}
								max={2}
								step={0.05}
								value={prettyMapBrightness}
								onChange={(e) => {
									const value = Math.max(0.5, Math.min(2, parseFloat(e.target.value)));
									settingsStore.setState((state) => ({
										...state,
										map: {
											...state.map,
											prettyMapBrightness: value,
										},
									}));
								}}
							/>
						</div>
					</div>
				</td>
			</tr>
			{dcs_map && 
			<tr>
				<td>
					<div className="my-2 flex flex-col gap-1">
						{map.getLayer("DCSMap")!.isVisible() === true && (
								<button 
									className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
									onClick={() => {
                    map.getLayer("DCSMap")!.hide();
                    map.getLayer("map-cities")?.hide();
                    map.getLayer("base")!.show();
                    setSelectedButton("DCSMap-Off");
                  }}
								>
									<BiShow className="inline-block w-4 h-4" />
								</button>
						)}
						{!map.getLayer("DCSMap")!.isVisible() && (
							<button 
								className="border bg-grey-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
								onClick={() => {
                    map.getLayer("DCSMap")!.show();
                    map.getLayer("map-cities")?.show();
                    map.getLayer("base")!.hide();
                    map.getLayer("CaucasusMap")!.hide();
                    setSelectedButton("DCSMap-On");
                  }}
							>
								<BiHide className="inline-block w-4 h-4" />
							</button>
						)}
					</div>
				</td>
				<td>
					<div className="relative w-full pr-20">
						<span className="whitespace-nowrap">DCS Map</span>
						<div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1">
							<span className="text-xs whitespace-nowrap">{dcsMapBrightness.toFixed(2)}</span>
							<input
								className="w-12"
								type="range"
								min={0.5}
								max={2}
								step={0.05}
								value={dcsMapBrightness}
								onChange={(e) => {
									const value = Math.max(0.5, Math.min(2, parseFloat(e.target.value)));
									settingsStore.setState((state) => ({
										...state,
										map: {
											...state.map,
											dcsMapBrightness: value,
										},
									}));
								}}
							/>
						</div>
					</div>
				</td>
			</tr>
			}
			<tr>
				<td>
					<div className="my-2 flex flex-col gap-1">
						{map.getLayer("mgrs-grid")!.isVisible() === true && (
								<button 
									className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
									onClick={() => {map.getLayer("mgrs-grid")!.hide(); setSelectedButton("MgrsGrid-Off")}}
								>
									<BiShow className="inline-block w-4 h-4" />
								</button>
						)}
						{!map.getLayer("mgrs-grid")!.isVisible() && (
							<button 
								className="border bg-grey-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
								onClick={() => {map.getLayer("mgrs-grid")!.show(); setSelectedButton("MgrsGrid-On")}}
							>
								<BiHide className="inline-block w-4 h-4" />
							</button>
						)}
					</div>
				</td>
				<td>
					<div className="relative w-full pr-20">
						<span className="whitespace-nowrap">MGRS Grid</span>
						<div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1">
							<span className="text-xs whitespace-nowrap">{mgrsGridBrightness.toFixed(2)}</span>
							<input
								className="w-12"
								type="range"
								min={0.5}
								max={2}
								step={0.05}
								value={mgrsGridBrightness}
								onChange={(e) => {
									const value = Math.max(0.5, Math.min(2, parseFloat(e.target.value)));
									settingsStore.setState((state) => ({
										...state,
										map: {
											...state.map,
											mgrsGridBrightness: value,
										},
									}));
								}}
							/>
						</div>
					</div>
				</td>
			</tr>
			<tr>
				<td>
					<div className="my-2 flex flex-col gap-1">
						{map.getLayer("airports")!.isVisible() === true && (
								<button 
									className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
									onClick={() => {map.getLayer("airports")!.hide(); map.getLayer("farp-name")!.hide(); map.getLayer("farp-icon")!.hide(); setSelectedButton("Statics-Off")}}
								>
									<BiShow className="inline-block w-4 h-4" />
								</button>
						)}
						{!map.getLayer("airports")!.isVisible() && (
							<button 
								className="border bg-grey-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
								onClick={() => {map.getLayer("airports")!.show(); map.getLayer("farp-name")!.show(); map.getLayer("farp-icon")!.show(); setSelectedButton("Statics-On")}}
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
						{map.getLayer("combat-zones")!.isVisible() === true && (
								<button 
									className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
									onClick={() => {map.getLayer("combat-zones")!.hide(); map.getLayer("combat-zones-blue")!.hide(); map.getLayer("combat-zones-red")!.hide(); setSelectedButton("Combatzones-Off")}}
								>
									<BiShow className="inline-block w-4 h-4" />
								</button>
						)}
						{!map.getLayer("combat-zones")!.isVisible() && (
							<button 
								className="border bg-grey-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
								onClick={() => {map.getLayer("combat-zones")!.show(); map.getLayer("combat-zones-blue")!.show(); map.getLayer("combat-zones-red")!.show(); setSelectedButton("Combatzones-On")}}
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
						{map.getLayer("ground-units")!.isVisible() === true && (
								<button 
									className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
									onClick={() => {map.getLayer("ground-units")!.hide(); map.getLayer("ground-units-blue")!.hide(); map.getLayer("ground-units-red")!.hide(); setSelectedButton("Groundunits-Off")}}
								>
									<BiShow className="inline-block w-4 h-4" />
								</button>
						)}
						{!map.getLayer("ground-units")!.isVisible() && (
							<button 
								className="border bg-grey-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
								onClick={() => {map.getLayer("ground-units")!.show(); map.getLayer("ground-units-blue")!.show(); map.getLayer("ground-units-red")!.show(); setSelectedButton("Groundunits-On")}}
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
						{map.getLayer("custom-geometry")!.isVisible() === true && (
								<button 
									className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
									onClick={() => {map.getLayer("custom-geometry")!.hide(); map.getLayer("custom-geometry-zones")!.hide(); setSelectedButton("Customgeo-Off")}}
								>
									<BiShow className="inline-block w-4 h-4" />
								</button>
						)}
						{!map.getLayer("custom-geometry")!.isVisible() && (
							<button 
								className="border bg-grey-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
								onClick={() => {map.getLayer("custom-geometry")!.show(); map.getLayer("custom-geometry-zones")!.show(); setSelectedButton("Customgeo-On")}}
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
						{map.getLayer("quest")!.isVisible() === true && (
								<button 
									className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
									onClick={() => {map.getLayer("quest")!.hide(); map.getLayer("quest-pin")!.hide(); setSelectedButton("Missionpoints-Off")}}
								>
									<BiShow className="inline-block w-4 h-4" />
								</button>
						)}
						{!map.getLayer("quest")!.isVisible() && (
							<button 
								className="border bg-grey-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
								onClick={() => {map.getLayer("quest")!.show(); map.getLayer("quest-pin")!.show(); setSelectedButton("Missionpoints-On")}}
							>
								<BiHide className="inline-block w-4 h-4" />
							</button>
						)}
					</div>
				</td>
				<td>
					Mission points
				</td>
			</tr>
			<tr>
				<td>
					<div className="my-2 flex flex-col gap-1">
						{map.getLayer("track-icons")!.isVisible() === true && (
								<button 
									className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
									onClick={() => {map.getLayer("track-icons")!.hide(); map.getLayer("track-trails")!.hide(); map.getLayer("track-vv")!.hide(); map.getLayer("track-name")!.hide(); map.getLayer("track-altitude")!.hide(); map.getLayer("track-speed")!.hide(); map.getLayer("track-verticalvelo")!.hide(); setSelectedButton("Aircrafts-Off")}}
								>
									<BiShow className="inline-block w-4 h-4" />
								</button>
						)}
						{(view_aircraft_when_in_flight || !is_connected) && !map.getLayer("track-icons")!.isVisible() && (
							<button 
								className="border bg-grey-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"
								onClick={() => {map.getLayer("track-icons")!.show(); map.getLayer("track-trails")!.show(); map.getLayer("track-vv")!.show(); map.getLayer("track-name")!.show(); map.getLayer("track-altitude")!.show(); map.getLayer("track-speed")!.show(); map.getLayer("track-verticalvelo")!.show(); setSelectedButton("Aircrafts-On")}}
							>
								<BiHide className="inline-block w-4 h-4" />
							</button>
						)}
						{!view_aircraft_when_in_flight && is_connected && !map.getLayer("track-icons")!.isVisible() && (
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
  type ConsoleTab = null | "search" | "watch" | "draw" | "quest";
  const [selectedTab, setSelectedTab] = useState<ConsoleTab>(null);
  const [renderedTab, setRenderedTab] = useState<ConsoleTab>(null);
  const [tabPhase, setTabPhase] = useState<"idle" | "leaving" | "entering">("idle");
  const tabTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const TAB_ANIMATION_MS = 180;
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isAuthenticated = !!serverStore((state) => state?.server?.discord_id);
  const discord_name = serverStore((state) => state?.server?.discord_name);
  const avatar = serverStore((state) => state?.server?.avatar);
  const is_connected = serverStore((state) => state?.server?.player_is_connected);
  const is_editor = serverStore((state) => state?.server?.is_editor);
  const editor_mode_on = serverStore((state) => state?.editor_mode_on);
  const player_name = serverStore((state) => state?.server?.player_name);
  const handleConnect = () => {
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(`/discord/?return_to=${encodeURIComponent(returnTo)}`);
  };
  const handleDisconnect = async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch (_err) {
      // Ignore network errors and still clear local cookie.
    }
    document.cookie = "session_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    window.location.reload();
  };

  useEffect(() => {
    if (tabTransitionTimerRef.current) {
      clearTimeout(tabTransitionTimerRef.current);
      tabTransitionTimerRef.current = null;
    }

    if (selectedTab === renderedTab) return;

    if (renderedTab === null && selectedTab !== null) {
      setRenderedTab(selectedTab);
      setTabPhase("entering");
      requestAnimationFrame(() => setTabPhase("idle"));
      return;
    }

    if (renderedTab === null && selectedTab === null) return;

    // Old tab leaves, then the new one enters.
    setTabPhase("leaving");
    tabTransitionTimerRef.current = setTimeout(() => {
      setRenderedTab(selectedTab);
      if (selectedTab !== null) {
        setTabPhase("entering");
        requestAnimationFrame(() => setTabPhase("idle"));
      } else {
        setTabPhase("idle");
      }
    }, TAB_ANIMATION_MS);
  }, [selectedTab, renderedTab]);

  useEffect(() => {
    return () => {
      if (tabTransitionTimerRef.current) {
        clearTimeout(tabTransitionTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="m-2 absolute right-0 top-0 z-40">
      <div
        className="relative transition-transform duration-300 ease-in-out"
        style={{ transform: isCollapsed ? "translateX(236px)" : "translateX(0)" }}
      >
        <button
          title={isCollapsed ? "Show menu" : "Hide menu"}
          onClick={() => setIsCollapsed((value) => !value)}
          className="absolute left-[-16px] top-0 h-full w-4 bg-gray-200 border border-gray-500 rounded-l-sm shadow flex items-center justify-center"
        >
          {isCollapsed ? (
            <BiChevronLeft className="w-4 h-4" />
          ) : (
            <BiChevronRight className="w-4 h-4" />
          )}
        </button>
        <div className="flex flex-col bg-gray-200 border border-gray-500 shadow select-none rounded-sm w-60">
	  <div className="p-2 flex flex-row gap-2 align-middle ml-auto">
			{is_editor && (<div>{editor_mode_on ? (<button title="Editor mode" onClick={() => {updateServerStore({editor_mode_on:false}); updateGeometryStore({testUpdateStore:Math.random()})}} className="border bg-green-300 border-green-600 p-1 rounded-sm shadow-sm flex flex-row items-center"><BiSolidCctv className="inline-block w-4 h-4" /></button>) : 
													(<button title="Editor mode" onClick={() => {updateServerStore({editor_mode_on:true}); updateGeometryStore({testUpdateStore:Math.random()})}} className="border bg-grey-300 border-grey-600 p-1 rounded-sm shadow-sm flex flex-row items-center"><BiSolidCctv className="inline-block w-4 h-4" /></button>)}
						</div>)}
			<div>{isAuthenticated ? `Connected as ${discord_name}` : "Guest mode"}</div>
			<div className="flex flex-row gap-2"><ReactRoundedImage image={avatar} imageWidth="30" imageHeight="30" roundedSize="3"/></div>
			<div>
				{isAuthenticated ? (
					<button
						title="Disconnect"
						onClick={handleDisconnect}
						className="border bg-red-100 border-red-300 p-1 rounded-sm shadow-sm flex flex-row items-center"
					>
						<AiOutlineDisconnect className="inline-block w-4 h-4" />
					</button>
				) : (
					<button
						title="Connect"
						onClick={handleConnect}
						className="border bg-green-100 border-green-300 p-1 rounded-sm shadow-sm flex flex-row items-center"
					>
						<PiPlugsConnectedFill className="inline-block w-4 h-4" />
					</button>
				)}
			</div>
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
            title="Draw"
			onClick={() => isAuthenticated && setSelectedTab("draw")}
            className={classNames(
              "border bg-blue-100 border-blue-300 p-1 rounded-sm shadow-sm flex flex-row items-center",
              { "bg-blue-200": selectedTab === "draw", "opacity-40 cursor-not-allowed": !isAuthenticated }
            )}
          >
            <BiBrush className="inline-block w-4 h-4" />
          </button>
        </div>
        <div>
          <button
            title="Missions"
            onClick={() => isAuthenticated && setSelectedTab("quest")}
            className={classNames(
              "border bg-blue-100 border-blue-300 p-1 rounded-sm shadow-sm flex flex-row items-center",
              { "bg-blue-200": selectedTab === "quest", "opacity-40 cursor-not-allowed": !isAuthenticated }
            )}
          >
            <BiSolidMap className="inline-block w-4 h-4" />
          </button>
        </div>
        <div>
          <button
            title="Show / hide layers"
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
              title="Close current tab"
              className="border bg-red-100 border-red-300 p-1 rounded-sm shadow-sm flex flex-row items-center"
              onClick={() => setSelectedTab(null)}
            >
              <BiExit className="inline-block w-4 h-4" />
            </button>
          )} 
        </div>
        <div>
          <button
            title="Scratch pad"
            className="border bg-yellow-100 border-yellow-300 p-1 rounded-sm shadow-sm flex flex-row items-center"
            onClick={() => setScratchPadOpen(true)}
          >
            <BiNote className="inline-block w-4 h-4" />
          </button>
        </div>
      </div>
      <div
        className={classNames(
          "overflow-hidden origin-top transition-[max-height,opacity] ease-in-out",
          {
            "max-h-0 opacity-0":
              renderedTab === null && tabPhase === "idle",
            "max-h-[70vh] opacity-100":
              renderedTab !== null || tabPhase !== "idle",
          }
        )}
        style={{ transitionDuration: `${TAB_ANIMATION_MS}ms` }}
      >
        {renderedTab !== null && (
          <div
            className={classNames("transition-all", {
              "translate-x-4 opacity-0": tabPhase === "leaving",
              "-translate-x-4 opacity-0": tabPhase === "entering",
            })}
            style={{ transitionDuration: `${TAB_ANIMATION_MS}ms` }}
          >
            {renderedTab === "search" && <SearchTab map={map} />}
            {renderedTab === "watch" && <WatchTab map={map} />}
	        {renderedTab === "quest" && <QuestConsoleTab map={map} />}
            {renderedTab === "draw" && <DrawConsoleTab map={map} />}
          </div>
        )}
      </div>
        </div>
      </div>
    </div>
  );
}
