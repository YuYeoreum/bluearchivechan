"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

type Day = "sat" | "sun";

type Booth = {
  id: number;
  name: string;
  boothNum: string;
  entryDate: string;
  twitter: string;
  instagram: string;
  genres: string[];
  imageUrl: string;
  shopUrl: string;
  keys: Record<Day, string[]>;
};

type Slot = {
  key: string;
  label: string;
  spec: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type BoothData = {
  event: {
    number: number;
    title: string;
    venue: string;
    dates: string;
    sourceUrl: string;
  };
  map: { width: number; height: number; image: string };
  slots: Slot[];
  booths: Booth[];
  dayMaps: Record<Day, Record<string, number>>;
  genres: Array<{ name: string; count: number }>;
  stats: Record<string, number>;
};

type View = { x: number; y: number; w: number; h: number };

const DAY_LABEL: Record<Day, string> = { sat: "토요일", sun: "일요일" };
const MAX_ZOOM = 7;
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const numberCollator = new Intl.Collator("ko-KR", { numeric: true, sensitivity: "base" });

function assetPath(value: string) {
  return value.startsWith("/") ? `${BASE_PATH}${value}` : value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hashHue(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 360;
}

function genreColor(value: string) {
  const hue = hashHue(value);
  return `hsl(${hue} 72% 59%)`;
}

function cleanSocial(value: string, network: "twitter" | "instagram") {
  const text = value.trim();
  if (!text || /^(없음|x|-|\.)$/i.test(text)) return [];
  return text
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((item) => {
      if (/^https?:\/\//i.test(item)) return { label: item.replace(/^https?:\/\/(www\.)?/i, ""), href: item };
      const handle = item.replace(/^@/, "");
      return {
        label: `@${handle}`,
        href: network === "twitter" ? `https://x.com/${handle}` : `https://instagram.com/${handle}`,
      };
    });
}

function boothMatches(booth: Booth, query: string, selectedGenres: string[]) {
  const genreMatch = selectedGenres.length === 0 || selectedGenres.some((genre) => booth.genres.includes(genre));
  if (!genreMatch) return false;
  if (!query) return true;
  const haystack = `${booth.name} ${booth.boothNum} ${booth.genres.join(" ")}`.toLocaleLowerCase("ko-KR");
  return haystack.includes(query.toLocaleLowerCase("ko-KR"));
}

export default function BoothMapApp() {
  const [data, setData] = useState<BoothData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [day, setDay] = useState<Day>("sat");
  const [query, setQuery] = useState("");
  const [genreQuery, setGenreQuery] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedBoothId, setSelectedBoothId] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const zoomLabelRef = useRef<HTMLSpanElement>(null);
  const viewRef = useRef<View>({ x: 0, y: 0, w: 2500, h: 1724 });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const panStartRef = useRef<null | { x: number; y: number; view: View }>(null);
  const pinchStartRef = useRef<null | { distance: number; center: { x: number; y: number }; view: View }>(null);
  const movedRef = useRef(false);
  const pressedBoothRef = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(assetPath("/data/booths-334.json"), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("data load failed");
        return response.json() as Promise<BoothData>;
      })
      .then((payload) => {
        setData(payload);
        viewRef.current = { x: 0, y: 0, w: payload.map.width, h: payload.map.height };
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") setLoadError(true);
      });
    return () => controller.abort();
  }, []);

  const boothById = useMemo(() => new Map(data?.booths.map((booth) => [booth.id, booth]) ?? []), [data]);
  const slotByKey = useMemo(() => new Map(data?.slots.map((slot) => [slot.key, slot]) ?? []), [data]);
  const activeMap = data?.dayMaps[day] ?? {};
  const otherDay: Day = day === "sat" ? "sun" : "sat";
  const otherMap = data?.dayMaps[otherDay] ?? {};

  const activeBoothIds = useMemo(() => new Set(Object.values(activeMap)), [activeMap]);
  const activeBooths = useMemo(() => {
    if (!data) return [];
    return [...activeBoothIds]
      .map((id) => boothById.get(id))
      .filter((booth): booth is Booth => Boolean(booth))
      .sort((a, b) => numberCollator.compare(a.boothNum, b.boothNum) || numberCollator.compare(a.name, b.name));
  }, [activeBoothIds, boothById, data]);

  const filteredBooths = useMemo(
    () => activeBooths.filter((booth) => boothMatches(booth, query.trim(), selectedGenres)),
    [activeBooths, query, selectedGenres],
  );
  const filteredBoothIds = useMemo(() => new Set(filteredBooths.map((booth) => booth.id)), [filteredBooths]);

  const genreStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const booth of activeBooths) {
      for (const genre of booth.genres) counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .filter(({ name }) => !genreQuery || name.toLocaleLowerCase("ko-KR").includes(genreQuery.toLocaleLowerCase("ko-KR")))
      .sort((a, b) => b.count - a.count || numberCollator.compare(a.name, b.name));
  }, [activeBooths, genreQuery]);

  const selectedBooth = selectedBoothId === null ? null : boothById.get(selectedBoothId) ?? null;

  const applyView = useCallback(
    (next: View) => {
      if (!data) return;
      const minW = data.map.width / MAX_ZOOM;
      const maxW = data.map.width * 1.08;
      const ratio = data.map.height / data.map.width;
      const w = clamp(next.w, minW, maxW);
      const h = w * ratio;
      const margin = Math.min(w * 0.18, 230);
      const minX = -margin;
      const maxX = data.map.width - w + margin;
      const minY = -margin;
      const maxY = data.map.height - h + margin;
      const view = {
        x: minX > maxX ? (data.map.width - w) / 2 : clamp(next.x, minX, maxX),
        y: minY > maxY ? (data.map.height - h) / 2 : clamp(next.y, minY, maxY),
        w,
        h,
      };
      viewRef.current = view;
      svgRef.current?.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
      const zoom = data.map.width / view.w;
      if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(zoom * 100)}%`;
      if (svgRef.current) svgRef.current.dataset.zoomed = zoom >= 2.7 ? "true" : "false";
    },
    [data],
  );

  const animateView = useCallback(
    (target: View) => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      const from = { ...viewRef.current };
      const started = performance.now();
      const tick = (now: number) => {
        const progress = clamp((now - started) / 330, 0, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        applyView({
          x: from.x + (target.x - from.x) * eased,
          y: from.y + (target.y - from.y) * eased,
          w: from.w + (target.w - from.w) * eased,
          h: from.h + (target.h - from.h) * eased,
        });
        if (progress < 1) animationRef.current = requestAnimationFrame(tick);
      };
      animationRef.current = requestAnimationFrame(tick);
    },
    [applyView],
  );

  const focusBooth = useCallback(
    (booth: Booth, targetDay: Day) => {
      if (!data) return;
      const located = booth.keys[targetDay].map((key) => slotByKey.get(key)).filter((slot): slot is Slot => Boolean(slot));
      if (!located.length) return;
      const minX = Math.min(...located.map((slot) => slot.x));
      const minY = Math.min(...located.map((slot) => slot.y));
      const maxX = Math.max(...located.map((slot) => slot.x + slot.w));
      const maxY = Math.max(...located.map((slot) => slot.y + slot.h));
      const bboxW = Math.max(18, maxX - minX);
      const bboxH = Math.max(18, maxY - minY);
      const targetW = clamp(Math.max(bboxW * 15, bboxH * 15 * (data.map.width / data.map.height), 520), data.map.width / MAX_ZOOM, 820);
      const targetH = targetW * (data.map.height / data.map.width);
      animateView({
        x: (minX + maxX) / 2 - targetW / 2,
        y: (minY + maxY) / 2 - targetH / 2,
        w: targetW,
        h: targetH,
      });
    },
    [animateView, data, slotByKey],
  );

  const selectBooth = useCallback(
    (boothId: number, targetDay = day) => {
      const booth = boothById.get(boothId);
      if (!booth) return;
      setSelectedBoothId(boothId);
      focusBooth(booth, targetDay);
    },
    [boothById, day, focusBooth],
  );

  const changeDay = (nextDay: Day) => {
    setDay(nextDay);
    if (selectedBooth && selectedBooth.keys[nextDay].length === 0) setSelectedBoothId(null);
  };

  const toggleGenre = (genre: string) => {
    setSelectedGenres((current) => (current.includes(genre) ? current.filter((item) => item !== genre) : [...current, genre]));
  };

  const zoomAroundCenter = (factor: number) => {
    const current = viewRef.current;
    const nextW = current.w / factor;
    const nextH = current.h / factor;
    animateView({
      x: current.x + (current.w - nextW) / 2,
      y: current.y + (current.h - nextH) / 2,
      w: nextW,
      h: nextH,
    });
  };

  const resetView = () => {
    if (!data) return;
    animateView({ x: 0, y: 0, w: data.map.width, h: data.map.height });
  };

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    if (!data || !svgRef.current) return;
    event.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const current = viewRef.current;
    const px = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const py = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const factor = Math.exp(-event.deltaY * 0.0012);
    const nextW = current.w / factor;
    const nextH = current.h / factor;
    applyView({
      x: current.x + px * (current.w - nextW),
      y: current.y + py * (current.h - nextH),
      w: nextW,
      h: nextH,
    });
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    movedRef.current = false;
    if (pointersRef.current.size === 1) {
      const target = event.target as SVGElement;
      const boothId = target.closest?.("[data-booth-id]")?.getAttribute("data-booth-id");
      pressedBoothRef.current = boothId === null || boothId === undefined ? null : Number(boothId);
      panStartRef.current = { x: event.clientX, y: event.clientY, view: { ...viewRef.current } };
    } else if (pointersRef.current.size === 2) {
      pressedBoothRef.current = null;
      const [a, b] = [...pointersRef.current.values()];
      pinchStartRef.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view: { ...viewRef.current },
      };
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!pointersRef.current.has(event.pointerId) || !svgRef.current) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const rect = svgRef.current.getBoundingClientRect();
    if (pointersRef.current.size >= 2 && pinchStartRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const factor = distance / Math.max(1, pinchStartRef.current.distance);
      const start = pinchStartRef.current.view;
      const nextW = start.w / factor;
      const nextH = start.h / factor;
      const startScale = Math.min(rect.width / start.w, rect.height / start.h);
      applyView({
        x: start.x + (pinchStartRef.current.center.x - rect.left) / startScale - (center.x - rect.left) / startScale / factor,
        y: start.y + (pinchStartRef.current.center.y - rect.top) / startScale - (center.y - rect.top) / startScale / factor,
        w: nextW,
        h: nextH,
      });
      movedRef.current = true;
      return;
    }
    if (panStartRef.current) {
      const distance = Math.hypot(event.clientX - panStartRef.current.x, event.clientY - panStartRef.current.y);
      if (distance > 4) {
        movedRef.current = true;
        pressedBoothRef.current = null;
      }
      if (!movedRef.current) return;
      const start = panStartRef.current.view;
      const scale = Math.min(rect.width / start.w, rect.height / start.h);
      applyView({
        ...start,
        x: start.x - (event.clientX - panStartRef.current.x) / scale,
        y: start.y - (event.clientY - panStartRef.current.y) / scale,
      });
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const shouldSelect = event.type === "pointerup"
      && pointersRef.current.size === 1
      && !movedRef.current
      && pressedBoothRef.current !== null;
    const boothId = pressedBoothRef.current;
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchStartRef.current = null;
    if (pointersRef.current.size === 0) {
      panStartRef.current = null;
      pressedBoothRef.current = null;
    }
    if (shouldSelect && boothId !== null) selectBooth(boothId);
  };

  if (loadError) {
    return <main className="load-state">부스 데이터를 불러오지 못했습니다.</main>;
  }
  if (!data) {
    return <main className="load-state"><span className="load-dot" />부스맵 불러오는 중</main>;
  }

  const twitterLinks = selectedBooth ? cleanSocial(selectedBooth.twitter, "twitter") : [];
  const instagramLinks = selectedBooth ? cleanSocial(selectedBooth.instagram, "instagram") : [];
  const selectedHasCoordinates = selectedBooth
    ? selectedBooth.keys[day].some((key) => slotByKey.has(key))
    : false;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <header className="brand-row">
          <div>
            <p className="eyebrow">코믹월드 334</p>
            <h1>서코 부스맵</h1>
          </div>
          <span className="live-count">{activeBooths.length.toLocaleString("ko-KR")}</span>
        </header>

        <fieldset className="day-switch" aria-label="참가일">
          {(["sat", "sun"] as Day[]).map((value) => (
            <label key={value} className={day === value ? "selected" : ""}>
              <input type="radio" name="day" value={value} checked={day === value} onChange={() => changeDay(value)} />
              {DAY_LABEL[value]}
            </label>
          ))}
        </fieldset>

        <label className="search-box">
          <span className="sr-only">부스 검색</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="부스명 · 위치 · 장르" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="검색 지우기">×</button>}
        </label>

        <section className="genre-section" aria-labelledby="genre-title">
          <div className="section-heading">
            <h2 id="genre-title">게임 · 장르</h2>
            {selectedGenres.length > 0 && <button type="button" onClick={() => setSelectedGenres([])}>전체 해제</button>}
          </div>
          <label className="genre-search">
            <span className="sr-only">게임 및 장르 검색</span>
            <input value={genreQuery} onChange={(event) => setGenreQuery(event.target.value)} placeholder="장르 찾기" />
          </label>
          <div className="genre-list">
            {genreStats.map(({ name, count }) => {
              const selected = selectedGenres.includes(name);
              return (
                <button
                  type="button"
                  key={name}
                  className={selected ? "genre-chip selected" : "genre-chip"}
                  aria-pressed={selected}
                  onClick={() => toggleGenre(name)}
                  style={{ "--genre-color": genreColor(name) } as React.CSSProperties}
                >
                  <span className="genre-swatch" />
                  <span className="genre-name">{name}</span>
                  <span className="genre-count">{count}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="booth-section" aria-labelledby="booth-title">
          <div className="section-heading booth-heading">
            <h2 id="booth-title">부스</h2>
            <span>{filteredBooths.length.toLocaleString("ko-KR")}</span>
          </div>

          {selectedBooth ? (
            <article className="booth-detail">
              <button className="detail-back" type="button" onClick={() => setSelectedBoothId(null)}>← 목록</button>
              <div className="detail-title-row">
                <div>
                  <p className="detail-location">{selectedBooth.boothNum}</p>
                  <h3>{selectedBooth.name}</h3>
                </div>
                <span className="day-badge">{selectedBooth.entryDate || DAY_LABEL[day]}</span>
              </div>
              {!selectedHasCoordinates && <p className="coordinate-note">좌표 없음</p>}
              <div className="detail-genres">
                {selectedBooth.genres.map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => toggleGenre(genre)}
                    className={selectedGenres.includes(genre) ? "selected" : ""}
                    style={{ "--genre-color": genreColor(genre) } as React.CSSProperties}
                  >
                    <span />{genre}
                  </button>
                ))}
              </div>
              {(twitterLinks.length > 0 || instagramLinks.length > 0 || selectedBooth.shopUrl) && (
                <div className="detail-links">
                  {twitterLinks.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer">X {link.label}</a>)}
                  {instagramLinks.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer">Instagram {link.label}</a>)}
                  {selectedBooth.shopUrl && <a href={selectedBooth.shopUrl} target="_blank" rel="noreferrer">코믹인포</a>}
                </div>
              )}
            </article>
          ) : (
            <div className="booth-list">
              {filteredBooths.map((booth) => {
                const hasCoordinates = booth.keys[day].some((key) => slotByKey.has(key));
                return (
                  <button key={booth.id} type="button" className="booth-row" onClick={() => selectBooth(booth.id)}>
                    <span className="booth-number">{booth.boothNum}</span>
                    <span className="booth-name">{booth.name}</span>
                    <span className="booth-tags">
                      {booth.genres.slice(0, 2).map((genre) => <span key={genre}>{genre}</span>)}
                      {booth.genres.length > 2 && <span>+{booth.genres.length - 2}</span>}
                    </span>
                    {!hasCoordinates && <span className="unmapped">좌표 없음</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>
        <p className="sr-only" aria-live="polite">{DAY_LABEL[day]} 부스 {filteredBooths.length}개</p>
      </aside>

      <section className="map-stage" aria-label={`${DAY_LABEL[day]} 부스 지도`}>
        <div className="map-meta">
          <span>{DAY_LABEL[day]}</span>
          {selectedGenres.length > 0 && <span>{selectedGenres.length}개 장르</span>}
          {query && <span>“{query}”</span>}
        </div>
        <div className="map-controls" aria-label="지도 확대 및 축소">
          <button type="button" onClick={() => zoomAroundCenter(1.35)} aria-label="확대">＋</button>
          <span ref={zoomLabelRef}>100%</span>
          <button type="button" onClick={() => zoomAroundCenter(1 / 1.35)} aria-label="축소">−</button>
          <button type="button" className="fit-button" onClick={resetView}>전체</button>
        </div>
        <svg
          ref={svgRef}
          className="floor-map"
          viewBox={`0 0 ${data.map.width} ${data.map.height}`}
          role="img"
          aria-label={`${data.event.title} ${DAY_LABEL[day]} 인터랙티브 지도`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <defs>
            <pattern id="ghost-pattern" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="8" height="8" fill="rgba(74,82,96,.58)" />
              <rect width="2" height="8" fill="rgba(184,193,207,.3)" />
            </pattern>
          </defs>
          <image href={assetPath(data.map.image)} x="0" y="0" width={data.map.width} height={data.map.height} className="floor-image" />
          <g className="slot-layer">
            {data.slots.map((slot) => {
              const boothId = activeMap[slot.key];
              const booth = boothId === undefined ? null : boothById.get(boothId) ?? null;
              const otherBoothId = otherMap[slot.key];
              const empty = boothId === undefined && otherBoothId === undefined;
              const ghost = boothId === undefined && otherBoothId !== undefined;
              const matched = booth ? filteredBoothIds.has(booth.id) : false;
              const selected = booth ? booth.id === selectedBoothId : false;
              const matchingGenres = booth ? selectedGenres.filter((genre) => booth.genres.includes(genre)) : [];
              const clickable = Boolean(booth);
              const defaultFill = matched ? "rgba(44, 212, 181, .72)" : "rgba(27, 34, 45, .76)";
              const fill = empty ? "rgba(10,14,20,.22)" : ghost ? "url(#ghost-pattern)" : matchingGenres.length ? genreColor(matchingGenres[0]) : defaultFill;
              return (
                <g key={slot.key} className={clickable ? "slot active" : "slot"}>
                  <rect
                    x={slot.x}
                    y={slot.y}
                    width={slot.w}
                    height={slot.h}
                    rx={Math.min(1.4, slot.w / 7, slot.h / 7)}
                    fill={fill}
                    fillOpacity={empty ? 0.32 : matched || ghost ? 0.78 : 0.62}
                    stroke={selected ? "#FFFFFF" : ghost ? "#A7B0BE" : matched ? "rgba(255,255,255,.45)" : "rgba(120,132,148,.28)"}
                    strokeWidth={selected ? 3 : ghost ? 1.1 : 0.75}
                    strokeDasharray={ghost ? "3 2" : undefined}
                    vectorEffect="non-scaling-stroke"
                    data-booth-id={booth?.id}
                    aria-hidden="true"
                  >
                    {booth && <title>{slot.label} · {booth.name}</title>}
                  </rect>
                  {matchingGenres.slice(1, 4).map((genre, index) => (
                    <rect
                      key={genre}
                      x={slot.x + (slot.w / Math.min(4, matchingGenres.length)) * (index + 1)}
                      y={slot.y}
                      width={slot.w / Math.min(4, matchingGenres.length)}
                      height={slot.h}
                      fill={genreColor(genre)}
                      fillOpacity=".88"
                      pointerEvents="none"
                    />
                  ))}
                  {booth && matched && (
                    <text x={slot.x + slot.w / 2} y={slot.y + slot.h / 2} className="slot-label" textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
                      {String(slot.label).replace("_", "")}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </section>
    </main>
  );
}
