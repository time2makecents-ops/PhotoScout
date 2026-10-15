"use client";

import { useState } from "react";

type Props = {
  idPrefix: string;
  sourceType?: string;
  onSourceTypeChange?: (sourceType: string) => void;
};

export function ImageSourceFields({ idPrefix, sourceType: controlledSourceType, onSourceTypeChange }: Props) {
  const [uncontrolledSourceType, setUncontrolledSourceType] = useState("original_edited");
  const sourceType = controlledSourceType ?? uncontrolledSourceType;
  const isReference = sourceType === "royalty_free_reference";

  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-source-type`}>Image type</label>
        <select
          id={`${idPrefix}-source-type`}
          name="image_source_type"
          value={sourceType}
          onChange={(event) => {
            setUncontrolledSourceType(event.target.value);
            onSourceTypeChange?.(event.target.value);
          }}
        >
          <option value="original_raw">My original RAW capture (exported image)</option>
          <option value="original_edited">My original edited image</option>
          <option value="royalty_free_reference">Royalty-free reference image</option>
        </select>
        <p className="subtle">Reference images are labeled and cannot be offered for licensing.</p>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-source-note`}>Source / usage note{isReference ? "" : " (optional)"}</label>
        <textarea
          id={`${idPrefix}-source-note`}
          name="source_note"
          required={isReference}
          placeholder={isReference ? "Credit, source URL, or licence note" : "Editing notes, context, or provenance"}
        />
      </div>
    </>
  );
}
