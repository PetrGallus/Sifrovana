"use client";

import { useMemo, useState } from "react";
import {
  distanceInMeters,
  formatMapDistance,
  googleMapsEmbedUrl,
  googleWalkingDirectionsUrl,
  mapyWalkingDirectionsUrl,
  openStreetMapEmbedUrl,
  type MapCoordinates,
} from "../lib/map-links";

type LocationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; coordinates: MapCoordinates; accuracy: number }
  | { status: "error"; message: string };

export function CheckpointMap({ title, coordinates }: { title: string; coordinates: MapCoordinates }) {
  const [location, setLocation] = useState<LocationState>({ status: "idle" });
  const googleEmbedKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY?.trim();
  const iframeUrl = googleEmbedKey
    ? googleMapsEmbedUrl(coordinates, googleEmbedKey)
    : openStreetMapEmbedUrl(coordinates);
  const provider = googleEmbedKey ? "Google Maps" : "OpenStreetMap";
  const distance = useMemo(() => location.status === "ready"
    ? distanceInMeters(location.coordinates, coordinates)
    : null, [coordinates, location]);

  function requestLocation() {
    if (!("geolocation" in navigator)) {
      setLocation({ status: "error", message: "Tento prohlížeč polohu nepodporuje. Navigaci můžeš otevřít i bez ní." });
      return;
    }

    setLocation({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (position) => setLocation({
        status: "ready",
        coordinates: { lat: position.coords.latitude, lng: position.coords.longitude },
        accuracy: Math.round(position.coords.accuracy),
      }),
      (error) => setLocation({
        status: "error",
        message: error.code === error.PERMISSION_DENIED
          ? "Poloha nebyla povolena. Hru i externí navigaci můžeš dál používat."
          : "Polohu se teď nepodařilo určit. Zkus to znovu venku nebo otevři externí navigaci.",
      }),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 15_000 },
    );
  }

  return (
    <>
      <div className="live-map live-map-provider">
        <iframe
          src={iframeUrl}
          title={`Mapa aktuálního checkpointu ${title}`}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
        <span className="map-provider-label">{provider} · zobrazen je pouze aktuální bod</span>
      </div>
      <div className="checkpoint-map-tools">
        <div className="checkpoint-location-status" aria-live="polite">
          <button type="button" onClick={requestLocation} disabled={location.status === "loading"}>
            {location.status === "loading" ? "Zjišťuji polohu…" : location.status === "ready" ? "Aktualizovat polohu" : "⌖ Ukázat mou vzdálenost"}
          </button>
          {location.status === "ready" && distance !== null && (
            <span><b>{formatMapDistance(distance)}</b> vzdušnou čarou <small>přesnost ±{location.accuracy} m</small></span>
          )}
          {location.status === "error" && <span className="location-error">{location.message}</span>}
        </div>
        <div className="external-map-links">
          <a href={mapyWalkingDirectionsUrl(coordinates)} target="_blank" rel="noreferrer">Navigovat v Mapy.com ↗</a>
          <a href={googleWalkingDirectionsUrl(coordinates)} target="_blank" rel="noreferrer">Google Maps ↗</a>
        </div>
      </div>
    </>
  );
}
