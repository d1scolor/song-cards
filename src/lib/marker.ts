import aruco from "js-aruco2";

export const markerDictionary = "ARUCO_MIP_36h12";
export const markerCapacity = 250;

export function generateMarkerSvg(markerId: number) {
  if (!Number.isInteger(markerId) || markerId < 0 || markerId >= markerCapacity) {
    throw new Error("Marker ID must be between 0 and 249.");
  }
  const dictionary = new aruco.AR.Dictionary(markerDictionary);
  return dictionary.generateSVG(markerId);
}
