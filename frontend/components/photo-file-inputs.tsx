"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  idPrefix: string;
  selectedFile: File | null;
  onSelect: (file: File | null) => void;
};

export function PhotoFileInputs({ idPrefix, selectedFile, onSelect }: Props) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const deviceInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedSource, setSelectedSource] = useState<"camera" | "device" | null>(null);

  useEffect(() => {
    if (selectedFile) {
      return;
    }
    setSelectedSource(null);
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
    if (deviceInputRef.current) {
      deviceInputRef.current.value = "";
    }
  }, [selectedFile]);

  function selectFile(source: "camera" | "device", file: File | null) {
    onSelect(file);
    setSelectedSource(file ? source : null);
    const otherInput = source === "camera" ? deviceInputRef.current : cameraInputRef.current;
    if (otherInput) {
      otherInput.value = "";
    }
  }

  return (
    <div className="field">
      <label>Photo source</label>
      <div className="panel-grid">
        <div className="field">
          <label htmlFor={`${idPrefix}-camera-file`}>Take photo with camera</label>
          <input
            ref={cameraInputRef}
            id={`${idPrefix}-camera-file`}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => selectFile("camera", event.target.files?.[0] ?? null)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-device-file`}>Choose photo from device</label>
          <input
            ref={deviceInputRef}
            id={`${idPrefix}-device-file`}
            type="file"
            accept="image/*"
            onChange={(event) => selectFile("device", event.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      <p className="subtle">
        Selected source: {selectedSource === "camera" ? "Camera" : selectedSource === "device" ? "Device library" : "None"}
      </p>
      <p className="subtle">
        Selected file: {selectedFile ? selectedFile.name : "None selected"}
      </p>
    </div>
  );
}
