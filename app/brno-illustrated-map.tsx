"use client";

import { useId, type CSSProperties } from "react";
import districtData from "../lib/brno-districts.json";

type Coordinate = [number, number];
type DistrictFeature = {
  type: "Feature";
  geometry: { type: "Polygon"; coordinates: Coordinate[][] };
  properties: { kod: number; nazev: string; nazev_kratky: string };
};
type WaterFeature = {
  type: "Feature";
  geometry: { type: "LineString" | "MultiLineString"; coordinates: Coordinate[] | Coordinate[][] };
  properties: { idvt: number; naz_tok: string };
};
type DistrictCollection = {
  type: "FeatureCollection";
  features: DistrictFeature[];
  waterFeatures: WaterFeature[];
  metadata: {
    source: string;
    sourceUrl: string;
    districtSourceUrl: string;
    waterSourceUrl: string;
    licenseName: string;
    licenseUrl: string;
    cadastralSource: string;
    cadastralTermsUrl: string;
    coordinateSystem: string;
    note: string;
  };
};

export type BrnoMapRouteGroup = {
  district: string;
  routeCount: number;
  hasActive: boolean;
  isSeasonal: boolean;
};

type BrnoIllustratedMapProps = {
  routes: BrnoMapRouteGroup[];
  selectedDistrict?: string;
  onSelectDistrict?: (district: string) => void;
  variant?: "market" | "hero" | "detail";
  className?: string;
};

const geo = districtData as unknown as DistrictCollection;
const VIEWBOX = { width: 760, height: 600, padding: 32 } as const;
const LONGITUDE_SCALE = Math.cos((49.202 / 180) * Math.PI);
const visibleWaterways = new Set(["Svratka", "Svitava", "Ponávka", "Medlánecký p."]);

const routeAnchors: Record<string, { municipality: string; coordinates: Coordinate; mobileOffset: Coordinate }> = {
  "Královo Pole": { municipality: "Brno-Královo Pole", coordinates: [16.596, 49.226], mobileOffset: [20, 4] },
  "Brno-střed": { municipality: "Brno-střed", coordinates: [16.609, 49.194], mobileOffset: [25, 28] },
  Žabovřesky: { municipality: "Brno-Žabovřesky", coordinates: [16.578, 49.213], mobileOffset: [-30, 16] },
  Medlánky: { municipality: "Brno-Medlánky", coordinates: [16.572, 49.242], mobileOffset: [-34, -8] },
  "Černá Pole": { municipality: "Brno-sever", coordinates: [16.615, 49.216], mobileOffset: [36, -12] },
  "Řečkovice a Mokrá Hora": { municipality: "Brno-Řečkovice a Mokrá Hora", coordinates: [16.584, 49.254], mobileOffset: [8, -34] },
  "Kraví hora": { municipality: "Brno-střed", coordinates: [16.583, 49.204], mobileOffset: [-20, 34] },
  "Bystrc · Zoo Brno": { municipality: "Brno-Bystrc", coordinates: [16.533, 49.23], mobileOffset: [-8, 0] },
};

type MarkerStyle = CSSProperties & { "--marker-x": string; "--marker-y": string };

const allCoordinates = geo.features.flatMap((feature) => feature.geometry.coordinates.flat());
const bounds = allCoordinates.reduce(
  (result, [longitude, latitude]) => ({
    minLongitude: Math.min(result.minLongitude, longitude),
    maxLongitude: Math.max(result.maxLongitude, longitude),
    minLatitude: Math.min(result.minLatitude, latitude),
    maxLatitude: Math.max(result.maxLatitude, latitude),
  }),
  {
    minLongitude: Number.POSITIVE_INFINITY,
    maxLongitude: Number.NEGATIVE_INFINITY,
    minLatitude: Number.POSITIVE_INFINITY,
    maxLatitude: Number.NEGATIVE_INFINITY,
  },
);
const geographicWidth = (bounds.maxLongitude - bounds.minLongitude) * LONGITUDE_SCALE;
const geographicHeight = bounds.maxLatitude - bounds.minLatitude;
const projectionScale = Math.min(
  (VIEWBOX.width - VIEWBOX.padding * 2) / geographicWidth,
  (VIEWBOX.height - VIEWBOX.padding * 2) / geographicHeight,
);
const renderedWidth = geographicWidth * projectionScale;
const renderedHeight = geographicHeight * projectionScale;
const offsetX = (VIEWBOX.width - renderedWidth) / 2;
const offsetY = (VIEWBOX.height - renderedHeight) / 2;

function project([longitude, latitude]: Coordinate) {
  return {
    x: offsetX + (longitude - bounds.minLongitude) * LONGITUDE_SCALE * projectionScale,
    y: offsetY + (bounds.maxLatitude - latitude) * projectionScale,
  };
}

function linePath(points: Coordinate[], close = false) {
  const path = points.map((point, index) => {
    const { x, y } = project(point);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  return close ? `${path} Z` : path;
}

function polygonPath(rings: Coordinate[][]) {
  return rings.map((ring) => linePath(ring, true)).join(" ");
}

function waterPaths(feature: WaterFeature) {
  if (feature.geometry.type === "LineString") return [linePath(feature.geometry.coordinates as Coordinate[])];
  return (feature.geometry.coordinates as Coordinate[][]).map((line) => linePath(line));
}

const renderedDistricts = geo.features.map((feature) => ({ ...feature.properties, path: polygonPath(feature.geometry.coordinates) }));
const renderedWaterways = geo.waterFeatures
  .filter((feature) => visibleWaterways.has(feature.properties.naz_tok.trim()))
  .flatMap((feature) => waterPaths(feature).map((path, index) => ({
    id: `${feature.properties.idvt}-${index}`,
    name: feature.properties.naz_tok.trim(),
    path,
  })));

function routeSymbol(route: BrnoMapRouteGroup) {
  if (route.hasActive) return "⌖";
  if (route.isSeasonal) return "✦";
  return "·";
}

export function BrnoIllustratedMap({ routes, selectedDistrict, onSelectDistrict, variant = "market", className = "" }: BrnoIllustratedMapProps) {
  const patternId = useId().replace(/:/g, "");
  const selectedMunicipality = selectedDistrict ? routeAnchors[selectedDistrict]?.municipality : undefined;
  const routeMunicipalities = new Set(routes.map((route) => routeAnchors[route.district]?.municipality).filter(Boolean));
  const selectedAnchor = selectedDistrict ? routeAnchors[selectedDistrict] : undefined;

  return (
    <figure className={`brno-illustrated-map brno-map-${variant} ${className}`.trim()}>
      <div className="brno-map-stage">
        <svg className="brno-map-svg" viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`} role="img" aria-labelledby={`${patternId}-title ${patternId}-description`} preserveAspectRatio="xMidYMid meet">
          <title id={`${patternId}-title`}>Mapa městských částí Brna</title>
          <desc id={`${patternId}-description`}>Geograficky věrné hranice 29 městských částí a hlavní vodní toky. Značky ukazují pouze orientační oblasti herních tras.</desc>
          <defs>
            <pattern id={`${patternId}-paper`} width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(12)">
              <path d="M0 11H22" className="brno-map-paper-line" />
            </pattern>
            <filter id={`${patternId}-rough`} x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="2" seed="7" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.4" />
            </filter>
          </defs>
          <rect width={VIEWBOX.width} height={VIEWBOX.height} className="brno-map-background" />
          <rect width={VIEWBOX.width} height={VIEWBOX.height} fill={`url(#${patternId}-paper)`} />
          <g className="brno-map-districts" filter={`url(#${patternId}-rough)`}>
            {renderedDistricts.map((district) => {
              const selected = district.nazev === selectedMunicipality;
              const hasRoute = routeMunicipalities.has(district.nazev);
              return <path key={district.kod} d={district.path} className={`${hasRoute ? "has-route" : ""} ${selected ? "selected" : ""}`.trim()} fillRule="evenodd" data-district={district.nazev_kratky}><title>{district.nazev}</title></path>;
            })}
          </g>
          <g className="brno-map-water" aria-label="Svratka, Svitava, Ponávka a Medlánecký potok">
            {renderedWaterways.map((waterway) => <path key={waterway.id} d={waterway.path}><title>{waterway.name}</title></path>)}
          </g>
          {selectedAnchor && (() => {
            const point = project(selectedAnchor.coordinates);
            return <circle cx={point.x} cy={point.y} r="37" className="brno-map-route-zone" aria-hidden="true" />;
          })()}
          <g className="brno-map-city-label" aria-hidden="true"><text x="380" y="320">BRNO</text></g>
        </svg>

        <div className="brno-map-route-layer" role="group" aria-label="Oblasti dostupných a připravovaných tras">
          {routes.map((route) => {
            const anchor = routeAnchors[route.district];
            if (!anchor) return null;
            const point = project(anchor.coordinates);
            const marker = <><span aria-hidden="true"><i>{routeSymbol(route)}</i></span><small>{route.district.replace(" · Zoo Brno", "")}{route.routeCount > 1 && <b>{route.routeCount}</b>}</small></>;
            const style: MarkerStyle = {
              left: `${(point.x / VIEWBOX.width) * 100}%`,
              top: `${(point.y / VIEWBOX.height) * 100}%`,
              "--marker-x": `${anchor.mobileOffset[0]}px`,
              "--marker-y": `${anchor.mobileOffset[1]}px`,
            };
            const markerClass = `brno-route-marker ${route.district === selectedDistrict ? "selected" : ""} ${route.isSeasonal ? "seasonal" : ""}`.trim();
            const label = `${route.district}: ${route.routeCount} ${route.routeCount === 1 ? "trasa" : route.routeCount < 5 ? "trasy" : "tras"}`;
            return onSelectDistrict
              ? <button key={route.district} type="button" className={markerClass} style={style} onClick={() => onSelectDistrict(route.district)} aria-label={label} aria-pressed={route.district === selectedDistrict}>{marker}</button>
              : <div key={route.district} className={markerClass} style={style} role="img" aria-label={label}>{marker}</div>;
          })}
        </div>

        <div className="brno-map-north" aria-hidden="true"><b>N</b><span>✦</span></div>
        {variant === "market" && <div className="brno-map-legend" aria-hidden="true"><span><i className="active" /> aktivní</span><span><i /> připravujeme</span><span><i className="seasonal" /> sezónní</span></div>}
      </div>
      <figcaption><span><a href={geo.metadata.districtSourceUrl} target="_blank" rel="noreferrer">Hranice MČ</a> a <a href={geo.metadata.waterSourceUrl} target="_blank" rel="noreferrer">vodní toky</a>: Statutární město Brno · <a href={geo.metadata.cadastralTermsUrl} target="_blank" rel="noreferrer">{geo.metadata.cadastralSource}</a> · <a href={geo.metadata.licenseUrl} target="_blank" rel="noreferrer">{geo.metadata.licenseName}</a></span><span>Geometrie zjednodušena. Značky ukazují oblast; přesná cesta se odhaluje ve hře.</span></figcaption>
    </figure>
  );
}

export const brnoMapSource = geo.metadata;
