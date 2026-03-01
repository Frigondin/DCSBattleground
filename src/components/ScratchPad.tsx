import { throttle } from "lodash";
import Coord from "coordinate-parser";
import * as maptalks from "maptalks";
import * as mgrs from "mgrs";
import { useEffect, useMemo, useRef, useState } from "react";
import { BiX, BiChevronUp, BiChevronDown } from "react-icons/bi";
import { formatDDM, formatDMS } from "../util";

function formatMgrs(coords: [number, number]): string {
  const val: string = mgrs.forward([coords[1], coords[0]]);
  return `${val.slice(0, 3)} ${val.slice(3, 5)} ${val.slice(5, 10)} ${val.slice(10)}`;
}

function parseCoord(value: string): null | [number, number] {
  const input = value.trim().toUpperCase().replace(/\s+/g, " ");
  if (!input) return null;
  try {
    const coord = new Coord(input);
    return [coord.getLatitude(), coord.getLongitude()];
  } catch (_err) {
    try {
      const coord = mgrs.toPoint(input.replace(/\s+/g, ""));
      return [coord[1], coord[0]];
    } catch (_err2) {
      return null;
    }
  }
}

export default function ScratchPad({ close, map }: { close: () => void; map: maptalks.Map }) {
  const [contents, setContents] = useState(
    localStorage.getItem("scratchpad") || ""
  );
  const [dmsInput, setDmsInput] = useState("");
  const [ddmInput, setDdmInput] = useState("");
  const [mgrsInput, setMgrsInput] = useState("");
  const [activeField, setActiveField] = useState<"dms" | "ddm" | "mgrs">("dms");
  const [isPickingFromMap, setIsPickingFromMap] = useState(false);
  const [keyboardCollapsed, setKeyboardCollapsed] = useState(false);
  const [convertError, setConvertError] = useState("");
  const dmsInputRef = useRef<any>(null);
  const ddmInputRef = useRef<any>(null);
  const mgrsInputRef = useRef<any>(null);
  const panelRef = useRef<any>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    const raw = localStorage.getItem("scratchpad_pos");
    if (!raw) return { x: 0, y: 320 };
    try {
      const parsed = JSON.parse(raw);
      return { x: parsed.x || 0, y: parsed.y || 0 };
    } catch (_err) {
      return { x: 0, y: 0 };
    }
  });
  const draggingRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({
    dragging: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });

  const decimalPreview = useMemo(() => {
    const parsed = parseCoord(dmsInput) || parseCoord(ddmInput) || parseCoord(mgrsInput);
    if (!parsed) return "";
    return `${parsed[0].toFixed(6)}, ${parsed[1].toFixed(6)}`;
  }, [dmsInput, ddmInput, mgrsInput]);

  const clampPosition = (next: { x: number; y: number }) => {
    const panelWidth = panelRef.current?.offsetWidth ?? 384;
    const panelHeight = panelRef.current?.offsetHeight ?? 560;
    const maxX = Math.max(0, window.innerWidth - panelWidth);
    const maxY = Math.max(0, window.innerHeight - panelHeight);
    return {
      x: Math.min(Math.max(0, next.x), maxX),
      y: Math.min(Math.max(0, next.y), maxY),
    };
  };

  useEffect(
    throttle(() => {
      localStorage.setItem("scratchpad", contents);
    }, 250),
    [contents]
  );

  useEffect(
    throttle(() => {
      localStorage.setItem("scratchpad_pos", JSON.stringify(position));
    }, 250),
    [position]
  );

  const convertFrom = (raw: string) => {
    const parsed = parseCoord(raw);
    if (!parsed) {
      setConvertError("Invalid format. Use DMS, DDM or MGRS.");
      return;
    }
    setConvertError("");
    setDmsInput(formatDMS(parsed));
    setDdmInput(formatDDM(parsed));
    setMgrsInput(formatMgrs(parsed));
  };

  const fillFromLatLon = (lat: number, lon: number) => {
    const parsed: [number, number] = [lat, lon];
    setConvertError("");
    setDmsInput(formatDMS(parsed));
    setDdmInput(formatDDM(parsed));
    setMgrsInput(formatMgrs(parsed));
  };

  const getActiveValue = () => {
    if (activeField === "dms") return dmsInput;
    if (activeField === "ddm") return ddmInput;
    return mgrsInput;
  };

  const setActiveValue = (next: string) => {
    if (activeField === "dms") setDmsInput(next);
    else if (activeField === "ddm") setDdmInput(next);
    else setMgrsInput(next);
  };

  const getActiveInputRef = () => {
    if (activeField === "dms") return dmsInputRef.current;
    if (activeField === "ddm") return ddmInputRef.current;
    return mgrsInputRef.current;
  };

  const pressVirtualKey = (key: string) => {
    const activeValue = getActiveValue();
    const input = getActiveInputRef();

    if (key === "ENTER") {
      convertFrom(activeValue);
      return;
    }
    if (key === "CLR") {
      setActiveValue("");
      return;
    }
    if (key === "BKSP") {
      if (input) {
        const start = input.selectionStart ?? activeValue.length;
        const end = input.selectionEnd ?? activeValue.length;
        if (start !== end) {
          const next = activeValue.slice(0, start) + activeValue.slice(end);
          setActiveValue(next);
          requestAnimationFrame(() => {
            input.focus();
            input.setSelectionRange(start, start);
          });
        } else if (start > 0) {
          const next = activeValue.slice(0, start - 1) + activeValue.slice(end);
          setActiveValue(next);
          requestAnimationFrame(() => {
            input.focus();
            input.setSelectionRange(start - 1, start - 1);
          });
        }
      } else {
        setActiveValue(activeValue.slice(0, -1));
      }
      return;
    }

    const outputKey = key === "SPACE" ? " " : key;
    if (input) {
      const start = input.selectionStart ?? activeValue.length;
      const end = input.selectionEnd ?? activeValue.length;
      const next = activeValue.slice(0, start) + outputKey + activeValue.slice(end);
      setActiveValue(next);
      requestAnimationFrame(() => {
        const pos = start + outputKey.length;
        input.focus();
        input.setSelectionRange(pos, pos);
      });
    } else {
      setActiveValue(activeValue + outputKey);
    }
  };

  const keyboardRows = [
    ["1", "2", "3", "A", "B", "C", "D", "E", "F"],
    ["4", "5", "6", "G", "H", "I", "J", "K", "L"],
    ["7", "8", "9", "M", "N", "O", "P", "Q", "R"],
    [".", "0", "/", "S", "T", "U", "V", "W", "X"],
    ["N", "S", "E", "W", "Y", "Z", "SPACE", "BKSP", "CLR", "ENTER"],
  ];

  const onMouseDownHeader = (e: any) => {
    draggingRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: position.x,
      originY: position.y,
    };
    e.preventDefault();
  };

  const onTouchStartHeader = (e: any) => {
    const touch = e.touches?.[0];
    if (!touch) return;
    draggingRef.current = {
      dragging: true,
      startX: touch.clientX,
      startY: touch.clientY,
      originX: position.x,
      originY: position.y,
    };
  };

  useEffect(() => {
    // Ensure restored position never overflows viewport.
    setPosition((prev) => clampPosition(prev));
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current.dragging) return;
      const dx = e.clientX - draggingRef.current.startX;
      const dy = e.clientY - draggingRef.current.startY;
      setPosition(clampPosition({
        x: draggingRef.current.originX + dx,
        y: draggingRef.current.originY + dy,
      }));
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!draggingRef.current.dragging) return;
      const touch = e.touches?.[0];
      if (!touch) return;
      const dx = touch.clientX - draggingRef.current.startX;
      const dy = touch.clientY - draggingRef.current.startY;
      setPosition(clampPosition({
        x: draggingRef.current.originX + dx,
        y: draggingRef.current.originY + dy,
      }));
      e.preventDefault();
    };
    const onUp = () => {
      draggingRef.current.dragging = false;
    };
    const onResize = () => {
      setPosition((prev) => clampPosition(prev));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (!isPickingFromMap) return;
    const onMapClick = (e: any) => {
      const coord = e?.coordinate;
      if (!coord) return;
      fillFromLatLon(coord.y, coord.x);
      setIsPickingFromMap(false);
    };
    map.on("click", onMapClick);
    return () => {
      map.off("click", onMapClick);
    };
  }, [isPickingFromMap, map]);

  return (
    <div
      ref={panelRef}
      className="absolute z-40 w-[92vw] max-w-80 max-h-[85vh] flex flex-col border border-gray-300 rounded-sm bg-white shadow overflow-hidden"
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      <div
        className="bg-gray-300 p-0.5 text-sm flex flex-row items-center border-b border-gray-400 cursor-move select-none"
        onMouseDown={onMouseDownHeader}
        onTouchStart={onTouchStartHeader}
      >
        <div>Scratch Pad</div>
        <button className="ml-auto flex flex-row items-center" onClick={close}>
          <BiX className="inline-block w-6 h-6 text-red-500" />
        </button>
      </div>
      <textarea
        className="form-textarea w-full h-28 p-0.5"
        onChange={(e: any) => setContents(e.target.value)}
        value={contents}
      />
      <div className="border-t border-gray-300 p-1.5 text-xs flex flex-col gap-1 bg-gray-50 overflow-auto">
        <div className="flex items-center gap-2">
          <div className="font-semibold">Coordinate Converter</div>
          <button
            type="button"
            className={isPickingFromMap
              ? "border border-green-500 bg-green-200 rounded-sm px-1.5 py-0.5 text-[11px]"
              : "border border-gray-300 bg-white hover:bg-gray-100 rounded-sm px-1.5 py-0.5 text-[11px]"}
            onClick={() => setIsPickingFromMap((v) => !v)}
            title="Pick coordinate from map"
          >
            {isPickingFromMap ? "Click map..." : "Pick on map"}
          </button>
          <button
            type="button"
            title={keyboardCollapsed ? "Show keyboard" : "Hide keyboard"}
            className="ml-auto border border-gray-300 bg-white hover:bg-gray-100 rounded-sm px-1.5 py-0.5 text-[11px] flex items-center gap-1"
            onClick={() => setKeyboardCollapsed((v) => !v)}
          >
            {keyboardCollapsed ? <BiChevronUp className="w-3 h-3" /> : <BiChevronDown className="w-3 h-3" />}
            KB
          </button>
        </div>
        <input
          ref={dmsInputRef}
          className="form-input w-full p-1 rounded-sm"
          placeholder="DMS (ex: N43 12 34 E001 23 45)"
          value={dmsInput}
          onFocus={() => setActiveField("dms")}
          onChange={(e: any) => setDmsInput(e.target.value.toUpperCase())}
          onKeyDown={(e: any) => e.key === "Enter" && convertFrom(dmsInput)}
        />
        <input
          ref={ddmInputRef}
          className="form-input w-full p-1 rounded-sm"
          placeholder="DDM (ex: N43°12.34567 E001°23.45678)"
          value={ddmInput}
          onFocus={() => setActiveField("ddm")}
          onChange={(e: any) => setDdmInput(e.target.value.toUpperCase())}
          onKeyDown={(e: any) => e.key === "Enter" && convertFrom(ddmInput)}
        />
        <input
          ref={mgrsInputRef}
          className="form-input w-full p-1 rounded-sm"
          placeholder="MGRS (ex: 31TCJ 12345 67890)"
          value={mgrsInput}
          onFocus={() => setActiveField("mgrs")}
          onChange={(e: any) => setMgrsInput(e.target.value.toUpperCase())}
          onKeyDown={(e: any) => e.key === "Enter" && convertFrom(mgrsInput)}
        />
        {convertError && <div className="text-red-600">{convertError}</div>}
        {!convertError && decimalPreview && <div className="text-gray-600">Lat/Lon: {decimalPreview}</div>}
        <div
          className={keyboardCollapsed ? "max-h-0 opacity-0 overflow-hidden transition-all duration-200" : "max-h-96 opacity-100 transition-all duration-200"}
        >
          <div className="mt-1 text-[11px] text-gray-600">Virtual keyboard ({activeField.toUpperCase()} active)</div>
          {keyboardRows.map((row, rowIdx) => (
            <div
              key={`kb-row-${rowIdx}`}
              className="grid gap-0.5"
              style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
            >
              {row.map((key) => (
                <button
                  key={`kb-${rowIdx}-${key}`}
                  type="button"
                  className={key === "ENTER"
                    ? "border border-green-400 rounded-sm bg-green-100 hover:bg-green-200 py-0.5 text-[11px]"
                    : "border border-gray-300 rounded-sm bg-white hover:bg-gray-100 py-0.5 text-[11px]"}
                  onClick={() => pressVirtualKey(key)}
                >
                  {key === "SPACE"
                    ? "SPC"
                    : key === "BKSP"
                    ? "BCK"
                    : key === "CLR"
                    ? "CLR"
                    : key === "ENTER"
                    ? "MK"
                    : key}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
