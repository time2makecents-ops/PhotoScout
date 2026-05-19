"use client";

const apertureOptions = ["f/1.4", "f/2", "f/2.8", "f/3.5", "f/4", "f/5.6", "f/8", "f/11", "f/16", "f/22"];
const shutterSpeedOptions = ["1/30", "1/60", "1/125", "1/250", "1/500", "1/1000", "1/2000"];
const isoOptions = ["100", "200", "400", "800", "1600", "3200", "6400"];
const whiteBalanceOptions = ["Auto", "Daylight", "Cloudy", "Shade", "Tungsten", "Fluorescent", "Flash", "Custom"];
const weatherOptions = ["Clear", "Partly Cloudy", "Cloudy", "Overcast", "Hazy", "Fog", "Rain", "Snow", "Windy", "Stormy"];
const seasonOptions = ["Spring", "Summer", "Autumn", "Winter"];
const sunPositionOptions = ["Sunrise", "Morning", "Midday", "Afternoon", "Golden hour", "Sunset", "Blue hour", "Night"];
const cameraDirectionOptions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "Up", "Down", "Unknown"];
const povOptions = ["Eye level", "Low angle", "High angle", "Drone", "Wide establishing", "Detail", "Close-up", "Ground-level", "Tripod", "Handheld"];
const focalLengthOptions = ["14mm", "18mm", "24mm", "35mm", "50mm", "70mm", "85mm", "105mm", "135mm", "200mm"];
const exposureCompOptions = ["-2.0", "-1.7", "-1.3", "-1.0", "-0.7", "-0.3", "0", "+0.3", "+0.7", "+1.0", "+1.3", "+1.7", "+2.0"];

type Props = {
  prefix?: string;
  showLicensing?: boolean;
  includeTakenAt?: boolean;
  showCameraDirection?: boolean;
  title?: string;
};

function fieldId(prefix: string | undefined, suffix: string) {
  return prefix ? `${prefix}-${suffix}` : suffix;
}

export function PhotoMetadataFields({
  prefix,
  showLicensing = true,
  includeTakenAt = true,
  showCameraDirection = true,
  title = "Photo metadata"
}: Props) {
  return (
    <div className="section" style={{ marginTop: "1rem" }}>
      <h3>{title}</h3>
      <div className="field">
        <label htmlFor={fieldId(prefix, "camera_model")}>Camera / phone model</label>
        <input id={fieldId(prefix, "camera_model")} name="camera_model" placeholder="Auto-detected from photo if available" />
      </div>
      <div className="field">
        <label htmlFor={fieldId(prefix, "lens_model")}>Lens model</label>
        <input id={fieldId(prefix, "lens_model")} name="lens_model" placeholder="Manual or EXIF-detected" />
      </div>
      <div className="field">
        <label htmlFor={fieldId(prefix, "focal_length")}>Focal length</label>
        <select id={fieldId(prefix, "focal_length")} name="focal_length" defaultValue="">
          <option value="">Choose a focal length</option>
          {focalLengthOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={fieldId(prefix, "aperture")}>Aperture</label>
        <select id={fieldId(prefix, "aperture")} name="aperture" defaultValue="">
          <option value="">Choose an aperture</option>
          {apertureOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={fieldId(prefix, "shutter_speed")}>Shutter speed</label>
        <select id={fieldId(prefix, "shutter_speed")} name="shutter_speed" defaultValue="">
          <option value="">Choose a shutter speed</option>
          {shutterSpeedOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={fieldId(prefix, "iso_speed")}>ISO / film speed</label>
        <select id={fieldId(prefix, "iso_speed")} name="iso_speed" defaultValue="">
          <option value="">Choose ISO</option>
          {isoOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={fieldId(prefix, "white_balance")}>White balance</label>
        <select id={fieldId(prefix, "white_balance")} name="white_balance" defaultValue="">
          <option value="">Choose white balance</option>
          {whiteBalanceOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={fieldId(prefix, "exposure_compensation")}>Exposure compensation</label>
        <select id={fieldId(prefix, "exposure_compensation")} name="exposure_compensation" defaultValue="">
          <option value="">Choose exposure compensation</option>
          {exposureCompOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      {includeTakenAt ? (
        <div className="field">
          <label htmlFor={fieldId(prefix, "taken_at")}>Date / time taken</label>
          <input id={fieldId(prefix, "taken_at")} name="taken_at" type="datetime-local" />
        </div>
      ) : null}
      <div className="field">
        <label htmlFor={fieldId(prefix, "weather")}>Weather</label>
        <select id={fieldId(prefix, "weather")} name="weather" defaultValue="">
          <option value="">Choose weather</option>
          {weatherOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={fieldId(prefix, "season")}>Season</label>
        <select id={fieldId(prefix, "season")} name="season" defaultValue="">
          <option value="">Choose season</option>
          {seasonOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={fieldId(prefix, "sun_position")}>Sun position</label>
        <select id={fieldId(prefix, "sun_position")} name="sun_position" defaultValue="">
          <option value="">Choose sun position</option>
          {sunPositionOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      {showCameraDirection ? (
        <div className="field">
          <label htmlFor={fieldId(prefix, "camera_direction")}>Compass direction</label>
          <select id={fieldId(prefix, "camera_direction")} name="camera_direction" defaultValue="">
            <option value="">Choose direction</option>
            {cameraDirectionOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor={fieldId(prefix, "point_of_view")}>Point of view</label>
        <select id={fieldId(prefix, "point_of_view")} name="point_of_view" defaultValue="">
          <option value="">Choose POV</option>
          {povOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={fieldId(prefix, "distance_to_subject")}>Distance to subject</label>
        <input id={fieldId(prefix, "distance_to_subject")} name="distance_to_subject" placeholder="30 meters" />
      </div>
      <div className="field">
        <label htmlFor={fieldId(prefix, "notes")}>Shoot notes</label>
        <textarea id={fieldId(prefix, "notes")} name="notes" />
      </div>
      {showLicensing ? (
        <div className="field">
          <label>
            <input type="checkbox" name="licensing_available" /> Licensing available
          </label>
        </div>
      ) : null}
    </div>
  );
}
