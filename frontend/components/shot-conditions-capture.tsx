"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  idPrefix: string;
  selectedFile?: File | null;
};

type GpsStatus = "checking" | "ready" | "unavailable" | "denied";
type CompassStatus = "checking" | "ready" | "unavailable" | "permission-needed" | "denied";
type HeadingSource = "sensor" | "manual" | "unavailable";

type ExtendedDeviceOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number | null;
  absolute?: boolean;
};

type IOSDeviceOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

const QUICK_HEADINGS = [
  ["N", 0],
  ["NE", 45],
  ["E", 90],
  ["SE", 135],
  ["S", 180],
  ["SW", 225],
  ["W", 270],
  ["NW", 315]
] as const;
const NON_WEBKIT_COMPASS_OFFSET_DEGREES = 134;
const MAX_TILT_FOR_HEADING_UPDATES = 60;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatLocalDateTime(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function normalizeDegrees(value: number) {
  const normalized = ((value % 360) + 360) % 360;
  return Number(normalized.toFixed(1));
}

function applyCompassCorrection(value: number) {
  return normalizeDegrees(value + NON_WEBKIT_COMPASS_OFFSET_DEGREES);
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function computeTiltCompensatedHeading(alpha: number, beta: number, gamma: number) {
  const x = degreesToRadians(beta);
  const y = degreesToRadians(gamma);
  const z = degreesToRadians(alpha);

  const cX = Math.cos(x);
  const cY = Math.cos(y);
  const cZ = Math.cos(z);
  const sX = Math.sin(x);
  const sY = Math.sin(y);
  const sZ = Math.sin(z);

  const vX = -cZ * sY - sZ * sX * cY;
  const vY = -sZ * sY + cZ * sX * cY;

  if (vX === 0 && vY === 0) {
    return null;
  }

  let headingRadians = Math.atan(vX / vY);
  if (vY < 0) {
    headingRadians += Math.PI;
  } else if (vX < 0) {
    headingRadians += 2 * Math.PI;
  }

  return normalizeDegrees(radiansToDegrees(headingRadians));
}

function getHeadingFromOrientationEvent(orientationEvent: ExtendedDeviceOrientationEvent) {
  if (typeof orientationEvent.webkitCompassHeading === "number" && Number.isFinite(orientationEvent.webkitCompassHeading)) {
    return normalizeDegrees(orientationEvent.webkitCompassHeading);
  }

  if (typeof orientationEvent.alpha !== "number" || !Number.isFinite(orientationEvent.alpha)) {
    return null;
  }

  if (
    typeof orientationEvent.beta === "number" &&
    Number.isFinite(orientationEvent.beta) &&
    typeof orientationEvent.gamma === "number" &&
    Number.isFinite(orientationEvent.gamma)
  ) {
    const compensated = computeTiltCompensatedHeading(
      orientationEvent.alpha,
      orientationEvent.beta,
      orientationEvent.gamma
    );
    if (compensated !== null) {
      return applyCompassCorrection(compensated);
    }
  }

  return applyCompassCorrection(360 - orientationEvent.alpha);
}

function isTiltedTooFarForReliableHeading(orientationEvent: ExtendedDeviceOrientationEvent) {
  const beta = typeof orientationEvent.beta === "number" && Number.isFinite(orientationEvent.beta) ? Math.abs(orientationEvent.beta) : 0;
  const gamma = typeof orientationEvent.gamma === "number" && Number.isFinite(orientationEvent.gamma) ? Math.abs(orientationEvent.gamma) : 0;
  return beta > MAX_TILT_FOR_HEADING_UPDATES || gamma > MAX_TILT_FOR_HEADING_UPDATES;
}

function headingLabelFromDegrees(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "";
  }
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(value / 45) % directions.length;
  return directions[index];
}

function formatDirectionText(value: number | null, label: string, source: HeadingSource) {
  if (value === null && !label) {
    return "";
  }
  const rounded = value === null ? "" : `${Math.round(value)} `;
  const summary = `${rounded}${label}`.trim();
  if (!summary) {
    return "";
  }
  return source === "manual" ? `Manual: ${summary}` : summary;
}

function formatDegrees(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "Not captured";
  }
  return `${Math.round(value)} deg`;
}

function statusText(status: GpsStatus | CompassStatus, type: "gps" | "compass") {
  if (type === "gps") {
    switch (status) {
      case "ready":
        return "GPS saved";
      case "checking":
        return "Checking GPS";
      case "denied":
        return "GPS denied";
      default:
        return "GPS unavailable";
    }
  }

  switch (status) {
    case "ready":
      return "Compass ready";
    case "checking":
      return "Checking compass";
    case "permission-needed":
      return "Compass permission needed";
    case "denied":
      return "Compass denied";
    default:
      return "Compass unavailable";
  }
}

export function ShotConditionsCapture({ idPrefix, selectedFile = null }: Props) {
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("checking");
  const [compassStatus, setCompassStatus] = useState<CompassStatus>("checking");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [capturedAtDevice, setCapturedAtDevice] = useState("");
  const [sensorHeadingDegrees, setSensorHeadingDegrees] = useState<number | null>(null);
  const [manualHeadingInput, setManualHeadingInput] = useState("");
  const [manualOverrideActive, setManualOverrideActive] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const cleanupOrientationRef = useRef<(() => void) | null>(null);
  const previousSelectedFileRef = useRef<File | null>(null);
  const lastStableHeadingRef = useRef<number | null>(null);

  const manualHeadingDegrees = useMemo(() => {
    if (!manualHeadingInput) {
      return null;
    }
    const numeric = Number(manualHeadingInput);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    return normalizeDegrees(numeric);
  }, [manualHeadingInput]);

  const effectiveHeadingDegrees = manualOverrideActive && manualHeadingDegrees !== null ? manualHeadingDegrees : sensorHeadingDegrees;
  const effectiveHeadingLabel = headingLabelFromDegrees(effectiveHeadingDegrees);
  const headingSource: HeadingSource = manualOverrideActive && manualHeadingDegrees !== null ? "manual" : sensorHeadingDegrees !== null ? "sensor" : "unavailable";
  const directionSummary = formatDirectionText(effectiveHeadingDegrees, effectiveHeadingLabel, headingSource);

  useEffect(() => {
    refreshGps();
    initializeCompass();
    return () => {
      cleanupOrientationRef.current?.();
      cleanupOrientationRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (selectedFile && previousSelectedFileRef.current !== selectedFile) {
      lockConditions();
    }
    if (!selectedFile && previousSelectedFileRef.current) {
      setIsLocked(false);
      if (compassStatus !== "permission-needed") {
        startOrientationListener();
      }
    }
    previousSelectedFileRef.current = selectedFile;
  }, [selectedFile, compassStatus]);

  function updateCaptureTime() {
    setCapturedAtDevice(formatLocalDateTime(new Date()));
  }

  function refreshGps() {
    updateCaptureTime();
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsStatus("unavailable");
      return;
    }
    setGpsStatus("checking");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (isLocked) {
          return;
        }
        setLatitude(Number(position.coords.latitude.toFixed(6)));
        setLongitude(Number(position.coords.longitude.toFixed(6)));
        setGpsStatus("ready");
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setGpsStatus("denied");
          return;
        }
        setGpsStatus("unavailable");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }

  function startOrientationListener() {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
      setCompassStatus("unavailable");
      return;
    }

    cleanupOrientationRef.current?.();
    cleanupOrientationRef.current = null;
    setCompassStatus("checking");

    const handleOrientation = (event: Event) => {
      const orientationEvent = event as ExtendedDeviceOrientationEvent;
      const nextHeading = getHeadingFromOrientationEvent(orientationEvent);
      const tooTilted = isTiltedTooFarForReliableHeading(orientationEvent);

      if (isLocked) {
        return;
      }

      if (nextHeading !== null) {
        if (!tooTilted || lastStableHeadingRef.current === null) {
          lastStableHeadingRef.current = nextHeading;
          setSensorHeadingDegrees(nextHeading);
        } else {
          setSensorHeadingDegrees(lastStableHeadingRef.current);
        }
        setCompassStatus("ready");
      } else {
        setCompassStatus("unavailable");
      }
    };

    const useAbsoluteListener = "ondeviceorientationabsolute" in window;
    if (useAbsoluteListener) {
      window.addEventListener("deviceorientationabsolute", handleOrientation, true);
    } else {
      window.addEventListener("deviceorientation", handleOrientation, true);
    }
    cleanupOrientationRef.current = () => {
      if (useAbsoluteListener) {
        window.removeEventListener("deviceorientationabsolute", handleOrientation, true);
      } else {
        window.removeEventListener("deviceorientation", handleOrientation, true);
      }
    };

    window.setTimeout(() => {
      setCompassStatus((current) => (current === "checking" ? "unavailable" : current));
    }, 1500);
  }

  function initializeCompass() {
    if (typeof window === "undefined") {
      return;
    }

    const orientationApi = window.DeviceOrientationEvent as IOSDeviceOrientationEvent | undefined;
    if (!orientationApi) {
      setCompassStatus("unavailable");
      return;
    }

    if (typeof orientationApi.requestPermission === "function") {
      setCompassStatus("permission-needed");
      return;
    }

    startOrientationListener();
  }

  async function enableCompass() {
    updateCaptureTime();
    if (typeof window === "undefined") {
      setCompassStatus("unavailable");
      return;
    }

    const orientationApi = window.DeviceOrientationEvent as IOSDeviceOrientationEvent | undefined;
    if (!orientationApi || typeof orientationApi.requestPermission !== "function") {
      startOrientationListener();
      return;
    }

    try {
      const permission = await orientationApi.requestPermission();
      if (permission === "granted") {
        startOrientationListener();
        return;
      }
      setCompassStatus("denied");
    } catch {
      setCompassStatus("denied");
    }
  }

  function refreshConditions() {
    setIsLocked(false);
    lastStableHeadingRef.current = null;
    refreshGps();
    if (compassStatus !== "permission-needed") {
      startOrientationListener();
    }
  }

  function lockConditions() {
    updateCaptureTime();
    setIsLocked(true);
    cleanupOrientationRef.current?.();
    cleanupOrientationRef.current = null;
  }

  function applyManualHeading(value: number) {
    updateCaptureTime();
    setManualOverrideActive(true);
    setManualHeadingInput(String(value));
  }

  function onManualHeadingChange(nextValue: string) {
    const digitsOnly = nextValue.replace(/[^\d]/g, "").slice(0, 3);
    if (!digitsOnly) {
      setManualHeadingInput("");
      setManualOverrideActive(false);
      return;
    }
    const numeric = Math.max(0, Math.min(359, Number(digitsOnly)));
    setManualHeadingInput(String(numeric));
    setManualOverrideActive(true);
    updateCaptureTime();
  }

  return (
    <div className="section" style={{ marginTop: "1rem" }}>
      <h3>Shot conditions</h3>
      <p className="subtle">Capture the basic local conditions for this shot. You can still upload if phone sensors are unavailable.</p>

      <div className="pill-row">
        <span className="pill">{statusText(gpsStatus, "gps")}</span>
        <span className="pill">{statusText(compassStatus, "compass")}</span>
        {isLocked ? <span className="pill">Frozen at photo selection</span> : null}
        {headingSource === "sensor" ? <span className="pill">Estimated direction</span> : null}
        {headingSource === "manual" ? <span className="pill">Manual direction</span> : null}
      </div>

      <div className="field">
        <label>Capture shot direction</label>
        <div className="inline">
          <button type="button" className="secondary" onClick={refreshConditions}>
            Refresh conditions
          </button>
          {compassStatus === "permission-needed" ? (
            <button type="button" className="secondary" onClick={enableCompass}>
              Enable compass
            </button>
          ) : null}
        </div>
      </div>

      <div className="field">
        <label htmlFor={`${idPrefix}-manual-heading`}>Manual heading override</label>
        <input
          id={`${idPrefix}-manual-heading`}
          inputMode="numeric"
          placeholder="0-359"
          value={manualHeadingInput}
          onChange={(event) => onManualHeadingChange(event.target.value)}
        />
        <p className="subtle">Use this if the compass is unavailable or the estimated direction looks wrong.</p>
      </div>

      <div className="pill-row">
        {QUICK_HEADINGS.map(([label, value]) => (
          <button key={label} type="button" className="secondary" onClick={() => applyManualHeading(value)}>
            {label}
          </button>
        ))}
      </div>

      <div className="panel" style={{ marginTop: "0.9rem" }}>
        <p className="subtle">Facing {directionSummary || "Not captured yet"}</p>
        <p className="subtle">GPS: {latitude !== null && longitude !== null ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : "Not captured"}</p>
        <p className="subtle">Device timestamp: {capturedAtDevice ? capturedAtDevice.replace("T", " ") : "Not captured"}</p>
        <p className="subtle">Heading: {formatDegrees(effectiveHeadingDegrees)} {effectiveHeadingLabel ? `(${effectiveHeadingLabel})` : ""}</p>
      </div>

      <input type="hidden" name="gps_latitude" value={latitude !== null ? latitude.toFixed(6) : ""} />
      <input type="hidden" name="gps_longitude" value={longitude !== null ? longitude.toFixed(6) : ""} />
      <input type="hidden" name="captured_at_device" value={capturedAtDevice} />
      <input type="hidden" name="camera_heading_degrees" value={effectiveHeadingDegrees !== null ? String(effectiveHeadingDegrees) : ""} />
      <input type="hidden" name="camera_heading_label" value={effectiveHeadingLabel} />
      <input type="hidden" name="camera_direction" value={directionSummary} />
      <input type="hidden" name="camera_pitch_degrees" value="" />
      <input type="hidden" name="camera_roll_degrees" value="" />
      <input type="hidden" name="heading_source" value={headingSource} />
    </div>
  );
}
