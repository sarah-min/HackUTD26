'use client';

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Feature, Geometry, Polygon as GeoPolygon } from "geojson";
import { DAMAGE_COLORS, DAMAGE_LABELS, DAMAGE_ORDER, type DamageStatus } from './mapboxDamage';
import type { LngLat } from './mapboxGeo';

/* -------------------------------------------------------------------------- */
/*  Public types                                                              */
/* -------------------------------------------------------------------------- */

/** A building to colour. `lng`/`lat` only need to fall on (or near) the building. */
export type BuildingHighlight = {
  id: string;
  lng: number;
  lat: number;
  status: DamageStatus;
};

/** A tappable marker drawn on top of the map. */
export type MapMarkerSpec = {
  id: string;
  lng: number;
  lat: number;
  status: DamageStatus;
  variant: "pin" | "residence";
  label?: string;
  ariaLabel?: string;
  selected?: boolean;
};

type Props = {
  center: LngLat;
  highlights: BuildingHighlight[];
  markers?: MapMarkerSpec[];
  /** Fly to this highlight whenever it changes. Falsy = fly back to `center`. */
  focusId?: string | null;
  /** Increment to force a re-centre (e.g. from a "re-centre" button). */
  recenterKey?: number;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  onSelect?: (id: string) => void;
  /**
   * Colour every residential building within `radiusMeters` of `center` using `statusFor`
   * (return null to skip a building). Wire this to your real assessment data.
   */
  areaFill?: AreaFill;
  /** Called with per-status building counts whenever the area-fill result changes. */
  onAreaStats?: (counts: Record<DamageStatus, number>) => void;
  className?: string;
};

export type AreaFill = {
  center: LngLat;
  radiusMeters: number;
  statusFor: (building: { lng: number; lat: number; type?: string }) => DamageStatus | null;
};

/* -------------------------------------------------------------------------- */
/*  Config                                                                    */
/* -------------------------------------------------------------------------- */

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const MAP_STYLE = process.env.NEXT_PUBLIC_MAPBOX_STYLE ?? "mapbox://styles/mapbox/satellite-streets-v12";

const FOOTPRINT_SOURCE = "damage-footprints";
const BASE_LAYER = "buildings-3d-base";
const DAMAGE_LAYER_PREFIX = "buildings-3d-damage-";
const DAMAGE_LAYERS = DAMAGE_ORDER.map((status) => `${DAMAGE_LAYER_PREFIX}${status}`);
const MAX_AREA_BUILDINGS = 450;
/** Building types that are clearly not housing (Mapbox Streets `building.type`). */
const NON_RESIDENTIAL = new Set([
  "commercial", "industrial", "retail", "office", "warehouse", "church", "chapel", "cathedral",
  "mosque", "temple", "synagogue", "school", "university", "college", "hospital", "civic",
  "government", "public", "hotel", "garage", "garages", "parking", "service", "transportation",
  "train_station", "stadium", "sports_centre", "hangar", "barn", "farm", "greenhouse", "roof", "shed",
]);

/* ---------------------------- hatch pattern images ------------------------- */

/** Diagonal "slash" hatch: solid colour stripes over a light tint of the same colour. */
function makeHatchImage(color: string) {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  g.fillStyle = "rgba(255,255,255,0.58)"; // light tint between stripes
  g.fillRect(0, 0, size, size);
  g.strokeStyle = color;
  g.lineWidth = 9;
  for (const o of [-size, 0, size]) {
    g.beginPath();
    g.moveTo(o, size);
    g.lineTo(o + size, 0);
    g.stroke();
  }
  return g.getImageData(0, 0, size, size);
}

/* -------------------------------------------------------------------------- */
/*  Geometry helpers                                                          */
/* -------------------------------------------------------------------------- */

type Ring = number[][];
type Poly = Ring[];

function polygonsOf(geometry: Geometry): Poly[] {
  if (geometry.type === "Polygon") return [geometry.coordinates as Poly];
  if (geometry.type === "MultiPolygon") return geometry.coordinates as Poly[];
  return [];
}

function inRing(x: number, y: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const [xi, yi] = a;
    const [xj, yj] = b;
    if (xi === undefined || yi === undefined || xj === undefined || yj === undefined) continue;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polyContains(poly: Poly, lng: number, lat: number) {
  const outer = poly[0];
  if (!outer || !inRing(lng, lat, outer)) return false;
  for (let i = 1; i < poly.length; i++) {
    const hole = poly[i];
    if (hole && inRing(lng, lat, hole)) return false;
  }
  return true;
}

function centroid(poly: Poly): [number, number] {
  const ring = poly[0] ?? [];
  let x = 0;
  let y = 0;
  let n = 0;
  for (const pt of ring) {
    if (!pt || pt[0] === undefined || pt[1] === undefined) continue;
    x += pt[0];
    y += pt[1];
    n += 1;
  }
  return n === 0 ? [0, 0] : [x / n, y / n];
}

function metersBetween(aLng: number, aLat: number, bLng: number, bLat: number) {
  const dy = (bLat - aLat) * 111_320;
  const dx = (bLng - aLng) * 111_320 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** Push every vertex `meters` away from the centroid so the colour shell never z-fights the base building. */
function inflate(poly: Poly, meters: number): Poly {
  const [cx, cy] = centroid(poly);
  return poly.map((ring, index) =>
    index > 0
      ? ring
      : ring.flatMap((pt) => {
          const x = pt?.[0];
          const y = pt?.[1];
          if (x === undefined || y === undefined) return [];
          const d = metersBetween(cx, cy, x, y) || 1;
          const k = 1 + meters / d;
          return [[cx + (x - cx) * k, cy + (y - cy) * k]];
        }),
  );
}

function squareAround(lng: number, lat: number, sizeMeters: number): Poly {
  const half = sizeMeters / 2;
  const dLat = half / 111_320;
  const dLng = half / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [
    [
      [lng - dLng, lat - dLat],
      [lng + dLng, lat - dLat],
      [lng + dLng, lat + dLat],
      [lng - dLng, lat + dLat],
      [lng - dLng, lat - dLat],
    ],
  ];
}

type Footprint = {
  key: string; // lng,lat the footprint was resolved for
  poly: Poly;
  height: number;
  minHeight: number;
  exact: boolean; // false = fallback square (retry when tiles load)
};

/* -------------------------------------------------------------------------- */
/*  Marker DOM (built by hand so Mapbox can own the element's transform)      */
/* -------------------------------------------------------------------------- */

const HOME_SVG = (size: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 17V9l7-5 7 5v8h-5v-5h-4v5H5Z" stroke="currentColor" stroke-linejoin="round" stroke-width="1.9"/></svg>`;

function buildMarkerElement(spec: MapMarkerSpec, onClick: () => void) {
  const root = document.createElement("div");
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", spec.ariaLabel ?? spec.label ?? "Map marker");
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  const color = DAMAGE_COLORS[spec.status];

  if (spec.variant === "residence") {
    button.className = "relative flex flex-col items-center";
    button.innerHTML = `
      <span class="absolute left-1/2 top-[22px] size-20 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border border-blue-400/70 bg-blue-500/15"></span>
      <span class="relative grid size-13 place-items-center rounded-full border-[3px] border-white text-white shadow-[0_8px_30px_rgba(0,71,171,.7)] transition hover:scale-105" style="background:${color}">${HOME_SVG(23)}</span>
      <span class="mt-2 block whitespace-nowrap rounded-lg bg-white px-2.5 py-1 text-[9px] font-bold text-blue-800 shadow-lg"></span>`;
    button.lastElementChild!.textContent = spec.label ?? "Your residence";
  } else {
    button.className = `flex flex-col items-center transition-transform duration-300 ${
      spec.selected ? "scale-110" : "hover:scale-105"
    }`;
    button.innerHTML = `
      <span class="mb-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[8px] font-bold text-white shadow-lg ring-1 ring-white/20" style="background:${
        spec.label === "Claimed" ? "#10b981" : "#64748b"
      }"></span>
      <span class="grid h-9 w-8 place-items-center border-2 border-white text-white shadow-[0_5px_14px_rgba(0,0,0,0.5)]" style="border-radius:50% 50% 50% 10%;background:${color};transform:rotate(-45deg)">
        <span style="transform:rotate(45deg)">${HOME_SVG(15)}</span>
      </span>`;
    const pill = button.firstElementChild as HTMLElement;
    if (spec.label) pill.textContent = spec.label;
    else pill.remove();
  }

  root.appendChild(button);
  return root;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function MapboxDamageMap({
  center,
  highlights,
  markers = [],
  focusId,
  recenterKey = 0,
  zoom = 16.6,
  pitch = 60,
  bearing = -25,
  onSelect,
  areaFill,
  onAreaStats,
  className = "absolute inset-0",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);
  const footprints = useRef(new Map<string, Footprint>());
  const markerObjs = useRef<mapboxgl.Marker[]>([]);
  const [mapError, setMapError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string[]>([]);
  const showDebug = typeof window !== "undefined" && window.location.search.includes("mapdebug");
  const errorLog = useRef<string[]>([]);

  // Latest props, readable from long-lived map callbacks without re-creating the map.
  const latest = useRef({ highlights, center, zoom, pitch, bearing, onSelect, areaFill, onAreaStats });
  latest.current = { highlights, center, zoom, pitch, bearing, onSelect, areaFill, onAreaStats };

  const areaFeatures = useRef(new Map<string, Feature<GeoPolygon>>());
  const lastSource = useRef("");
  const lastStats = useRef("");

  /** Look up building footprints in the loaded vector tiles and colour them. */
  const syncFootprints = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const { highlights: items, areaFill: area } = latest.current;

    if (map.getSource("composite")) {
      const candidates = map.querySourceFeatures("composite", {
        sourceLayer: "building",
      }) as unknown as Feature[];

      // 1) explicit highlights: find the building that contains each point
      for (const h of items) {
        const key = `${h.lng},${h.lat}`;
        const cached = footprints.current.get(h.id);
        if (cached && cached.key === key && cached.exact) continue;

        let found: { poly: Poly; props: Record<string, unknown> } | undefined;
        let nearest: { poly: Poly; props: Record<string, unknown>; d: number } | undefined;
        for (const f of candidates) {
          for (const poly of polygonsOf(f.geometry)) {
            if (polyContains(poly, h.lng, h.lat)) {
              found = { poly, props: (f.properties ?? {}) as Record<string, unknown> };
              break;
            }
            const [cx, cy] = centroid(poly);
            const d = metersBetween(h.lng, h.lat, cx, cy);
            if (d < 25 && (!nearest || d < nearest.d)) {
              nearest = { poly, props: (f.properties ?? {}) as Record<string, unknown>, d };
            }
          }
          if (found) break;
        }

        const hit = found ?? nearest;
        if (hit) {
          footprints.current.set(h.id, {
            key,
            poly: inflate(hit.poly, 0.35),
            height: Number(hit.props.height ?? 8) + 0.4,
            minHeight: Number(hit.props.min_height ?? 0),
            exact: true,
          });
        } else if (!cached && map.getZoom() >= 15 && map.areTilesLoaded()) {
          footprints.current.set(h.id, {
            key,
            poly: squareAround(h.lng, h.lat, 16),
            height: 7,
            minHeight: 0,
            exact: false,
          });
        }
      }

      // 2) area fill: every residential building within the radius
      if (area && areaFeatures.current.size < MAX_AREA_BUILDINGS) {
        for (const f of candidates) {
          const props = (f.properties ?? {}) as Record<string, unknown>;
          if (props.underground === "true") continue;
          const type = typeof props.type === "string" ? props.type : undefined;
          if (type && NON_RESIDENTIAL.has(type)) continue;
          for (const poly of polygonsOf(f.geometry)) {
            const [cx, cy] = centroid(poly);
            if (metersBetween(area.center.lng, area.center.lat, cx, cy) > area.radiusMeters) continue;
            const key = `${Math.round(cx * 1e5)}:${Math.round(cy * 1e5)}`;
            if (areaFeatures.current.has(key)) continue;
            // explicit highlights win over the area fill
            if (items.some((h) => polyContains(poly, h.lng, h.lat))) continue;
            const status = area.statusFor({ lng: cx, lat: cy, type });
            if (!status) continue;
            const inflated = inflate(poly, 0.35);
            areaFeatures.current.set(key, {
              type: "Feature",
              properties: {
                id: `area:${key}`,
                status,
                height: Number(props.height ?? 7) + 0.4,
                min: Number(props.min_height ?? 0),
              },
              geometry: { type: "Polygon", coordinates: inflated },
            });
            if (areaFeatures.current.size >= MAX_AREA_BUILDINGS) break;
          }
        }
      }
    }
    refreshSource();
  };

  const refreshSource = () => {
    const map = mapRef.current;
    const source = map?.getSource(FOOTPRINT_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    const features: Feature<GeoPolygon>[] = [];
    for (const h of latest.current.highlights) {
      const fp = footprints.current.get(h.id);
      if (!fp) continue;
      features.push({
        type: "Feature",
        properties: { id: h.id, status: h.status, height: fp.height, min: fp.minHeight },
        geometry: { type: "Polygon", coordinates: fp.poly },
      });
    }
    features.push(...areaFeatures.current.values());

    // Only push to Mapbox when something actually changed.
    const signature = features.map((f) => `${f.properties?.id}:${f.properties?.status}`).join("|");
    if (signature !== lastSource.current) {
      lastSource.current = signature;
      source.setData({ type: "FeatureCollection", features });
    }

    const onStats = latest.current.onAreaStats;
    if (onStats && latest.current.areaFill) {
      const counts: Record<DamageStatus, number> = { none: 0, minor: 0, moderate: 0, severe: 0, verified: 0 };
      areaFeatures.current.forEach((f) => (counts[f.properties?.status as DamageStatus] += 1));
      const sig = JSON.stringify(counts);
      if (sig !== lastStats.current) {
        lastStats.current = sig;
        onStats(counts);
      }
    }
  };

  /* ---- create the map once ------------------------------------------------ */
  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const { center: c, zoom: z, pitch: p, bearing: b } = latest.current;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [c.lng, c.lat],
      zoom: z,
      pitch: p,
      bearing: b,
      antialias: true,
      attributionControl: false,
      maxPitch: 75,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");

    map.on("style.load", () => {
      // Draw 3D buildings under the first label layer so street names stay readable.
      const labelLayer = map
        .getStyle()
        ?.layers?.find((l) => l.type === "symbol" && l.layout && "text-field" in l.layout)?.id;

      if (map.getSource("composite")) {
        map.addLayer(
          {
            id: BASE_LAYER,
            type: "fill-extrusion",
            source: "composite",
            "source-layer": "building",
            filter: ["==", ["get", "extrude"], "true"],
            minzoom: 14,
            paint: {
              "fill-extrusion-color": "#cbd5e1",
              "fill-extrusion-height": ["coalesce", ["get", "height"], 6],
              "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
              "fill-extrusion-opacity": 0.5,
            },
          },
          labelLayer,
        );
      }

      map.addSource(FOOTPRINT_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      // One hatched ("slashed") layer per status, so each can use its own pattern image.
      for (const status of DAMAGE_ORDER) {
        const imageName = `hatch-${status}`;
        if (!map.hasImage(imageName)) {
          map.addImage(imageName, makeHatchImage(DAMAGE_COLORS[status]), { pixelRatio: 2 });
        }
        map.addLayer(
          {
            id: `${DAMAGE_LAYER_PREFIX}${status}`,
            type: "fill-extrusion",
            source: FOOTPRINT_SOURCE,
            filter: ["==", ["get", "status"], status],
            paint: {
              "fill-extrusion-pattern": imageName,
              "fill-extrusion-height": ["get", "height"],
              "fill-extrusion-base": ["get", "min"],
              "fill-extrusion-opacity": 0.92,
            },
          },
          labelLayer,
        );
      }

      try {
        map.addLayer({
          id: "sky",
          type: "sky",
          paint: { "sky-type": "atmosphere", "sky-atmosphere-sun": [0, 0], "sky-atmosphere-sun-intensity": 8 },
        });
      } catch {
        /* sky layer is cosmetic */
      }

      loadedRef.current = true;
      syncFootprints();
    });

    // Surface problems (bad token, blocked style, WebGL) on screen instead of failing silently.
    map.on("error", (event) => {
      const err = (event as { error?: { message?: string; status?: number; url?: string } }).error;
      const message = err?.message ?? "Unknown map error";
      // Log the message itself: the raw event object serializes as {} in the Next.js error overlay.
      console.warn(`[Mapbox] ${message}${err?.status ? ` (HTTP ${err.status})` : ""}${err?.url ? ` ${err.url.split("?")[0]}` : ""}`);
      errorLog.current = [...errorLog.current.slice(-2), message];
      setMapError((prev) => prev ?? message);
    });

    // Optional on-screen diagnostics: open the app with ?mapdebug=1 on the URL.
    if (window.location.search.includes("mapdebug")) {
      const report = () => {
        const canvas = map.getCanvas();
        const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
        setDebug([
          `token: ${MAPBOX_TOKEN?.slice(0, 5)}… (${MAPBOX_TOKEN?.length} chars)`,
          `style: ${MAP_STYLE}`,
          `canvas: ${canvas.clientWidth}x${canvas.clientHeight}`,
          `webgl: ${gl ? "ok" : "UNAVAILABLE"}${gl && "isContextLost" in gl && gl.isContextLost() ? " (context lost)" : ""}`,
          `styleLoaded: ${map.isStyleLoaded()}  loaded: ${map.loaded()}  tilesLoaded: ${map.areTilesLoaded()}`,
          `zoom: ${map.getZoom().toFixed(1)}  pitch: ${map.getPitch().toFixed(0)}`,
          `layers: ${map.getStyle()?.layers?.length ?? 0}  composite: ${!!map.getSource("composite")}`,
          ...errorLog.current.map((m) => `ERROR: ${m}`),
        ]);
      };
      ["load", "idle", "styledata", "error", "moveend"].forEach((name) => map.on(name as "load", report));
      report();
    }

    // Tiles stream in as the camera moves: resolve footprints once the map settles.
    map.on("idle", syncFootprints);

    map.on("click", DAMAGE_LAYERS, (event) => {
      const id = (event.features?.[0] as unknown as Feature | undefined)?.properties?.id;
      if (id !== undefined) latest.current.onSelect?.(String(id));
    });
    map.on("mouseenter", DAMAGE_LAYERS, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", DAMAGE_LAYERS, () => (map.getCanvas().style.cursor = ""));

    return () => {
      markerObjs.current.forEach((m) => m.remove());
      markerObjs.current = [];
      loadedRef.current = false;
      footprints.current.clear();
      areaFeatures.current.clear();
      lastSource.current = "";
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- area-fill settings changed: rebuild the cache ---------------------- */
  const areaKey = areaFill
    ? `${areaFill.center.lng},${areaFill.center.lat},${areaFill.radiusMeters}`
    : "";
  useEffect(() => {
    areaFeatures.current.clear();
    lastStats.current = "";
    syncFootprints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaKey]);

  /* ---- highlights changed ------------------------------------------------- */
  const highlightsKey = highlights.map((h) => `${h.id}:${h.lng}:${h.lat}:${h.status}`).join("|");
  useEffect(() => {
    syncFootprints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightsKey]);

  /* ---- markers ------------------------------------------------------------ */
  const markersKey = markers
    .map((m) => `${m.id}:${m.lng}:${m.lat}:${m.status}:${m.variant}:${m.label}:${m.selected}`)
    .join("|");
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerObjs.current.forEach((m) => m.remove());
    markerObjs.current = markers.map((spec) =>
      new mapboxgl.Marker({
        element: buildMarkerElement(spec, () => latest.current.onSelect?.(spec.id)),
        anchor: spec.variant === "residence" ? "center" : "bottom",
      })
        .setLngLat([spec.lng, spec.lat])
        .addTo(map),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersKey]);

  /* ---- camera ------------------------------------------------------------- */
  const centerKey = `${center.lng},${center.lat}`;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const target = focusId ? latest.current.highlights.find((h) => h.id === focusId) : undefined;
    const { center: c, zoom: z, pitch: p, bearing: b } = latest.current;
    map.flyTo({
      center: target ? [target.lng, target.lat] : [c.lng, c.lat],
      zoom: target ? Math.max(z, 17.4) : z,
      pitch: p,
      bearing: b,
      duration: 1400,
      essential: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, recenterKey, centerKey]);

  if (!MAPBOX_TOKEN) return <MissingTokenNotice className={className} />;

  return (
    <div className={`${className} bg-[#111922]`}>
      {/* Inline style on purpose: mapbox-gl.css (unlayered) beats Tailwind's layered utilities and would collapse this to height 0. */}
      <div ref={containerRef} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} />
      {mapError && (
        <div className="pointer-events-none absolute inset-x-4 top-1/2 z-10 mx-auto max-w-sm -translate-y-1/2 rounded-xl border border-red-300/30 bg-[#451f24]/95 p-4 text-center text-white shadow-xl">
          <p className="text-[12px] font-bold">Mapbox could not load the map</p>
          <p className="mt-1 break-words text-[11px] text-red-200">{mapError}</p>
          <p className="mt-2 text-[10px] text-slate-300">
            Check NEXT_PUBLIC_MAPBOX_TOKEN in .env (public pk. token), then restart npm run dev.
          </p>
        </div>
      )}
      {showDebug && (
        <pre className="pointer-events-none absolute bottom-12 left-3 right-3 z-10 max-w-md whitespace-pre-wrap break-all rounded-lg bg-black/80 p-2 text-[10px] leading-tight text-lime-300">
          {debug.join("\n")}
        </pre>
      )}
      {/* soft vignette so overlay UI stays legible */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(3,8,14,.38)_100%)]" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Legend + fallback                                                         */
/* -------------------------------------------------------------------------- */

export function DamageLegend({
  statuses = DAMAGE_ORDER,
  className = "",
}: {
  statuses?: DamageStatus[];
  className?: string;
}) {
  return (
    <div className={className}>
      {statuses.map((status) => (
        <span className="flex items-center gap-2 py-0.5 text-[8px] font-semibold" key={status}>
          <span
            className="size-2.5 rounded-sm ring-1 ring-white/60"
            style={{
              backgroundImage: `repeating-linear-gradient(135deg, ${DAMAGE_COLORS[status]} 0 2px, rgba(255,255,255,.65) 2px 4px)`,
            }}
          />
          {DAMAGE_LABELS[status]}
        </span>
      ))}
    </div>
  );
}

function MissingTokenNotice({ className }: { className: string }) {
  return (
    <div className={`${className} grid place-items-center bg-[#111922] p-6 text-center text-slate-300`}>
      <div className="max-w-xs rounded-2xl border border-white/10 bg-[#0f172a] p-5 shadow-xl">
        <p className="text-[13px] font-bold text-white">Mapbox token missing</p>
        <p className="mt-2 text-[11px] leading-relaxed">
          Copy <code className="text-blue-300">.env.example</code> to{" "}
          <code className="text-blue-300">.env.local</code>, set{" "}
          <code className="text-blue-300">NEXT_PUBLIC_MAPBOX_TOKEN</code> to your public Mapbox token, then
          restart the dev server.
        </p>
      </div>
    </div>
  );
}
