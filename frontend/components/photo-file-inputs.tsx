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
  const [selectionError, setSelectionError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [selectedFile]);

  function selectFile(source: "camera" | "device", file: File | null) {
    if (!file) {
      onSelect(null);
      setSelectedSource(null);
      return;
    }
    const isSupportedType = ["image/jpeg", "image/png", "image/webp"].includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!isSupportedType) {
      onSelect(null);
      setSelectedSource(null);
      setSelectionError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      onSelect(null);
      setSelectedSource(null);
      setSelectionError("Choose an image smaller than 10 MB.");
      return;
    }
    onSelect(file);
    setSelectedSource(source);
    setSelectionError("");
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
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
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
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
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
      {selectedFile ? <p className="subtle">Ready to upload: {(selectedFile.size / 1024 / 1024).toFixed(1)} MB</p> : null}
      {previewUrl ? <img className="upload-preview" src={previewUrl} alt="Selected upload preview" /> : null}
      {selectionError ? <p className="status" role="alert">{selectionError}</p> : null}
    </div>
  );
}
