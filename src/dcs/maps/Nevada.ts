import NevadaAirBases from "../../data/airbases/nevada.json";
import { convertRawAirBaseData, DCSMap } from "./DCSMap";

export const Nevada: DCSMap = {
  name: "Nevada",
  center: [37.5, -115.15],
  magDec: -12,
  airports: convertRawAirBaseData(NevadaAirBases),
};
