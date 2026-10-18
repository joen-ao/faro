"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "./hunts.css";
import { setWorkerUrl, type ExpressionSpecification, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import { Crosshair } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGL, { AttributionControl, Layer, NavigationControl, Popup, Source, type LayerProps, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import { boundsOf, hasLocation, toFeatureCollection, unionBounds } from "../geojson";
import type { StreamPoint } from "../types";
import { prefersReducedMotion } from "./use-count-up";
import type { ArrivalBatch } from "./use-hunt-stream";

// Turbopack rewrites `import.meta.url`, which breaks MapLibre's default worker lookup: serve the worker ourselves.
// public/maplibre-gl-worker.mjs is a verbatim copy of node_modules/maplibre-gl/dist (guarded by a unit test).
setWorkerUrl("/maplibre-gl-worker.mjs");

export const DEFAULT_MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE;

/** Used only if the style JSON cannot be fetched: the points still render over plain black. */
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf",
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#0a0a0b" } }],
};

const BOGOTA: [number, number] = [-74.08, 4.66];
const FONT = ["Montserrat Medium", "Open Sans Bold", "Noto Sans Regular"];
const LIME = "#cbe850";
const FOUND = "#8a8a8f";
const IS_FIT: ExpressionSpecification = ["in", ["get", "status"], ["literal", ["fit", "contacted", "qualified"]]];
const isStatus = (s: string): ExpressionSpecification => ["==", ["get", "status"], s];
const zoomR = (a: number, b: number, c: number): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], 9, a, 13, b, 17, c];

/** Zoom must be the outermost expression: each stop picks its radius by status (found, fit, contacted/qualified). */
const radiusAt = (found: number, fit: number, adv: number): ExpressionSpecification => ["match", ["get", "status"], "found", found, "fit", fit, adv];

const clusterLayer: LayerProps = {
  id: "clusters",
  type: "circle",
  source: "leads",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": ["interpolate", ["linear"], ["/", ["get", "fit"], ["max", ["get", "point_count"], 1]], 0, "#3a3a3e", 0.55, "#8d9a43", 1, LIME],
    "circle-radius": ["step", ["get", "point_count"], 15, 10, 19, 50, 25, 200, 33, 800, 42],
    "circle-stroke-width": 5,
    "circle-stroke-color": "rgba(203,232,80,0.14)",
    "circle-opacity": 0.95,
  },
};
const clusterCountLayer: LayerProps = {
  id: "cluster-count",
  type: "symbol",
  source: "leads",
  filter: ["has", "point_count"],
  layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": FONT, "text-size": 12, "text-allow-overlap": true },
  paint: {
    "text-color": ["case", [">", ["/", ["get", "fit"], ["max", ["get", "point_count"], 1]], 0.5], "#1a1a1c", "#ffffff"],
  },
};
const haloLayer: LayerProps = {
  id: "pt-halo",
  type: "circle",
  source: "leads",
  filter: ["all", ["!", ["has", "point_count"]], ["in", ["get", "status"], ["literal", ["contacted", "qualified"]]]],
  paint: { "circle-color": ["match", ["get", "status"], "contacted", "#ffffff", LIME], "circle-radius": zoomR(8, 13, 20), "circle-opacity": 0.16, "circle-blur": 0.7 },
};
const pointLayer: LayerProps = {
  id: "pt",
  type: "circle",
  source: "leads",
  filter: ["!", ["has", "point_count"]],
  layout: { "circle-sort-key": ["match", ["get", "status"], "qualified", 3, "contacted", 2, "fit", 1, 0] },
  paint: {
    "circle-color": ["match", ["get", "status"], "qualified", LIME, "contacted", "#ffffff", "fit", LIME, FOUND],
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, radiusAt(2.2, 3, 3.6), 13, radiusAt(4, 5.5, 6), 17, radiusAt(7, 9, 10)],
    "circle-opacity": ["*", ["match", ["get", "status"], "found", 0.7, 1], ["case", ["boolean", ["get", "approx"], false], 0.55, 1]],
    "circle-stroke-width": ["match", ["get", "status"], "qualified", 1.6, "contacted", 1.2, 0],
    "circle-stroke-color": ["match", ["get", "status"], "qualified", "#ffffff", "contacted", "rgba(203,232,80,0.9)", "transparent"],
  },
};
const pulseLayer: LayerProps = {
  id: "pt-pulse",
  type: "circle",
  source: "leads",
  filter: ["all", ["!", ["has", "point_count"]], isStatus("qualified")],
  paint: { "circle-color": LIME, "circle-radius": 10, "circle-opacity": 0, "circle-pitch-alignment": "map" },
};
const ringLayer = (c: number): LayerProps => ({
  id: `arr-${c}`,
  type: "circle",
  source: "arrivals",
  filter: ["==", ["get", "cohort"], c],
  paint: { "circle-color": "rgba(0,0,0,0)", "circle-radius": 4, "circle-stroke-width": 1.5, "circle-stroke-color": LIME, "circle-stroke-opacity": 0, "circle-opacity": 0 },
});

export interface FlyRequest {
  lng: number;
  lat: number;
  zoom?: number;
  nonce: number;
}

export interface MapViewProps {
  points: readonly StreamPoint[];
  arrival: ArrivalBatch | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  fly: FlyRequest | null;
  /** Visual insets (panel on the right on desktop, sheet at the bottom on mobile). */
  padding: { top: number; right: number; bottom: number; left: number };
  /** Re-fit the viewport when this changes. */
  fitKey: string;
  /** Multi-city hunts: [west, south, east, north] of all the cities, so the frame covers every city from the start. */
  area?: [number, number, number, number] | null;
}

interface Ring {
  cohort: number;
  start: number;
  points: ArrivalBatch["points"];
}

const EMPTY = { type: "FeatureCollection" as const, features: [] };

export default function MapView({ points, arrival, selectedId, onSelect, fly, padding, fitKey, area = null }: MapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const [loaded, setLoaded] = useState(false);
  const [style, setStyle] = useState<string | StyleSpecification>(MAP_STYLE);
  const [styleFailed, setStyleFailed] = useState(false);
  const [hover, setHover] = useState<{ lng: number; lat: number; name: string } | null>(null);
  const [rings, setRings] = useState<Ring[]>([]);
  const ringsRef = useRef<Ring[]>([]);
  useEffect(() => {
    ringsRef.current = rings;
  }, [rings]);
  const cohort = useRef(0);
  const fittedFor = useRef<string | null>(null);
  const paddingRef = useRef(padding);
  useEffect(() => {
    paddingRef.current = padding;
  }, [padding]);

  const data = useMemo(() => toFeatureCollection(points), [points]);
  const located = data.features.length;

  const arrivals = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: rings.flatMap((r) => r.points.map((p) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] as [number, number] }, properties: { cohort: r.cohort } }))),
    }),
    [rings],
  );

  // Arrival animation: a ring blooms around each newly arrived point (3 staggered cohorts).
  useEffect(() => {
    if (!arrival || prefersReducedMotion()) return;
    const ring: Ring = { cohort: cohort.current++ % 3, start: performance.now(), points: arrival.points };
    setRings((r) => [...r.filter((x) => x.cohort !== ring.cohort), ring]);
    const t = setTimeout(() => setRings((r) => r.filter((x) => x !== ring)), 1700);
    return () => clearTimeout(t);
  }, [arrival]);

  // Paint loop for rings and the qualified pulse (30 fps, only touches 4 layers).
  useEffect(() => {
    if (!loaded || prefersReducedMotion()) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return;
      last = now;
      if (map.getLayer("pt-pulse")) {
        const t = (now % 2200) / 2200;
        map.setPaintProperty("pt-pulse", "circle-radius", ["interpolate", ["linear"], ["zoom"], 9, 5 + 9 * t, 13, 8 + 18 * t, 17, 12 + 26 * t] as ExpressionSpecification);
        map.setPaintProperty("pt-pulse", "circle-opacity", 0.5 * (1 - t) * (1 - t));
      }
      for (let c = 0; c < 3; c++) {
        if (!map.getLayer(`arr-${c}`)) continue;
        const r = ringsRef.current.find((x) => x.cohort === c);
        const t = r ? Math.min(1, (now - r.start) / 1400) : 1;
        const e = 1 - Math.pow(1 - t, 3);
        map.setPaintProperty(`arr-${c}`, "circle-radius", 3 + 20 * e);
        map.setPaintProperty(`arr-${c}`, "circle-stroke-opacity", r ? 0.9 * (1 - t) : 0);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [loaded]);

  const fit = useCallback(
    (animate: boolean) => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      const b = unionBounds(boundsOf(points), area);
      if (!b) return;
      map.fitBounds(
        [
          [b[0], b[1]],
          [b[2], b[3]],
        ],
        { padding: paddingRef.current, duration: animate ? 900 : 0, maxZoom: 14.5 },
      );
    },
    [points, area],
  );

  // First fit once there are located points, and again when the view context (filters) changes.
  useEffect(() => {
    if (!loaded || (located === 0 && !area) || fittedFor.current === fitKey) return;
    fittedFor.current = fitKey;
    fit(fitKey !== "initial");
  }, [loaded, located, area, fitKey, fit]);

  useEffect(() => {
    if (!fly || !loaded) return;
    const p = paddingRef.current;
    mapRef.current?.getMap().easeTo({ center: [fly.lng, fly.lat], zoom: Math.max(fly.zoom ?? 15, mapRef.current.getMap().getZoom()), duration: 700, padding: p });
  }, [fly, loaded]);

  const onClick = useCallback(
    async (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const map = mapRef.current?.getMap();
      if (!map) return;
      if (f.layer.id === "clusters") {
        const src = map.getSource("leads") as GeoJSONSource | undefined;
        const id = f.properties?.cluster_id as number | undefined;
        if (!src || id === undefined) return;
        try {
          const zoom = await src.getClusterExpansionZoom(id);
          const g = f.geometry as GeoJSON.Point;
          map.easeTo({ center: g.coordinates as [number, number], zoom: zoom + 0.4, duration: 600 });
        } catch {
          /* cluster vanished mid-click */
        }
        return;
      }
      const id = f.properties?.id as string | undefined;
      if (id) onSelect(id);
    },
    [onSelect],
  );

  const onMove = useCallback((e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = f ? "pointer" : "";
    if (f && f.layer.id === "pt") setHover({ lng: e.lngLat.lng, lat: e.lngLat.lat, name: String(f.properties?.name ?? "") });
    else setHover(null);
  }, []);

  const selectedFilter = useMemo(() => ["==", ["get", "id"], selectedId ?? ""] as ExpressionSpecification, [selectedId]);

  return (
    <div className="faro-map absolute inset-0" data-testid="map" data-loaded={loaded ? "true" : "false"} data-points={located}>
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: BOGOTA[0], latitude: BOGOTA[1], zoom: 10.6 }}
        mapStyle={style}
        attributionControl={false}
        maxZoom={19}
        minZoom={3}
        interactiveLayerIds={["clusters", "pt"]}
        onLoad={() => setLoaded(true)}
        onClick={onClick}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onError={(e) => {
          const err = e.error as (Error & { sourceId?: string; status?: number }) | undefined;
          if (process.env.NODE_ENV !== "production") console.warn("[map]", err?.message);
          if (!styleFailed && err && !err.sourceId && /style|fetch|load/i.test(err.message)) {
            setStyleFailed(true);
            setStyle(FALLBACK_STYLE);
          }
        }}
        reuseMaps
        style={{ width: "100%", height: "100%", background: "#0a0a0b" }}
      >
        <AttributionControl position="bottom-left" compact={false} />
        <NavigationControl position="bottom-left" showCompass={false} />
        <Source id="leads" type="geojson" data={data} cluster clusterMaxZoom={13} clusterRadius={46} clusterProperties={{ fit: ["+", ["case", IS_FIT, 1, 0]] }}>
          <Layer {...clusterLayer} />
          <Layer {...haloLayer} />
          <Layer {...pointLayer} />
          <Layer {...pulseLayer} />
          <Layer {...clusterCountLayer} />
          <Layer id="pt-selected" type="circle" filter={["all", ["!", ["has", "point_count"]], selectedFilter]} paint={{ "circle-color": "rgba(0,0,0,0)", "circle-radius": 13, "circle-stroke-width": 2, "circle-stroke-color": LIME }} />
        </Source>
        <Source id="arrivals" type="geojson" data={rings.length ? arrivals : EMPTY}>
          <Layer {...ringLayer(0)} />
          <Layer {...ringLayer(1)} />
          <Layer {...ringLayer(2)} />
        </Source>
        {hover && (
          <Popup longitude={hover.lng} latitude={hover.lat} closeButton={false} closeOnClick={false} anchor="bottom" offset={12} className="faro-popup" maxWidth="260px">
            {hover.name}
          </Popup>
        )}
      </MapGL>
      <button type="button" className="faro-map-fit" onClick={() => fit(true)} aria-label="Reencuadrar el mapa a todas las empresas" title="Reencuadrar">
        <Crosshair className="size-4" aria-hidden />
      </button>
      {styleFailed && (
        <p role="status" className="faro-map-note">
          No se pudo cargar el mapa base. Los puntos se muestran sobre fondo liso.
        </p>
      )}
    </div>
  );
}

export { hasLocation };
