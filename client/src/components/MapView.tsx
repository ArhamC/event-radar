import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl'; // v6 is ESM-only with no default export
import type { GeoJSONSource, Map as MLMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { EventItem, LatLng } from '../types';

interface Props {
  center: LatLng;
  radiusM: number;
  events: EventItem[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onMove: (c: LatLng) => void;
  pickMode: boolean;
  picked: LatLng | null;
  onPick: (c: LatLng) => void;
}

// Approximate circle polygon (GeoJSON) for the search-radius ring
function circle(c: LatLng, radiusM: number, steps = 64): any {
  const coords: [number, number][] = [];
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((c.lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    coords.push([c.lng + dLng * Math.cos(a), c.lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

function pinElement(extraClass = '') {
  // Outer element is positioned by MapLibre (it sets transform), so style an inner span.
  const wrap = document.createElement('div');
  wrap.className = 'pin-wrap';
  const pin = document.createElement('span');
  pin.className = `pin ${extraClass}`.trim();
  wrap.appendChild(pin);
  return wrap;
}

export default function MapView(p: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const markers = useRef<Marker[]>([]);
  const pickMarker = useRef<Marker | null>(null);
  const latest = useRef(p);
  latest.current = p;

  // Create the map once
  useEffect(() => {
    const m = new maplibregl.Map({
      container: container.current!,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [p.center.lng, p.center.lat],
      zoom: 12,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    m.on('load', () => {
      m.addSource('radius', { type: 'geojson', data: circle(latest.current.center, latest.current.radiusM) });
      m.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#16213E', 'fill-opacity': 0.05 } });
      m.addLayer({
        id: 'radius-line',
        type: 'line',
        source: 'radius',
        paint: { 'line-color': '#16213E', 'line-width': 1.5, 'line-dasharray': [2, 2] },
      });
      ready.current = true;
    });
    m.on('moveend', () => {
      const c = m.getCenter();
      latest.current.onMove({ lat: c.lat, lng: c.lng });
    });
    m.on('click', (e) => {
      if (latest.current.pickMode) latest.current.onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Radius ring + fit the view to it whenever the search center/radius change
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const src = ready.current ? (m.getSource('radius') as GeoJSONSource | undefined) : undefined;
    src?.setData(circle(p.center, p.radiusM));
    const dLat = p.radiusM / 111_320;
    const dLng = p.radiusM / (111_320 * Math.cos((p.center.lat * Math.PI) / 180));
    m.fitBounds(
      [
        [p.center.lng - dLng, p.center.lat - dLat],
        [p.center.lng + dLng, p.center.lat + dLat],
      ],
      { padding: 40, duration: 600 }
    );
  }, [p.center.lat, p.center.lng, p.radiusM]);

  // Event markers
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = p.events.map((ev) => {
      const el = pinElement(ev.id === p.selectedId ? 'selected' : '');
      el.title = ev.title;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        latest.current.onSelect(ev.id);
      });
      return new maplibregl.Marker({ element: el }).setLngLat([ev.lng, ev.lat]).addTo(m);
    });
  }, [p.events, p.selectedId]);

  // Pan to the selected event
  useEffect(() => {
    const ev = p.events.find((e) => e.id === p.selectedId);
    if (ev) map.current?.easeTo({ center: [ev.lng, ev.lat], duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.selectedId]);

  // Venue picker (submit form)
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    pickMarker.current?.remove();
    pickMarker.current = null;
    if (p.picked) {
      pickMarker.current = new maplibregl.Marker({ element: pinElement('pick') })
        .setLngLat([p.picked.lng, p.picked.lat])
        .addTo(m);
    }
  }, [p.picked]);

  useEffect(() => {
    const canvas = map.current?.getCanvas();
    if (canvas) canvas.style.cursor = p.pickMode ? 'crosshair' : '';
  }, [p.pickMode]);

  return <div ref={container} className="map" />;
}
