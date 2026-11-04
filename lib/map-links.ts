export type MapCoordinates = {
  lat: number;
  lng: number;
};

function fixed(value: number) {
  return value.toFixed(6);
}

export function mapyPointUrl({ lat, lng }: MapCoordinates) {
  return `https://mapy.com/fnc/v1/showmap?mapset=basic&center=${fixed(lng)},${fixed(lat)}&zoom=17&marker=true`;
}

export function mapyWalkingDirectionsUrl({ lat, lng }: MapCoordinates) {
  return `https://mapy.com/fnc/v1/route?end=${fixed(lng)},${fixed(lat)}&routeType=foot_fast&navigate=true`;
}

export function googlePointUrl({ lat, lng }: MapCoordinates) {
  return `https://www.google.com/maps/search/?api=1&query=${fixed(lat)}%2C${fixed(lng)}`;
}

export function googleWalkingDirectionsUrl({ lat, lng }: MapCoordinates) {
  return `https://www.google.com/maps/dir/?api=1&destination=${fixed(lat)}%2C${fixed(lng)}&travelmode=walking&dir_action=navigate`;
}

export function openStreetMapEmbedUrl({ lat, lng }: MapCoordinates) {
  const horizontalPadding = 0.006;
  const verticalPadding = 0.0035;
  const params = new URLSearchParams({
    bbox: [
      fixed(lng - horizontalPadding),
      fixed(lat - verticalPadding),
      fixed(lng + horizontalPadding),
      fixed(lat + verticalPadding),
    ].join(","),
    layer: "mapnik",
    marker: `${fixed(lat)},${fixed(lng)}`,
  });
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
}

export function googleMapsEmbedUrl({ lat, lng }: MapCoordinates, apiKey: string) {
  const params = new URLSearchParams({
    key: apiKey,
    q: `${fixed(lat)},${fixed(lng)}`,
    zoom: "17",
  });
  return `https://www.google.com/maps/embed/v1/place?${params.toString()}`;
}

export function distanceInMeters(from: MapCoordinates, to: MapCoordinates) {
  const earthRadius = 6_371_000;
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(to.lat - from.lat);
  const longitudeDelta = radians(to.lng - from.lng);
  const fromLatitude = radians(from.lat);
  const toLatitude = radians(to.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
}

export function formatMapDistance(distance: number) {
  if (distance < 1_000) return `${Math.max(1, distance)} m`;
  return `${(distance / 1_000).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} km`;
}
