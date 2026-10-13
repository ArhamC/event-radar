import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api/client';
import type { EventItem, LatLng, User } from './types';
import { metersBetween, rangeToDates } from './utils';
import MapView from './components/MapView';
import FilterBar from './components/FilterBar';
import EventCard from './components/EventCard';
import EventDetail from './components/EventDetail';
import AuthPanel from './components/AuthPanel';
import SubmitForm from './components/SubmitForm';
import AdminQueue from './components/AdminQueue';

type View = 'browse' | 'submit' | 'admin' | 'auth';
type Range = 'today' | 'week' | 'month';

// Downtown London, Ontario unless overridden
const DEFAULT_CENTER: LatLng = {
  lat: Number(import.meta.env.VITE_DEFAULT_LAT || 42.9849),
  lng: Number(import.meta.env.VITE_DEFAULT_LNG || -81.2453),
};

export default function App() {
  const [view, setView] = useState<View>('browse');
  const [user, setUser] = useState<User | null>(null);

  // Search parameters
  const [center, setCenter] = useState<LatLng>(DEFAULT_CENTER);
  const [mapCenter, setMapCenter] = useState<LatLng>(DEFAULT_CENTER);
  const [radiusKm, setRadiusKm] = useState(5);
  const [range, setRange] = useState<Range>('week');
  const [vibes, setVibes] = useState<string[]>([]);
  const [free, setFree] = useState(false);
  const [goodFor, setGoodFor] = useState<'solo' | 'group' | null>(null);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Results
  const [allVibes, setAllVibes] = useState<string[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [picked, setPicked] = useState<LatLng | null>(null);

  const locate = useCallback(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        /* denied or unavailable: stay on the default center */
      },
      { timeout: 8000 }
    );
  }, []);

  // Start on London rather than the visitor's location: the app only covers London, so someone
  // opening it from elsewhere would land on an empty map. "Use my location" calls locate().
  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => {});
    api.tags().then((r) => setAllVibes(r.tags)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Fetch whenever any filter changes; abort the previous request so stale responses can't win.
  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    const { from, to } = rangeToDates(range);
    api
      .events({ lat: center.lat, lng: center.lng, radiusM: radiusKm * 1000, from, to, tags: vibes, free, q: debouncedQ, goodFor }, ctl.signal)
      .then((r) => {
        setEvents(r.events);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name === 'AbortError') return;
        setError(e.message);
        setLoading(false);
      });
    return () => ctl.abort();
  }, [center, radiusKm, range, vibes, free, goodFor, debouncedQ, user?.id, reloadKey]);

  const visible = useMemo(() => (savedOnly ? events.filter((e) => e.is_favorite) : events), [events, savedOnly]);
  const selected = visible.find((e) => e.id === selectedId) ?? null;
  const showSearchHere =
    view === 'browse' && metersBetween(mapCenter, center) > Math.max(500, radiusKm * 300);

  function toggleFavorite(id: number) {
    if (!user) {
      setView('auth');
      return;
    }
    api
      .favorite(id)
      .then((r) => setEvents((es) => es.map((e) => (e.id === id ? { ...e, is_favorite: r.favorite } : e))))
      .catch((e) => setError(e.message));
  }

  function logout() {
    api.logout().finally(() => {
      setUser(null);
      setSavedOnly(false);
      setView('browse');
    });
  }

  function leaveForm() {
    setPicked(null);
    setView('browse');
    setReloadKey((k) => k + 1);
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">Side Street</h1>
        <nav>
          <button className="btn small" onClick={() => (user ? setView('submit') : setView('auth'))}>
            Add an event
          </button>
          {user?.role === 'admin' && (
            <button className="link" onClick={() => setView('admin')}>
              Review queue
            </button>
          )}
          {user ? (
            <button className="link" onClick={logout} title={user.email}>
              Log out
            </button>
          ) : (
            <button className="link" onClick={() => setView('auth')}>
              Log in
            </button>
          )}
        </nav>
      </header>

      <main className="layout">
        <aside className="panel">
          {view === 'browse' && (
            <>
              <FilterBar
                range={range}
                onRange={setRange}
                radiusKm={radiusKm}
                onRadius={setRadiusKm}
                vibes={vibes}
                allVibes={allVibes}
                onToggleVibe={(v) => setVibes((vs) => (vs.includes(v) ? vs.filter((x) => x !== v) : [...vs, v]))}
                free={free}
                onFree={setFree}
                goodFor={goodFor}
                onGoodFor={setGoodFor}
                q={q}
                onQ={setQ}
                savedOnly={savedOnly}
                onSaved={setSavedOnly}
                canSave={!!user}
                onLocate={locate}
              />
              {selected ? (
                <EventDetail event={selected} onBack={() => setSelectedId(null)} onFavorite={() => toggleFavorite(selected.id)} />
              ) : (
                <div className="results" aria-live="polite">
                  <p className="count">
                    {loading ? 'Searching...' : `${visible.length} ${visible.length === 1 ? 'event' : 'events'} nearby`}
                  </p>
                  {error && <p className="error" role="alert">{error}</p>}
                  {!loading && !error && visible.length === 0 && (
                    <p className="empty">
                      Nothing matches these filters. Try a wider radius or a longer time range, or add an event you know about.
                    </p>
                  )}
                  <ul className="list">
                    {visible.map((e) => (
                      <EventCard
                        key={e.id}
                        event={e}
                        selected={e.id === selectedId}
                        onSelect={() => setSelectedId(e.id)}
                        onFavorite={() => toggleFavorite(e.id)}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {view === 'submit' && user && (
            <SubmitForm allVibes={allVibes} picked={picked} isAdmin={user.role === 'admin'} onDone={leaveForm} />
          )}
          {view === 'admin' && user?.role === 'admin' && (
            <>
              <button className="link back" onClick={() => setView('browse')}>
                Back to the map
              </button>
              <AdminQueue onChanged={() => setReloadKey((k) => k + 1)} />
            </>
          )}
          {view === 'auth' && (
            <AuthPanel
              onDone={(u) => {
                setUser(u);
                setView('browse');
              }}
              onCancel={() => setView('browse')}
            />
          )}
        </aside>

        <section className="mapwrap">
          <MapView
            center={center}
            radiusM={radiusKm * 1000}
            events={view === 'browse' ? visible : []}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={setMapCenter}
            pickMode={view === 'submit'}
            picked={picked}
            onPick={setPicked}
          />
          {showSearchHere && (
            <button className="btn search-here" onClick={() => setCenter(mapCenter)}>
              Search this area
            </button>
          )}
          {view === 'submit' && <p className="map-hint">Click the map to place the venue</p>}
        </section>
      </main>
    </div>
  );
}
