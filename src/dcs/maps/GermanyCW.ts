import GermanyCWAirBases from "../../data/airbases/GermanyCW.json";
import { convertRawAirBaseData, DCSMap } from "./DCSMap";

export const GermanyCW: DCSMap = {
  name: "GermanyCW",
  center: [49.43, 7.59],
  magDec: 1,
  airports: convertRawAirBaseData(GermanyCWAirBases),
};
