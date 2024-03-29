import { planes } from "../dcs/aircraft";

export type RawEntityData = {
  id: number;
  types: Array<string>;
  properties: Record<string, unknown>;
  longitude: number;
  latitude: number;
  altitude: number;
  heading: number;
  updated_at: number;
  created_at: number;
  visible: boolean;
  ratio_long: number;
  ratio_lat: number;
};

export class Entity {
  id: number;
  types: Array<string>;
  properties: Record<string, unknown>;
  longitude: number;
  latitude: number;
  altitude: number;
  heading: number;
  updatedAt: number;
  createdAt: number;
  visible: boolean;
  ratioLong: number;
  ratioLat: number;

  constructor(data: RawEntityData) {
    this.id = data.id;
    this.types = data.types;
    this.properties = data.properties;
    this.longitude = data.longitude;
    this.latitude = data.latitude;
    this.altitude = data.altitude;
    this.heading = data.heading;
    this.updatedAt = data.updated_at;
    this.createdAt = data.created_at;
	this.visible = data.visible;
	this.ratioLong = data.ratio_long;
	this.ratioLat = data.ratio_lat;
  }

  get coalition(): string {
    return this.properties["Coalition"] as string;
  }

  get name(): string {
    return this.properties["Name"] as string;
  }

  get pilot(): string {
    return this.properties["Pilot"] as string;
  }

  get group(): string {
    return this.properties["Group"] as string;
  }

  get sidc(): string {
    const ident = this.coalition === "Allies" ? "H" : "F";
    if (this.types.includes("Bullseye")) {
      return `G${ident}G-GPWA--`;
    }

    let battleDimension = "z";
    if (this.types.includes("Air")) {
      battleDimension = "a";
    } else if (this.types.includes("Sea")) {
      battleDimension = "s";
    } else if (this.types.includes("Ground")) {
      battleDimension = "g";
    }

    const plane = planes[this.name];
    if (plane !== undefined) {
      return `S${ident}${battleDimension}-${plane.sidcPlatform}--`;
    } else if (this.types.includes("Air")) {
      console.log(
        `Missing AIR SIDC platform definition: ${this.name} (${
          this.types.join(", ")
        })`,
      );
    }

    return `S${ident}${battleDimension}-------`;
  }
}

export function getCoalitionColor(coalition: string) {
  if (coalition === "Allies") {
    return "#e63e3e" //"#e63e3e"; //"#ff8080";
  } else if (coalition === "Enemies") {
    return "#0049FF"; //"#17c2f6";
  } else {
    return "#FBBF24"; //"#FBBF24";
  }
}

export function getCoalitionIdentity(coalition: string) {
  if (coalition === "Allies") {
    return "H";
  } else if (coalition === "Enemies") {
    return "F";
  } else {
    return "U";
  }
}
