import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  DamageLegend,
  MapboxDamageMap,
  type BuildingHighlight,
  type MapMarkerSpec,
} from "./components/MapboxDamageMap";
import type { DamageStatus } from "./lib/damage";
import {
  DEFAULT_CENTER,
  demoStatusFor,
  at,
  geocodeAddress,
  type LngLat,
} from "./lib/geo";

const hazards = ["Hurricane", "Flood", "Tornado", "Wildfire", "Other"] as const;
type Hazard = (typeof hazards)[number];

function Icon({
  children,
  size = 20,
  className = "",
}: {
  children: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  );
}

function PinIcon({ size = 16 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path
        d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </Icon>
  );
}

function TargetIcon() {
  return (
    <Icon size={21}>
      <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      <path
        d="M12 2v3M12 19v3M2 12h3M19 12h3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </Icon>
  );
}

function Header({
  onAffected,
  onHome,
  onSubmissions,
}: {
  onAffected: () => void;
  onHome: () => void;
  onSubmissions: () => void;
}) {
  return (
    <header className="app-safe-header-sm bg-[#0f172a] px-4 pb-4 pt-3 text-white">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between">
          <button
            className="flex items-center gap-2"
            onClick={onHome}
            type="button"
            aria-label="Aftermath home"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-white text-[#0f172a]">
              <Icon size={20}>
                <path
                  d="M4 18 9.1 6.8a1 1 0 0 1 1.82 0L16 18M6.3 13h7.4M17.8 7.5 20 12h-4.4"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.3"
                />
              </Icon>
            </span>
            <span className="text-[19px] font-bold tracking-[-0.025em]">Aftermath</span>
          </button>

          <button
            className="group flex size-10 items-center justify-center rounded-xl border border-white/15 bg-white/8 transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            onClick={onSubmissions}
            type="button"
            aria-label="My submissions"
            title="My submissions"
          >
            <Icon size={21}>
              <path
                d="M8 6.5h9M8 11h9M8 15.5h6M5 6.5h.01M5 11h.01M5 15.5h.01"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
              />
              <rect
                height="19"
                rx="2.5"
                stroke="currentColor"
                strokeWidth="1.6"
                width="18"
                x="3"
                y="2.5"
              />
            </Icon>
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-300/20">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-300" />
            </span>
            Live location
          </span>
          <span className="truncate text-[11px] text-slate-400">Fort Myers, FL</span>
          <button
            className="ml-auto text-[11px] font-bold text-blue-300 underline decoration-blue-300/40 underline-offset-4 transition hover:text-white"
            onClick={onAffected}
            type="button"
          >
            I&apos;ve been affected
          </button>
        </div>
      </div>
    </header>
  );
}

function EmergencyCard() {
  return (
    <section
      aria-labelledby="emergency-heading"
      className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.06)]"
    >
      <div className="flex items-center gap-2 bg-[#d32f2f] px-4 py-2 text-white">
        <Icon size={17}>
          <path
            d="M12 8v5M12 16.5v.1M10.4 3.7 2.7 17a1.8 1.8 0 0 0 1.56 2.7h15.48A1.8 1.8 0 0 0 21.3 17L13.6 3.7a1.85 1.85 0 0 0-3.2 0Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.9"
          />
        </Icon>
        <span className="text-[11px] font-bold uppercase tracking-[0.13em]">Life-safety alert</span>
      </div>
      <div className="flex items-center justify-between gap-4 p-4">
        <div>
          <h1 id="emergency-heading" className="text-[17px] font-bold leading-tight text-slate-950">
            Is anyone in danger right now?
          </h1>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
            Don&apos;t wait to submit a report.
          </p>
        </div>
        <a
          className="shrink-0 rounded-xl bg-[#d32f2f] px-4 py-3 text-[13px] font-bold text-white shadow-sm transition hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          href="tel:911"
        >
          Call 911
        </a>
      </div>
    </section>
  );
}

function CaptureForm({ onSubmit }: { onSubmit: (hazard: Hazard, notes: string) => void }) {
  const [hazard, setHazard] = useState<Hazard>("Flood");
  const [address, setAddress] = useState("1842 Bayview Ave, Fort Myers, FL");
  const [editingAddress, setEditingAddress] = useState(false);
  const [notes, setNotes] = useState("");
  const [isProperty, setIsProperty] = useState(false);
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!fileName || progress >= 100) return;
    const timer = window.setInterval(() => {
      setProgress((value) => Math.min(value + 8, 100));
    }, 140);
    return () => window.clearInterval(timer);
  }, [fileName, progress]);

  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setProgress(8);
  };

  return (
    <form
      className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_4px_18px_rgba(15,23,42,0.05)]"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(hazard, notes);
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">
            New field report
          </p>
          <h2 className="mt-0.5 text-lg font-bold tracking-[-0.02em] text-slate-950">
            Capture what you see
          </h2>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
          ~1 min
        </span>
      </div>

      <fieldset>
        <legend className="mb-2 text-[12px] font-semibold text-slate-700">Hazard type</legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {hazards.map((item) => (
            <button
              className={`shrink-0 rounded-full px-3.5 py-2 text-[12px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                item === "Other"
                  ? "col-span-2 w-[calc(50%-0.1875rem)] justify-self-center sm:col-span-1 sm:w-auto"
                  : ""
              } ${
                hazard === item
                  ? "bg-[#0f172a] text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              key={item}
              onClick={() => setHazard(item)}
              type="button"
              aria-pressed={hazard === item}
            >
              {item}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-4">
        <label className="mb-2 block text-[12px] font-semibold text-slate-700" htmlFor="address">
          Location
        </label>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
          <span className="text-blue-700">
            <TargetIcon />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
              GPS detected
            </p>
            {editingAddress ? (
              <input
                autoFocus
                className="mt-0.5 w-full border-b border-blue-400 bg-transparent text-[13px] font-medium text-slate-800 outline-none"
                id="address"
                onChange={(event) => setAddress(event.target.value)}
                onBlur={() => setEditingAddress(false)}
                value={address}
              />
            ) : (
              <p className="truncate text-[13px] font-medium text-slate-800">{address}</p>
            )}
          </div>
          <button
            className="shrink-0 text-[11px] font-bold text-blue-700 underline decoration-blue-300 underline-offset-2"
            onClick={() => setEditingAddress(true)}
            type="button"
          >
            Edit address
          </button>
        </div>
      </div>

      <div className="mt-4">
        <label
          className="mb-2 flex items-center justify-between text-[12px] font-semibold text-slate-700"
          htmlFor="notes"
        >
          <span>Danger notes</span>
          <span className="font-normal text-slate-400">Optional</span>
        </label>
        <input
          className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-3 focus:ring-blue-100"
          id="notes"
          onChange={(event) => setNotes(event.target.value)}
          placeholder='e.g. "elderly man on porch", "water rising"'
          type="text"
          value={notes}
        />
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[12px] font-semibold text-slate-700">Add evidence</p>
        <input
          accept="image/*,video/*"
          className="sr-only"
          onChange={pickFile}
          ref={fileInput}
          type="file"
        />
        <button
          className="w-full rounded-2xl border-1.5 border-dashed border-blue-300 bg-blue-50/60 px-4 py-4 text-left transition hover:border-blue-500 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          onClick={() => fileInput.current?.click()}
          type="button"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-700 text-white shadow-sm">
              <Icon size={22}>
                <path
                  d="M4 8.5h3l1.2-2h7.6l1.2 2h3v10H4v-10Z"
                  stroke="currentColor"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
                <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.8" />
              </Icon>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold text-slate-800">
                {fileName || "Record video or take a photo"}
              </span>
              <span className="mt-0.5 block text-[11px] text-slate-500">
                {fileName
                  ? progress < 100
                    ? "Uploading securely…"
                    : "Ready to submit"
                  : "30–60s video recommended"}
              </span>
            </span>
            {!fileName && (
              <span className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-blue-700 shadow-sm ring-1 ring-slate-200">
                Add
              </span>
            )}
          </div>
          {fileName && (
            <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-blue-100">
              <span
                className="block h-full rounded-full bg-blue-600 transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </span>
          )}
        </button>
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl py-1">
        <button
          aria-checked={isProperty}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${
            isProperty ? "bg-blue-700" : "bg-slate-300"
          }`}
          onClick={() => setIsProperty((value) => !value)}
          role="switch"
          type="button"
        >
          <span
            className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform ${
              isProperty ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <span className="text-[13px] font-medium text-slate-700">Is this your property?</span>
      </label>

      <button
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3.5 text-[14px] font-bold text-white shadow-[0_5px_14px_rgba(29,78,216,0.22)] transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 active:translate-y-px"
        type="submit"
      >
        Submit field report
        <Icon size={17}>
          <path
            d="m9 6 6 6-6 6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </Icon>
      </button>
      <p className="mt-2.5 text-center text-[10px] leading-relaxed text-slate-400">
        Reports are securely shared with emergency response partners.
      </p>
    </form>
  );
}

const analysisSteps = [
  { title: "Uploading evidence", detail: "Media encrypted and secured" },
  { title: "Extracting frames", detail: "Selecting the clearest views" },
  { title: "Nemotron VL assessment", detail: "Analyzing visible damage and hazards" },
];

function ProcessingView({
  hazard,
  notes,
  onNewReport,
}: {
  hazard: Hazard;
  notes: string;
  onNewReport: () => void;
}) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (activeStep >= analysisSteps.length) return;
    const timer = window.setTimeout(() => setActiveStep((step) => step + 1), 900);
    return () => window.clearTimeout(timer);
  }, [activeStep]);

  const complete = activeStep >= analysisSteps.length;

  return (
    <div className="mt-3">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_4px_18px_rgba(15,23,42,0.05)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">
              Report received
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-[-0.025em] text-slate-950">
              {complete ? "Assessment complete" : "Analyzing your report"}
            </h2>
            <p className="mt-1 text-[12px] text-slate-500">Report AM-2841 · {hazard}</p>
          </div>
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-full ${
              complete ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
            }`}
          >
            {complete ? (
              <Icon size={21}>
                <path
                  d="m6 12 4 4 8-9"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.2"
                />
              </Icon>
            ) : (
              <span className="size-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
            )}
          </span>
        </div>

        <div className="mt-6">
          {analysisSteps.map((step, index) => {
            const isDone = activeStep > index;
            const isActive = activeStep === index;
            return (
              <div className="relative flex min-h-[68px] gap-3" key={step.title}>
                {index < analysisSteps.length - 1 && (
                  <span
                    className={`absolute left-[11px] top-6 h-[45px] w-0.5 ${
                      isDone ? "bg-emerald-500" : "bg-slate-200"
                    }`}
                  />
                )}
                <span
                  className={`relative z-10 grid size-6 shrink-0 place-items-center rounded-full border-2 ${
                    isDone
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : isActive
                        ? "border-blue-700 bg-white text-blue-700"
                        : "border-slate-200 bg-white text-slate-300"
                  }`}
                >
                  {isDone ? (
                    <Icon size={13}>
                      <path
                        d="m4 7 2.2 2.2L10.5 5"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      />
                    </Icon>
                  ) : isActive ? (
                    <span className="size-2 animate-pulse rounded-full bg-blue-700" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-current" />
                  )}
                </span>
                <div className="-mt-0.5">
                  <p
                    className={`text-[13px] font-bold ${isActive || isDone ? "text-slate-800" : "text-slate-400"}`}
                  >
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {isDone ? "Complete" : isActive ? step.detail : "Waiting"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section
        className={`mt-3 overflow-hidden rounded-2xl border bg-white shadow-[0_4px_18px_rgba(15,23,42,0.05)] transition ${
          complete
            ? "border-red-200 opacity-100"
            : "pointer-events-none border-slate-200 opacity-45"
        }`}
      >
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
            Overall assessment
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-[12px] font-bold text-red-700 ring-1 ring-inset ring-red-200">
              <span className="size-2 rounded-full bg-[#ef4444]" />
              Severe damage
            </span>
            <span className="text-[11px] font-semibold text-slate-400">High confidence</span>
          </div>
        </div>
        <div className="p-4">
          <p className="text-[12px] font-bold text-slate-800">Flagged on-scene hazards</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
              Rising water
            </span>
            <span className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
              Structural instability
            </span>
            {notes && (
              <span className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
                {notes}
              </span>
            )}
          </div>
        </div>
      </section>

      <aside className="mt-3 flex gap-3 rounded-2xl border border-slate-200 bg-slate-100/80 p-4 text-slate-600">
        <span className="mt-0.5 shrink-0 text-slate-500">
          <Icon size={18}>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M12 10v6M12 7.2v.1"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
            />
          </Icon>
        </span>
        <p className="text-[11px] leading-[1.6]">
          The resident can claim this report by visiting this site and choosing{" "}
          <strong className="font-bold text-slate-700">
            &ldquo;I&apos;ve been affected.&rdquo;
          </strong>
        </p>
      </aside>

      <button
        className="mx-auto mt-4 block text-[12px] font-bold text-blue-700 underline decoration-blue-300 underline-offset-4"
        onClick={onNewReport}
        type="button"
      >
        Start another report
      </button>
    </div>
  );
}

type DamageLevel = "Minor" | "Moderate" | "Severe" | "Destroyed";

type Submission = {
  id: number;
  address: string;
  hazard: Hazard;
  time: string;
  claimed: boolean;
  damage: DamageLevel;
  lng: number;
  lat: number;
};

const submissions: Submission[] = [
  {
    id: 1,
    address: "1842 Bayview Ave",
    hazard: "Flood",
    time: "8 min ago",
    claimed: false,
    damage: "Severe",
    ...at(0, 0),
  },
  {
    id: 2,
    address: "720 Palm Beach Blvd",
    hazard: "Hurricane",
    time: "42 min ago",
    claimed: true,
    damage: "Moderate",
    ...at(-120, -60),
  },
  {
    id: 3,
    address: "2910 Riverside Dr",
    hazard: "Flood",
    time: "Yesterday",
    claimed: true,
    damage: "Minor",
    ...at(140, -90),
  },
  {
    id: 4,
    address: "96 Royal Palm Park Rd",
    hazard: "Tornado",
    time: "2 days ago",
    claimed: false,
    damage: "Destroyed",
    ...at(110, 120),
  },
];

const damageColors: Record<DamageLevel, string> = {
  Minor: "#eab308",
  Moderate: "#f97316",
  Severe: "#ef4444",
  Destroyed: "#7f1d1d",
};

/** Building colour: a claimed report means the resident verified the address -> cobalt. */
function submissionStatus(item: Submission): DamageStatus {
  return item.claimed ? "verified" : pinStatus(item);
}

/** Pin colour always reflects the damage level. */
function pinStatus(item: Submission): DamageStatus {
  return item.damage === "Minor" ? "minor" : item.damage === "Moderate" ? "moderate" : "severe";
}

function MapCanvas({
  filtered,
  selectedId,
  onSelect,
  recenterKey,
}: {
  filtered: Submission[];
  selectedId: number;
  onSelect: (id: number) => void;
  recenterKey: number;
}) {
  // The submissions themselves, plus a shaded residential area around them.
  const highlights: BuildingHighlight[] = filtered.map((item) => ({
    id: String(item.id),
    lng: item.lng,
    lat: item.lat,
    status: submissionStatus(item),
  }));
  const areaFill = useMemo(
    () => ({
      center: DEFAULT_CENTER,
      radiusMeters: 260,
      statusFor: demoStatusFor(DEFAULT_CENTER, 260),
    }),
    [],
  );

  const markers: MapMarkerSpec[] = filtered.map((item) => ({
    id: String(item.id),
    lng: item.lng,
    lat: item.lat,
    status: pinStatus(item),
    variant: "pin",
    label: item.claimed ? "Claimed" : "Unclaimed",
    ariaLabel: `${item.address}, ${item.damage} damage, ${item.claimed ? "claimed" : "unclaimed"}`,
    selected: selectedId === item.id,
  }));

  return (
    <MapboxDamageMap
      areaFill={areaFill}
      center={DEFAULT_CENTER}
      focusId={selectedId ? String(selectedId) : null}
      highlights={highlights}
      markers={markers}
      onSelect={(id) => {
        const n = Number(id);
        if (submissions.some((item) => item.id === n)) onSelect(n);
      }}
      recenterKey={recenterKey}
    />
  );
}

function SubmissionCard({
  item,
  selected,
  onSelect,
}: {
  item: Submission;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition ${
        item.id === 1
          ? "border-red-300 bg-red-50 hover:border-red-400"
          : selected
            ? "border-blue-400 bg-blue-50 shadow-[0_5px_16px_rgba(37,99,235,.09)]"
            : "border-slate-200 bg-white hover:border-slate-300"
      }`}
      onClick={onSelect}
      type="button"
    >
      <span className="relative h-[70px] w-[88px] shrink-0 overflow-hidden rounded-xl bg-slate-800">
        <img
          alt={`Field footage at ${item.address}`}
          className="h-full w-full object-cover"
          src="https://images.unsplash.com/photo-1543276678-9d354df1c191?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=75&w=240"
        />
        <span className="absolute inset-0 bg-slate-950/15" />
        <span className="absolute bottom-1.5 left-1.5 grid size-5 place-items-center rounded-full bg-black/65 text-white backdrop-blur-sm">
          <Icon size={10}>
            <path d="m9 7 7 5-7 5V7Z" fill="currentColor" />
          </Icon>
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="truncate text-[13px] font-bold text-slate-900">{item.address}</span>
          <span
            className="mt-1 size-2 shrink-0 rounded-full"
            style={{ backgroundColor: damageColors[item.damage] }}
            title={`${item.damage} damage`}
          />
        </span>
        <span className="mt-1 block text-[10px] text-slate-400">
          Fort Myers, FL 33916 · {item.time}
        </span>
        <span className="mt-2 flex items-center gap-1.5">
          <span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600">
            {item.hazard}
          </span>
          <span
            className={`rounded-md px-2 py-1 text-[9px] font-bold ${
              item.claimed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {item.claimed ? "Claimed" : "Unclaimed"}
          </span>
        </span>
      </span>
      <span className="mr-1 text-slate-400">
        <Icon size={16}>
          <path
            d="m9 6 6 6-6 6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </Icon>
      </span>
    </button>
  );
}

function SubmissionsMap({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(1);
  const [recenterKey, setRecenterKey] = useState(0);

  const filtered = submissions.filter((item) =>
    `${item.address} ${item.hazard} ${item.damage}`.toLowerCase().includes(query.toLowerCase()),
  );

  const selectItem = (id: number) => {
    setSelectedId(id);
  };

  return (
    <div className="relative h-[100dvh] min-h-[650px] overflow-hidden bg-[#111922] text-slate-900">
      <MapCanvas
        filtered={filtered}
        onSelect={selectItem}
        recenterKey={recenterKey}
        selectedId={selectedId}
      />

      <div className="app-safe-map-header absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-[#071018]/90 to-transparent px-3 pb-12 pt-3 md:px-6 md:pt-5">
        <div className="mx-auto flex max-w-[900px] items-center gap-2.5">
          <button
            aria-label="Back to submissions list"
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-[#0f172a]/90 text-white shadow-xl backdrop-blur-md transition hover:bg-slate-800"
            onClick={onBack}
            type="button"
          >
            <Icon size={20}>
              <path
                d="m15 5-7 7 7 7"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </Icon>
          </button>
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-white/15 bg-[#0f172a]/92 px-3.5 text-white shadow-xl backdrop-blur-md">
            <Icon size={18}>
              <circle cx="10.5" cy="10.5" r="6" stroke="currentColor" strokeWidth="1.8" />
              <path d="m15 15 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
            </Icon>
            <input
              aria-label="Filter submissions"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search hazard or street"
              value={query}
            />
            {query && (
              <button
                aria-label="Clear search"
                className="text-slate-400 hover:text-white"
                onClick={() => setQuery("")}
                type="button"
              >
                <Icon size={16}>
                  <path
                    d="m6 6 12 12M18 6 6 18"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="2"
                  />
                </Icon>
              </button>
            )}
          </label>
          <button
            aria-label="Re-center map"
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-xl transition hover:bg-blue-500 active:scale-95"
            onClick={() => {
              setSelectedId(0);
              setRecenterKey((key) => key + 1);
            }}
            type="button"
          >
            <TargetIcon />
          </button>
        </div>
      </div>

      <div className="app-safe-map-count absolute left-3 top-[82px] z-20 rounded-xl border border-white/10 bg-[#0f172a]/85 px-3 py-2 text-white shadow-lg backdrop-blur-md md:left-6 md:top-[90px]">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
          My filmed properties
        </p>
        <p className="mt-0.5 text-[13px] font-bold">
          {filtered.length} {filtered.length === 1 ? "submission" : "submissions"}
        </p>
      </div>

      <DamageLegend className="absolute bottom-7 right-3 z-20 rounded-xl border border-white/10 bg-[#0f172a]/85 p-2.5 text-slate-200 shadow-lg backdrop-blur-md md:bottom-8 md:right-6" />
    </div>
  );
}

function SubmissionsList({ onBack, onOpenMap }: { onBack: () => void; onOpenMap: () => void }) {
  const [query, setQuery] = useState("");
  const filtered = submissions.filter((item) =>
    `${item.address} ${item.hazard} ${item.damage}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-[#f3f5f7]">
      <header className="app-safe-header border-b border-slate-200 bg-[#0f172a] px-4 py-4 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            aria-label="Back to reporter view"
            className="grid size-10 place-items-center rounded-xl bg-white/10"
            onClick={onBack}
            type="button"
          >
            <Icon size={19}>
              <path
                d="m15 5-7 7 7 7"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </Icon>
          </button>
          <div>
            <p className="text-[10px] font-semibold text-blue-300">Field history</p>
            <h1 className="text-[19px] font-bold">My submissions</h1>
          </div>
          <button
            className="ml-auto flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2.5 text-[11px] font-bold shadow-lg transition hover:bg-blue-500"
            onClick={onOpenMap}
            type="button"
          >
            <PinIcon size={15} />
            View map
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5">
        <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
          <Icon size={17}>
            <circle cx="10.5" cy="10.5" r="6" stroke="currentColor" strokeWidth="1.8" />
            <path d="m15 15 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          </Icon>
          <input
            aria-label="Filter submissions"
            className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-slate-400"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search hazard or street"
            value={query}
          />
        </label>
        <div className="mb-3 mt-5 flex items-center justify-between">
          <p className="text-[11px] font-bold text-slate-700">
            {filtered.length} filmed {filtered.length === 1 ? "property" : "properties"}
          </p>
          <span className="text-[9px] font-semibold text-slate-400">Newest first</span>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {filtered.map((item) => (
            <div
              className={
                item.damage === "Minor"
                  ? "[&>button]:!border-yellow-300 [&>button]:!bg-yellow-50 [&>button:hover]:!border-yellow-400"
                  : item.damage === "Moderate"
                    ? "[&>button]:!border-orange-300 [&>button]:!bg-orange-50 [&>button:hover]:!border-orange-400"
                    : item.damage === "Severe"
                      ? "[&>button]:!border-red-300 [&>button]:!bg-red-50 [&>button:hover]:!border-red-400"
                      : "[&>button]:!border-red-900/40 [&>button]:!bg-red-950/10 [&>button:hover]:!border-red-900/60"
              }
              key={item.id}
            >
              <SubmissionCard item={item} onSelect={onOpenMap} selected={false} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

const addressSuggestions = [
  "1842 Bayview Ave, Fort Myers, FL 33916",
  "1842 Bayview Ct, Fort Myers, FL 33916",
  "1842 Bayside Pkwy, Fort Myers, FL 33901",
];

type MapMode = "damage" | "hazards";

function AggregateMap({ address, onOpenReport }: { address: string; onOpenReport: () => void }) {
  const [mode, setMode] = useState<MapMode>("damage");
  const cells = Array.from({ length: 30 }, (_, index) => ({
    id: index,
    intensity: ((index * 7 + 3) % 5) + 1,
    warning: [7, 13, 16, 22].includes(index),
  }));

  const damageCell = (intensity: number) => {
    const colors = ["#26394a", "#4c4732", "#8f552d", "#9c3c31", "#6e2935"];
    return colors[intensity - 1];
  };

  const hazardCell = (warning: boolean, intensity: number) => {
    if (warning) return intensity > 3 ? "#9f302f" : "#875f29";
    return intensity > 3 ? "#254c54" : "#233946";
  };

  return (
    <section className="relative h-full min-h-[610px] flex-1 overflow-hidden bg-[#111b25]">
      <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] [background-size:32px_32px]" />
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full opacity-80"
        preserveAspectRatio="none"
        viewBox="0 0 900 800"
      >
        <path
          d="M-40 630C170 520 215 410 390 355s315-5 560-190"
          fill="none"
          stroke="#2a3b49"
          strokeLinecap="round"
          strokeWidth="66"
        />
        <path
          d="M-40 630C170 520 215 410 390 355s315-5 560-190"
          fill="none"
          stroke="#697784"
          strokeDasharray="5 18"
          strokeWidth="2"
        />
        <path
          d="M145-30c5 195 70 285 170 390s180 200 205 480M680-20c-50 160-25 280 65 375s140 175 165 285"
          fill="none"
          stroke="#273845"
          strokeWidth="38"
        />
        <path
          d="M-20 210c190-20 320 15 440 80M420 820c65-145 170-260 480-360"
          fill="none"
          stroke="#2a3c49"
          strokeWidth="24"
        />
        <path d="M-20 720c220-20 395-130 540-95s210 90 400 55v160H-20Z" fill="#15394b" />
      </svg>

      <div className="absolute left-[10%] top-[18%] grid w-[80%] grid-cols-6 gap-1.5 opacity-90 [transform:perspective(750px)_rotateX(9deg)_rotateZ(-5deg)]">
        {cells.map((cell) => (
          <div
            className="relative aspect-[1.18] rounded-[4px] border border-white/5 shadow-[inset_0_0_12px_rgba(255,255,255,.03)] transition-colors duration-500"
            key={cell.id}
            style={{
              backgroundColor:
                mode === "damage"
                  ? damageCell(cell.intensity)
                  : hazardCell(cell.warning, cell.intensity),
            }}
          >
            {mode === "hazards" && cell.warning && (
              <span className="absolute inset-0 grid place-items-center text-amber-200">
                <Icon size={18}>
                  <path
                    d="M12 8v5M12 16.5v.1M10.4 3.7 2.7 17a1.8 1.8 0 0 0 1.56 2.7h15.48A1.8 1.8 0 0 0 21.3 17L13.6 3.7a1.85 1.85 0 0 0-3.2 0Z"
                    fill="rgba(245,158,11,.18)"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </Icon>
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="app-safe-overlay-top absolute left-3 right-3 top-3 z-20 space-y-2 md:left-5 md:right-5 md:top-5">
        <div className="flex items-center gap-2 rounded-xl border border-red-300/20 bg-[#381b20]/92 px-3 py-2.5 text-white shadow-xl backdrop-blur-md">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-red-500/20 text-red-300">
            <Icon size={16}>
              <path
                d="M12 8v5M12 16.5v.1M10.4 3.7 2.7 17a1.8 1.8 0 0 0 1.56 2.7h15.48A1.8 1.8 0 0 0 21.3 17L13.6 3.7a1.85 1.85 0 0 0-3.2 0Z"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </Icon>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-red-300">
              National Weather Service
            </p>
            <p className="truncate text-[11px] font-semibold">
              Flash Flood Warning · Active until 8:45 PM
            </p>
          </div>
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-red-400" />
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-[#122d2d]/92 px-3 py-2 text-white shadow-xl backdrop-blur-md">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
            <Icon size={14}>
              <path
                d="m5 12 4 4 10-10"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </Icon>
          </span>
          <p className="min-w-0 flex-1 truncate text-[10px] font-semibold">
            <span className="text-emerald-300">OpenFEMA verified</span> · Lee County declared
            disaster area
          </p>
        </div>
      </div>

      <div className="absolute left-1/2 top-[48%] z-20 -translate-x-1/2 -translate-y-1/2 text-center">
        <span className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border border-blue-400/70 bg-blue-500/15" />
        <button
          aria-label="Open full property report"
          className="relative grid size-12 place-items-center rounded-full border-[3px] border-white bg-[#1d4ed8] text-white shadow-[0_8px_30px_rgba(29,78,216,.6)] transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          onClick={onOpenReport}
          type="button"
        >
          <Icon size={22}>
            <path
              d="M5 17V9l7-5 7 5v8h-5v-5h-4v5H5Z"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="1.9"
            />
          </Icon>
        </button>
        <button
          className="mt-2 block whitespace-nowrap rounded-lg bg-white px-2.5 py-1 text-[9px] font-bold text-blue-800 shadow-lg"
          onClick={onOpenReport}
          type="button"
        >
          Open verified property report
        </button>
      </div>

      <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 rounded-full border border-white/15 bg-[#0f172a]/94 p-1 text-white shadow-xl backdrop-blur-md">
        <button
          className={`whitespace-nowrap rounded-full px-3 py-2 text-[10px] font-bold transition ${
            mode === "damage" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"
          }`}
          onClick={() => setMode("damage")}
          type="button"
        >
          Worst Damage
        </button>
        <button
          className={`whitespace-nowrap rounded-full px-3 py-2 text-[10px] font-bold transition ${
            mode === "hazards" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"
          }`}
          onClick={() => setMode("hazards")}
          type="button"
        >
          Life-Safety Hazards
        </button>
      </div>

      <div className="absolute bottom-5 right-3 hidden rounded-xl border border-white/10 bg-[#0f172a]/90 px-3 py-2 text-white shadow-lg backdrop-blur-md md:block">
        <p className="text-[9px] font-bold text-slate-300">Privacy grid · 250m cells</p>
        <p className="mt-0.5 text-[8px] text-slate-500">Reports from the last 72 hours</p>
      </div>

      <div className="absolute bottom-[78px] left-3 rounded-lg bg-[#0f172a]/80 px-2 py-1.5 text-[8px] font-semibold text-slate-300 backdrop-blur-sm md:left-5">
        {address || "1842 Bayview Ave, Fort Myers"}
      </div>
    </section>
  );
}

function VerificationPanel({
  address,
  onAddressChange,
  onBack,
  onContinue,
}: {
  address: string;
  onAddressChange: (address: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [idState, setIdState] = useState<"empty" | "scanning" | "verified">("empty");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (idState !== "scanning") return;
    const timer = window.setTimeout(() => setIdState("verified"), 1800);
    return () => window.clearTimeout(timer);
  }, [idState]);

  return (
    <aside className="app-safe-header relative z-30 mx-auto min-h-screen w-full max-w-[520px] shrink-0 bg-[#f6f7f9] px-4 pb-8 pt-4 md:px-7 md:py-6">
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-2 text-[12px] font-bold text-slate-600 transition hover:text-slate-950"
          onClick={onBack}
          type="button"
        >
          <Icon size={17}>
            <path
              d="m15 5-7 7 7 7"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </Icon>
          Reporter portal
        </button>
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700">
          <Icon size={13}>
            <rect
              height="9"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.8"
              width="12"
              x="6"
              y="11"
            />
            <path
              d="M9 11V8a3 3 0 0 1 6 0v3"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.8"
            />
          </Icon>
          Secure session
        </span>
      </div>

      <div className="mt-7 flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-[#0f172a] text-white">
          <Icon size={21}>
            <path
              d="M4 18 9.1 6.8a1 1 0 0 1 1.82 0L16 18M6.3 13h7.4M17.8 7.5 20 12h-4.4"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.3"
            />
          </Icon>
        </span>
        <span className="text-[20px] font-bold tracking-[-0.03em] text-slate-950">Aftermath</span>
      </div>

      <div className="mt-7">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">
          Resident verification
        </p>
        <h1 className="mt-1.5 text-[27px] font-bold leading-[1.12] tracking-[-0.035em] text-slate-950">
          See what&apos;s happening near your home
        </h1>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
          Confirm your residence to view privacy-protected damage and life-safety reports in your
          area.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_7px_24px_rgba(15,23,42,.06)]">
        <div className="flex items-center gap-3">
          <span className="grid size-7 place-items-center rounded-full bg-blue-700 text-[11px] font-bold text-white">
            1
          </span>
          <div>
            <h2 className="text-[13px] font-bold text-slate-900">Verify your address</h2>
            <p className="text-[10px] text-slate-400">Used only to position your private map</p>
          </div>
        </div>
        <div className="relative mt-3">
          <label className="sr-only" htmlFor="resident-address">
            Home address
          </label>
          <span className="pointer-events-none absolute left-3 top-3.5 text-blue-700">
            <PinIcon size={18} />
          </span>
          <input
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-[12px] font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-3 focus:ring-blue-100"
            id="resident-address"
            onChange={(event) => {
              onAddressChange(event.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Start typing your street address"
            value={address}
          />
          {showSuggestions && (
            <div className="absolute inset-x-0 top-[52px] z-40 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
              {addressSuggestions
                .filter((suggestion) =>
                  suggestion.toLowerCase().includes(address.toLowerCase().slice(0, 12)),
                )
                .map((suggestion) => (
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-[11px] text-slate-600 transition hover:bg-slate-50"
                    key={suggestion}
                    onClick={() => {
                      onAddressChange(suggestion);
                      setShowSuggestions(false);
                    }}
                    type="button"
                  >
                    <span className="text-slate-400">
                      <PinIcon size={14} />
                    </span>
                    {suggestion}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_7px_24px_rgba(15,23,42,.06)]">
        <div className="flex items-center gap-3">
          <span
            className={`grid size-7 place-items-center rounded-full text-[11px] font-bold ${
              idState === "verified" ? "bg-emerald-600 text-white" : "bg-blue-700 text-white"
            }`}
          >
            {idState === "verified" ? (
              <Icon size={15}>
                <path
                  d="m4 8 3 3 5-6"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </Icon>
            ) : (
              "2"
            )}
          </span>
          <div>
            <h2 className="text-[13px] font-bold text-slate-900">Demo identity check</h2>
            <p className="text-[10px] text-slate-400">Government-issued photo ID</p>
          </div>
        </div>

        <input
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            if (event.target.files?.[0]) setIdState("scanning");
          }}
          ref={fileInput}
          type="file"
        />
        <button
          className={`relative mt-3 h-[168px] w-full overflow-hidden rounded-2xl border-2 border-dashed transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
            idState === "verified"
              ? "border-emerald-300 bg-emerald-50"
              : "border-slate-300 bg-[#111b25] hover:border-blue-400"
          }`}
          onClick={() => fileInput.current?.click()}
          type="button"
        >
          {idState === "verified" ? (
            <span className="grid h-full place-items-center px-5 text-center">
              <span>
                <span className="mx-auto grid size-11 place-items-center rounded-full bg-emerald-600 text-white">
                  <Icon size={22}>
                    <path
                      d="m5 12 4 4 10-10"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.2"
                    />
                  </Icon>
                </span>
                <span className="mt-2 block text-[13px] font-bold text-emerald-900">
                  Details extracted
                </span>
                <span className="mt-1 block text-[10px] text-emerald-700">
                  Document image deleted · Tap to scan again
                </span>
              </span>
            </span>
          ) : (
            <>
              <span className="absolute left-4 top-4 size-7 border-l-2 border-t-2 border-blue-400" />
              <span className="absolute right-4 top-4 size-7 border-r-2 border-t-2 border-blue-400" />
              <span className="absolute bottom-4 left-4 size-7 border-b-2 border-l-2 border-blue-400" />
              <span className="absolute bottom-4 right-4 size-7 border-b-2 border-r-2 border-blue-400" />
              {idState === "scanning" && (
                <span className="absolute left-6 right-6 top-1/2 h-px animate-[scan_1.2s_ease-in-out_infinite] bg-blue-300 shadow-[0_0_12px_#60a5fa]" />
              )}
              <span className="grid h-full place-items-center px-8 text-center text-white">
                <span>
                  <span className="mx-auto grid size-10 place-items-center rounded-xl bg-white/10 text-blue-300">
                    {idState === "scanning" ? (
                      <span className="size-5 animate-spin rounded-full border-2 border-blue-300/30 border-t-blue-300" />
                    ) : (
                      <Icon size={22}>
                        <path
                          d="M4 8.5h3l1.2-2h7.6l1.2 2h3v10H4v-10Z"
                          stroke="currentColor"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                        />
                        <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.8" />
                      </Icon>
                    )}
                  </span>
                  <span className="mt-2 block text-[12px] font-bold">
                    {idState === "scanning"
                      ? "Detecting document edges…"
                      : "Photograph the front of your ID"}
                  </span>
                  <span className="mt-1 block text-[9px] text-slate-400">
                    {idState === "scanning"
                      ? "Extracting address securely"
                      : "Align all four corners inside the guide"}
                  </span>
                </span>
              </span>
            </>
          )}
        </button>

        <div className="mt-3 flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-blue-900">
          <span className="mt-0.5 shrink-0 text-blue-700">
            <Icon size={15}>
              <rect
                height="9"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.8"
                width="12"
                x="6"
                y="11"
              />
              <path
                d="M9 11V8a3 3 0 0 1 6 0v3"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </Icon>
          </span>
          <p className="text-[9px] font-semibold leading-relaxed">
            Demo identity check — Document image is permanently deleted immediately after extraction
          </p>
        </div>
      </div>

      <p className="mt-4 text-center text-[9px] leading-relaxed text-slate-400">
        Your identity is never shown to reporters or neighbors. Area reports are aggregated into
        250m cells.
      </p>
      <button
        className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[12px] font-bold transition ${
          idState === "verified"
            ? "bg-blue-700 text-white shadow-lg hover:bg-blue-800"
            : "cursor-not-allowed bg-slate-200 text-slate-400"
        }`}
        disabled={idState !== "verified"}
        onClick={onContinue}
        type="button"
      >
        Continue to private area map
        <Icon size={16}>
          <path
            d="m9 6 6 6-6 6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </Icon>
      </button>
    </aside>
  );
}

const propertyPhoto =
  "https://images.unsplash.com/photo-1761959166803-ed952543eeae?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=82&w=1400";
const roofPhoto =
  "https://images.unsplash.com/photo-1633759593085-1eaeb724fc88?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=80&w=900";
const aerialPhoto =
  "https://images.unsplash.com/photo-1682351889381-9bbc98ebca86?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=80&w=900";

function StatusRing({
  color,
  label,
  value,
  detail,
}: {
  color: string;
  label: string;
  value: number;
  detail: string;
}) {
  const circumference = 2 * Math.PI * 26;
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3">
      <div className="relative mx-auto size-[66px]">
        <svg className="-rotate-90" height="66" viewBox="0 0 66 66" width="66">
          <circle cx="33" cy="33" fill="none" r="26" stroke="#e2e8f0" strokeWidth="6" />
          <circle
            cx="33"
            cy="33"
            fill="none"
            r="26"
            stroke={color}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - value / 100)}
            strokeLinecap="round"
            strokeWidth="6"
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-[14px] font-bold text-slate-900">
          {value}
        </span>
      </div>
      <p className="mt-2 text-center text-[10px] font-bold leading-tight text-slate-800">{label}</p>
      <p className="mt-1 text-center text-[8px] text-slate-400">{detail}</p>
    </div>
  );
}

function FindingsPanel() {
  const [frame, setFrame] = useState(0);
  const [copied, setCopied] = useState(false);
  const frames = [
    {
      image: propertyPhoto,
      label: "Roofline",
      note: "Major roof plane deformation",
      box: "left-[17%] top-[18%] h-[36%] w-[56%]",
    },
    {
      image: roofPhoto,
      label: "Roof detail",
      note: "Missing shingles and exposed decking",
      box: "left-[28%] top-[14%] h-[45%] w-[40%]",
    },
    {
      image: aerialPhoto,
      label: "Structure",
      note: "Debris field and water intrusion",
      box: "left-[34%] top-[25%] h-[48%] w-[35%]",
    },
  ];

  const fnolText =
    "First Notice of Loss — 1842 Bayview Ave. Severe storm-related roof and structural damage observed. Water intrusion and unsafe roof conditions detected. Estimated automated repair range: $67,400–$84,600.";

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-violet-700">
              Nemotron analysis
            </p>
            <h2 className="mt-0.5 text-[15px] font-bold text-slate-950">Damage findings</h2>
          </div>
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[9px] font-bold text-violet-700">
            93% confidence
          </span>
        </div>
        <div className="p-3.5">
          <div className="relative h-[235px] overflow-hidden rounded-xl bg-slate-900 md:h-[280px]">
            <img
              alt={`Analyzed video frame showing ${frames[frame].label.toLowerCase()}`}
              className="h-full w-full object-cover opacity-85"
              src={frames[frame].image}
            />
            <span className={`absolute border-2 border-red-400 ${frames[frame].box}`}>
              <span className="absolute -top-6 left-[-2px] whitespace-nowrap bg-red-500 px-1.5 py-1 text-[8px] font-bold text-white">
                {frames[frame].note}
              </span>
              <span className="absolute -bottom-5 right-0 bg-black/75 px-1.5 py-0.5 text-[7px] font-semibold text-white">
                0.93
              </span>
            </span>
            <span className="absolute bottom-3 left-3 rounded-md bg-black/70 px-2 py-1 text-[8px] font-bold text-white backdrop-blur-sm">
              Frame {String(frame + 1).padStart(2, "0")} · 00:{12 + frame * 9}
            </span>
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            {frames.map((item, index) => (
              <button
                className={`relative h-[58px] overflow-hidden rounded-lg border-2 transition ${
                  frame === index
                    ? "border-blue-600"
                    : "border-transparent opacity-65 hover:opacity-100"
                }`}
                key={item.label}
                onClick={() => setFrame(index)}
                type="button"
              >
                <img alt="" className="h-full w-full object-cover" src={item.image} />
                <span className="absolute inset-x-0 bottom-0 bg-black/65 px-1 py-0.5 text-[7px] font-bold text-white">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["Roof failure", "Water intrusion", "Unstable structure"].map((hazard) => (
              <span
                className="rounded-md bg-red-50 px-2 py-1 text-[9px] font-bold text-red-700"
                key={hazard}
              >
                {hazard}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
          <h2 className="text-[14px] font-bold text-slate-950">Itemized repair estimate</h2>
          <span className="rounded-md bg-amber-100 px-2 py-1 text-[8px] font-extrabold uppercase tracking-[0.08em] text-amber-900">
            Automated Estimate — Demo Model
          </span>
        </div>
        <div className="overflow-hidden">
          <table className="w-full table-fixed text-left">
            <thead className="bg-slate-50 text-[8px] font-bold uppercase tracking-[0.09em] text-slate-400">
              <tr>
                <th className="w-[42%] px-3 py-2.5 sm:w-[30%] sm:px-4">Repair category</th>
                <th className="hidden px-3 py-2.5 sm:table-cell">Scope detected</th>
                <th className="w-[40%] px-3 py-2.5 text-right sm:w-[25%] sm:px-4">Estimate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[10px]">
              <tr>
                <td className="px-3 py-3 font-bold text-slate-800 sm:px-4">Roofing</td>
                <td className="hidden px-3 py-3 text-slate-500 sm:table-cell">
                  2,140 sq ft · full replacement
                </td>
                <td className="px-3 py-3 text-right font-bold text-slate-800 sm:px-4">$28,900</td>
              </tr>
              <tr>
                <td className="px-3 py-3 font-bold text-slate-800 sm:px-4">Structural</td>
                <td className="hidden px-3 py-3 text-slate-500 sm:table-cell">
                  Rafters, load wall inspection
                </td>
                <td className="px-3 py-3 text-right font-bold text-slate-800 sm:px-4">$34,500</td>
              </tr>
              <tr>
                <td className="px-3 py-3 font-bold text-slate-800 sm:px-4">Siding & envelope</td>
                <td className="hidden px-3 py-3 text-slate-500 sm:table-cell">
                  East elevation · 680 sq ft
                </td>
                <td className="px-3 py-3 text-right font-bold text-slate-800 sm:px-4">$12,400</td>
              </tr>
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50">
              <tr>
                <td
                  className="px-3 py-3 text-[9px] font-bold text-slate-700 sm:px-4 sm:text-[10px]"
                  colSpan={2}
                >
                  Modeled repair total
                </td>
                <td className="px-3 py-3 text-right text-[13px] font-extrabold text-slate-950 sm:px-4 sm:text-[15px]">
                  $75,800
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-blue-700">
              Insurance-ready draft
            </p>
            <h2 className="mt-1 text-[14px] font-bold text-slate-950">
              First Notice of Loss (FNOL)
            </h2>
          </div>
          <button
            className="shrink-0 rounded-lg bg-blue-700 px-3 py-2 text-[9px] font-bold text-white transition hover:bg-blue-800"
            onClick={async () => {
              await navigator.clipboard?.writeText(fnolText);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            }}
            type="button"
          >
            {copied ? "Copied" : "Export / Copy"}
          </button>
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-slate-600">{fnolText}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
          <span className="rounded-lg bg-white/80 p-2 text-slate-500">
            Date of loss <strong className="block text-slate-800">Oct 9, 2025</strong>
          </span>
          <span className="rounded-lg bg-white/80 p-2 text-slate-500">
            Cause <strong className="block text-slate-800">Wind + flood</strong>
          </span>
        </div>
      </section>
    </div>
  );
}

function CashFlowChart({ balance }: { balance: number }) {
  const months = [
    { label: "Now", living: 30, repair: 15, relief: 4 },
    { label: "Day 30", living: 32, repair: 56, relief: 18 },
    { label: "Day 60", living: 29, repair: 44, relief: 52 },
    { label: "Day 90", living: 31, repair: 26, relief: 72 },
  ];
  return (
    <div className="mt-4">
      <div className="flex h-[155px] items-end justify-between gap-4 border-b border-slate-200 px-2">
        {months.map((month) => (
          <div className="flex h-full flex-1 items-end justify-center gap-1" key={month.label}>
            <span
              className="w-[28%] rounded-t-sm bg-slate-400"
              style={{ height: `${month.living}%` }}
              title="Living expenses"
            />
            <span
              className="w-[28%] rounded-t-sm bg-orange-400"
              style={{ height: `${month.repair}%` }}
              title="Repair obligations"
            />
            <span
              className="w-[28%] rounded-t-sm bg-emerald-500"
              style={{ height: `${month.relief}%` }}
              title="Relief payouts"
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between px-2 text-[8px] font-semibold text-slate-400">
        {months.map((month) => (
          <span key={month.label}>{month.label}</span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[8px] font-semibold text-slate-500">
        <span className="flex items-center gap-1">
          <i className="size-2 rounded-sm bg-slate-400" />
          Living
        </span>
        <span className="flex items-center gap-1">
          <i className="size-2 rounded-sm bg-orange-400" />
          Structural repair
        </span>
        <span className="flex items-center gap-1">
          <i className="size-2 rounded-sm bg-emerald-500" />
          Relief / insurance
        </span>
        <span className="ml-auto font-bold text-slate-700">
          Day 90: ${balance.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function RecoveryNavigator() {
  const [deductible, setDeductible] = useState(5000);
  const [outOfPocket, setOutOfPocket] = useState(12000);
  const [femaApproved, setFemaApproved] = useState(true);
  const projectedBalance = Math.max(
    0,
    22600 - deductible - outOfPocket + (femaApproved ? 14500 : 0),
  );
  const score = Math.min(92, Math.round(48 + projectedBalance / 850));

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-blue-700">
              PNC Recovery Navigator
            </p>
            <h2 className="mt-1 text-[15px] font-bold text-slate-950">Financial health</h2>
          </div>
          <span className="text-[8px] font-semibold text-slate-400">Scenario-adjusted</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          <StatusRing color="#eab308" detail="2.1 months" label="Emergency Reserve" value={62} />
          <StatusRing color="#f97316" detail="$18.4k" label="Coverage Gap" value={44} />
          <StatusRing color="#ef4444" detail="31% of cash" label="Out-of-Pocket Ratio" value={31} />
          <StatusRing color="#7c3aed" detail="18% income" label="Debt Obligation" value={72} />
          <StatusRing color="#10b981" detail="On track" label="Recovery Score" value={score} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400">
              90-day forecast
            </p>
            <h2 className="mt-1 text-[14px] font-bold text-slate-950">Cash flow outlook</h2>
          </div>
          <span
            className={`rounded-lg px-2 py-1 text-[9px] font-bold ${projectedBalance > 10000 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
          >
            ${projectedBalance.toLocaleString()} projected
          </span>
        </div>
        <CashFlowChart balance={projectedBalance} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-blue-700">
            What-if simulator
          </p>
          <h2 className="mt-1 text-[14px] font-bold text-slate-950">Test your recovery plan</h2>
        </div>
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="flex justify-between text-[9px] font-bold text-slate-600">
              Insurance deductible{" "}
              <strong className="text-slate-950">${deductible.toLocaleString()}</strong>
            </span>
            <input
              className="mt-2 w-full accent-blue-700"
              max="15000"
              min="1000"
              onChange={(event) => setDeductible(Number(event.target.value))}
              step="500"
              type="range"
              value={deductible}
            />
          </label>
          <label className="block">
            <span className="flex justify-between text-[9px] font-bold text-slate-600">
              Out-of-pocket repair limit{" "}
              <strong className="text-slate-950">${outOfPocket.toLocaleString()}</strong>
            </span>
            <input
              className="mt-2 w-full accent-blue-700"
              max="30000"
              min="2000"
              onChange={(event) => setOutOfPocket(Number(event.target.value))}
              step="1000"
              type="range"
              value={outOfPocket}
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
            <span>
              <span className="block text-[10px] font-bold text-slate-700">
                FEMA grant approval
              </span>
              <span className="text-[8px] text-slate-400">$14,500 anticipated assistance</span>
            </span>
            <button
              aria-checked={femaApproved}
              className={`relative h-6 w-11 rounded-full transition ${femaApproved ? "bg-blue-700" : "bg-slate-300"}`}
              onClick={() => setFemaApproved((value) => !value)}
              role="switch"
              type="button"
            >
              <span
                className={`absolute top-1 size-4 rounded-full bg-white transition-transform ${femaApproved ? "translate-x-6" : "translate-x-1"}`}
              />
            </button>
          </label>
        </div>
      </section>
    </div>
  );
}

function PropertyReport({ onBack }: { onBack: () => void }) {
  const [mobileTab, setMobileTab] = useState<"findings" | "recovery">("findings");
  return (
    <div className="min-h-screen bg-[#f3f5f7] text-slate-900">
      <header className="app-safe-header-sm sticky top-0 z-50 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md md:px-7">
        <div className="mx-auto flex max-w-[1380px] items-center gap-3">
          <button
            className="grid size-9 place-items-center rounded-lg bg-slate-100 text-slate-600"
            onClick={onBack}
            type="button"
            aria-label="Back to area map"
          >
            <Icon size={18}>
              <path
                d="m15 5-7 7 7 7"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </Icon>
          </button>
          <span className="grid size-8 place-items-center rounded-lg bg-[#0f172a] text-white">
            <Icon size={18}>
              <path
                d="M4 18 9.1 6.8a1 1 0 0 1 1.82 0L16 18M6.3 13h7.4M17.8 7.5 20 12h-4.4"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.3"
              />
            </Icon>
          </span>
          <div>
            <p className="text-[12px] font-bold text-slate-950">Aftermath Property Report</p>
            <p className="text-[8px] font-semibold text-slate-400">AM-2841 · Updated 4 min ago</p>
          </div>
          <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-bold text-emerald-700 sm:flex">
            <Icon size={12}>
              <path
                d="m4 7 2.5 2.5L11 5"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </Icon>
            Identity + address verified
          </span>
        </div>
      </header>

      <div className="bg-[#991b1b] px-4 py-2.5 text-white">
        <div className="mx-auto flex max-w-[1380px] items-center gap-2.5">
          <Icon size={17}>
            <path
              d="M12 8v5M12 16.5v.1M10.4 3.7 2.7 17a1.8 1.8 0 0 0 1.56 2.7h15.48A1.8 1.8 0 0 0 21.3 17L13.6 3.7a1.85 1.85 0 0 0-3.2 0Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.9"
            />
          </Icon>
          <p className="text-[10px] font-semibold">
            <strong>Life-safety risk remains active:</strong> Do not enter the attic or damaged east
            rooms.
          </p>
          <a
            className="ml-auto shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-[9px] font-extrabold text-red-800"
            href="tel:911"
          >
            Call 911
          </a>
        </div>
      </div>

      <main className="mx-auto max-w-[1380px] p-3 md:p-5 lg:p-6">
        <section className="relative h-[250px] overflow-hidden rounded-2xl bg-slate-900 shadow-lg md:h-[290px]">
          <img
            alt="Verified property exterior showing storm damage"
            className="h-full w-full object-cover opacity-75"
            src={propertyPhoto}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white md:p-7">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-red-500 px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.09em]">
                Severe damage
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1.5 text-[9px] font-bold text-emerald-100 ring-1 ring-inset ring-emerald-300/30 backdrop-blur-md">
                <Icon size={12}>
                  <path
                    d="m4 7 2.5 2.5L11 5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </Icon>
                Verified address
              </span>
            </div>
            <h1 className="mt-3 text-[24px] font-bold tracking-[-0.035em] md:text-[31px]">
              1842 Bayview Avenue
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-300">
              <PinIcon size={13} />
              Fort Myers, FL 33916 · Lee County
            </p>
          </div>
          <div className="absolute right-5 top-5 hidden rounded-xl border border-white/20 bg-black/35 px-3 py-2 text-right text-white backdrop-blur-md md:block">
            <p className="text-[8px] uppercase tracking-[0.1em] text-slate-300">
              Estimated repair range
            </p>
            <p className="mt-0.5 text-[17px] font-bold">$67.4k–$84.6k</p>
          </div>
        </section>

        <div className="app-safe-sticky-tabs sticky top-[62px] z-40 mt-3 flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm md:hidden">
          <button
            className={`flex-1 rounded-lg py-2 text-[10px] font-bold ${mobileTab === "findings" ? "bg-slate-900 text-white" : "text-slate-500"}`}
            onClick={() => setMobileTab("findings")}
            type="button"
          >
            Damage Report
          </button>
          <button
            className={`flex-1 rounded-lg py-2 text-[10px] font-bold ${mobileTab === "recovery" ? "bg-slate-900 text-white" : "text-slate-500"}`}
            onClick={() => setMobileTab("recovery")}
            type="button"
          >
            Recovery Navigator
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.38fr)_minmax(360px,.82fr)]">
          <div className={mobileTab === "findings" ? "block" : "hidden lg:block"}>
            <FindingsPanel />
          </div>
          <div className={mobileTab === "recovery" ? "block" : "hidden lg:block"}>
            <RecoveryNavigator />
          </div>
        </div>
      </main>
    </div>
  );
}

function AffectedPersonView({
  address,
  onAddressChange,
  onBack,
  onContinue,
}: {
  address: string;
  onAddressChange: (address: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#e9edf2]">
      <VerificationPanel
        address={address}
        onAddressChange={onAddressChange}
        onBack={onBack}
        onContinue={onContinue}
      />
    </div>
  );
}

function AreaMapView({
  address,
  onBack,
  onOpenReport,
}: {
  address: string;
  onBack: () => void;
  onOpenReport: () => void;
}) {
  // Geocode the verified address; fall back to the default centre if unavailable.
  const [residence, setResidence] = useState<LngLat>(DEFAULT_CENTER);
  useEffect(() => {
    const controller = new AbortController();
    geocodeAddress(address, controller.signal).then((point) => point && setResidence(point));
    return () => controller.abort();
  }, [address]);

  const highlights: BuildingHighlight[] = [
    { id: "residence", lng: residence.lng, lat: residence.lat, status: "verified" },
  ];
  const areaFill = useMemo(
    () => ({
      center: residence,
      radiusMeters: 280,
      statusFor: demoStatusFor(residence, 280),
    }),
    [residence],
  );
  const [affectedCount, setAffectedCount] = useState(0);
  const markers: MapMarkerSpec[] = [
    {
      id: "residence",
      lng: residence.lng,
      lat: residence.lat,
      status: "verified",
      variant: "residence",
      label: "Your residence",
      ariaLabel: "Open full verified property report",
    },
  ];

  return (
    <div className="relative h-[100dvh] min-h-[650px] overflow-hidden bg-[#111b25]">
      <MapboxDamageMap
        areaFill={areaFill}
        center={residence}
        highlights={highlights}
        onAreaStats={(c) => setAffectedCount(c.minor + c.moderate + c.severe)}
        markers={markers}
        onSelect={(id) => id === "residence" && onOpenReport()}
      />

      <header className="app-safe-header-sm absolute inset-x-0 top-0 z-40 border-b border-white/10 bg-[#0f172a]/94 px-3 pb-3 text-white shadow-xl backdrop-blur-md md:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <button
            aria-label="Back to verification"
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
            onClick={onBack}
            type="button"
          >
            <Icon size={18}>
              <path
                d="m15 5-7 7 7 7"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </Icon>
          </button>
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-blue-300">
              Verified area report
            </p>
            <h1 className="truncate text-[14px] font-bold">{address}</h1>
          </div>
          <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[9px] font-bold text-emerald-300 ring-1 ring-inset ring-emerald-300/20 sm:flex">
            <Icon size={12}>
              <path
                d="m4 7 2.5 2.5L11 5"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </Icon>
            Address verified
          </span>
        </div>
      </header>

      <div className="absolute inset-x-3 top-[calc(7.25rem+var(--prototype-safe-top))] z-30 mx-auto max-w-6xl md:inset-x-6 md:top-24">
        <div className="flex items-center gap-2 rounded-xl border border-red-300/20 bg-[#451f24]/94 px-3 py-2.5 text-white shadow-xl backdrop-blur-md">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-red-500/20 text-red-300">
            <Icon size={16}>
              <path
                d="M12 8v5M12 16.5v.1M10.4 3.7 2.7 17a1.8 1.8 0 0 0 1.56 2.7h15.48A1.8 1.8 0 0 0 21.3 17L13.6 3.7a1.85 1.85 0 0 0-3.2 0Z"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </Icon>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-red-300">
              National Weather Service
            </p>
            <p className="truncate text-[10px] font-semibold">
              Flash Flood Warning · Active until 8:45 PM
            </p>
          </div>
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-red-400" />
        </div>
      </div>

      <aside className="absolute bottom-8 left-3 right-3 z-30 mx-auto max-w-6xl overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_15px_45px_rgba(0,0,0,.38)] md:bottom-10 md:left-6 md:right-6">
        <div className="relative grid gap-3 p-3.5 md:grid-cols-[1fr_auto] md:items-center md:p-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-[9px] font-bold text-red-700">
                {affectedCount} affected buildings nearby
              </span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-bold text-emerald-700">
                OpenFEMA verified
              </span>
            </div>
            <h2 className="mt-2 text-[13px] font-bold text-slate-950">
              Aerial building assessment
            </h2>
            <p className="mt-1 text-[10px] font-medium leading-relaxed text-slate-700">
              Colour-coded 3D buildings show assessed structures nearby.
              Neighbor identities and exact report details remain concealed.
            </p>
            <DamageLegend className="mt-2 flex flex-wrap gap-x-3 text-slate-600" />
          </div>
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-[10px] font-bold text-white shadow-lg transition hover:bg-blue-800 md:w-auto"
            onClick={onOpenReport}
            type="button"
          >
            Open full property report
            <Icon size={15}>
              <path
                d="m9 6 6 6-6 6"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </Icon>
          </button>
        </div>
      </aside>
    </div>
  );
}

function HomeScreen({
  onAffected,
  onReporter,
}: {
  onAffected: () => void;
  onReporter: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#eef1f5] text-slate-950">
      <header className="app-safe-header border-b border-white/10 bg-[#0f172a] px-4 py-4 text-white md:px-7">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-white text-[#0f172a]">
              <Icon size={21}>
                <path
                  d="M4 18 9.1 6.8a1 1 0 0 1 1.82 0L16 18M6.3 13h7.4M17.8 7.5 20 12h-4.4"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.3"
                />
              </Icon>
            </span>
            <div>
              <p className="text-[19px] font-bold tracking-[-0.03em]">Aftermath</p>
              <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Disaster response network
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1.5 text-[9px] font-bold text-emerald-300 ring-1 ring-inset ring-emerald-300/20">
            <span className="size-1.5 rounded-full bg-emerald-300" />
            Systems online
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-7 md:px-7 md:py-10">
        <section>
          <div className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">
              Choose your path
            </p>
            <h2 className="mt-1 text-[20px] font-bold tracking-[-0.025em] text-slate-950">
              How are you using Aftermath today?
            </h2>
          </div>

          <aside className="mb-3 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-950">
            <span className="mt-0.5 shrink-0 text-red-700">
              <Icon size={17}>
                <path
                  d="M12 8v5M12 16.5v.1M10.4 3.7 2.7 17a1.8 1.8 0 0 0 1.56 2.7h15.48A1.8 1.8 0 0 0 21.3 17L13.6 3.7a1.85 1.85 0 0 0-3.2 0Z"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              </Icon>
            </span>
            <p className="text-[10px] leading-relaxed">
              <strong>Immediate danger?</strong> Aftermath does not replace emergency services. Call{" "}
              <a className="font-extrabold underline underline-offset-2" href="tel:911">
                911
              </a>{" "}
              for active life-safety threats.
            </p>
          </aside>

          <div className="grid gap-3 md:grid-cols-2">
            <button
              className="group relative overflow-hidden rounded-[24px] bg-[#0f172a] p-5 text-left text-white shadow-[0_12px_30px_rgba(15,23,42,.14)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(15,23,42,.2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 md:p-6"
              onClick={onReporter}
              type="button"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-12 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-950/20">
                  <Icon size={25}>
                    <path
                      d="M4 8.5h3l1.2-2h7.6l1.2 2h3v10H4v-10Z"
                      stroke="currentColor"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    />
                    <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.8" />
                  </Icon>
                </span>
                <span className="grid size-9 place-items-center rounded-full bg-white/10 text-slate-300 transition group-hover:bg-white group-hover:text-slate-950">
                  <Icon size={18}>
                    <path
                      d="m9 6 6 6-6 6"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </Icon>
                </span>
              </div>
              <p className="mt-5 text-[9px] font-bold uppercase tracking-[0.13em] text-blue-300">
                Reporter view
              </p>
              <h3 className="mt-1 text-[21px] font-bold tracking-[-0.025em]">
                I&apos;m documenting damage
              </h3>
              <p className="mt-2 max-w-md text-[11px] leading-relaxed text-slate-400">
                Capture field evidence, flag urgent hazards, and manage properties you have filmed.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["Field capture", "AI assessment", "My submissions"].map((item) => (
                  <span
                    className="rounded-lg bg-white/7 px-2.5 py-1.5 text-[8px] font-semibold text-slate-300 ring-1 ring-inset ring-white/10"
                    key={item}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </button>

            <button
              className="group relative overflow-hidden rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-[0_12px_30px_rgba(15,23,42,.07)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_38px_rgba(15,23,42,.11)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 md:p-6"
              onClick={onAffected}
              type="button"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100">
                  <Icon size={25}>
                    <path
                      d="M4 11.5 12 5l8 6.5V20H4v-8.5Z"
                      stroke="currentColor"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    />
                    <path d="M9 20v-6h6v6" stroke="currentColor" strokeWidth="1.8" />
                    <path
                      d="m17 7 1.5-2H21"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="1.8"
                    />
                  </Icon>
                </span>
                <span className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-500 transition group-hover:bg-blue-700 group-hover:text-white">
                  <Icon size={18}>
                    <path
                      d="m9 6 6 6-6 6"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </Icon>
                </span>
              </div>
              <p className="mt-5 text-[9px] font-bold uppercase tracking-[0.13em] text-blue-700">
                Affected person view
              </p>
              <h3 className="mt-1 text-[21px] font-bold tracking-[-0.025em] text-slate-950">
                My home may be affected
              </h3>
              <p className="mt-2 max-w-md text-[11px] leading-relaxed text-slate-500">
                Verify your residence, understand nearby risks, and build a personalized recovery
                plan.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["Private verification", "Area conditions", "Recovery plan"].map((item) => (
                  <span
                    className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[8px] font-semibold text-slate-600"
                    key={item}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<
    "affected" | "areaMap" | "capture" | "home" | "report" | "submissions" | "submissionsMap"
  >("home");
  const [residentAddress, setResidentAddress] = useState("1842 Bayview Ave, Fort Myers, FL 33916");
  const [submitted, setSubmitted] = useState(false);
  const [report, setReport] = useState<{ hazard: Hazard; notes: string }>({
    hazard: "Flood",
    notes: "",
  });

  if (screen === "home") {
    return (
      <HomeScreen
        onAffected={() => setScreen("affected")}
        onReporter={() => setScreen("capture")}
      />
    );
  }

  if (screen === "submissions") {
    return (
      <SubmissionsList
        onBack={() => setScreen("capture")}
        onOpenMap={() => setScreen("submissionsMap")}
      />
    );
  }

  if (screen === "submissionsMap") {
    return <SubmissionsMap onBack={() => setScreen("submissions")} />;
  }

  if (screen === "affected") {
    return (
      <AffectedPersonView
        address={residentAddress}
        onAddressChange={setResidentAddress}
        onBack={() => setScreen("home")}
        onContinue={() => setScreen("areaMap")}
      />
    );
  }

  if (screen === "areaMap") {
    return (
      <AreaMapView
        address={residentAddress}
        onBack={() => setScreen("affected")}
        onOpenReport={() => setScreen("report")}
      />
    );
  }

  if (screen === "report") {
    return <PropertyReport onBack={() => setScreen("areaMap")} />;
  }

  return (
    <div className="min-h-screen bg-slate-200 text-slate-900">
      <div className="mx-auto min-h-screen max-w-[480px] bg-[#f5f7fa] shadow-[0_0_45px_rgba(15,23,42,0.12)]">
        <Header
          onAffected={() => setScreen("affected")}
          onHome={() => {
            setSubmitted(false);
            setScreen("home");
          }}
          onSubmissions={() => setScreen("submissions")}
        />
        <main className="px-3.5 py-3.5 pb-8">
          <EmergencyCard />
          {submitted ? (
            <ProcessingView
              hazard={report.hazard}
              notes={report.notes}
              onNewReport={() => setSubmitted(false)}
            />
          ) : (
            <CaptureForm
              onSubmit={(hazard, notes) => {
                setReport({ hazard, notes });
                setSubmitted(true);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
