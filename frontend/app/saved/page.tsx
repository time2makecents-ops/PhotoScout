"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  addLocationToBoard,
  assetUrl,
  createBoard,
  deleteBoard,
  getBoards,
  getSavedLocations,
  removeLocationFromBoard,
  removeSavedLocation
} from "@/lib/api";
import { ensureLocalSession } from "@/lib/auth";
import type { Board, Location } from "@/lib/types";

function tileUrl(location: Location, zoom = 14) {
  if (typeof location.latitude !== "number" || typeof location.longitude !== "number") return null;
  const scale = 2 ** zoom;
  const latitudeRadians = (location.latitude * Math.PI) / 180;
  const x = Math.floor(((location.longitude + 180) / 360) * scale);
  const y = Math.floor(((1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2) * scale);
  return `/api/map-tiles/${zoom}/${x}/${y}.png`;
}

function LocationVisual({ location }: { location: Location }) {
  const image = location.images[0];
  const mapImage = tileUrl(location);
  return image ? (
    <img src={assetUrl(image.source_url)} alt={image.title || location.name} />
  ) : mapImage ? (
    <img src={mapImage} alt={`Map near ${location.name}`} />
  ) : (
    <span>PS</span>
  );
}

export default function SavedLocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [view, setView] = useState<"places" | "boards">("places");
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [boardName, setBoardName] = useState("");
  const [boardDescription, setBoardDescription] = useState("");
  const [workingKey, setWorkingKey] = useState("");
  const [status, setStatus] = useState("");

  const selectedBoard = useMemo(
    () => boards.find((board) => board.id === selectedBoardId) || null,
    [boards, selectedBoardId]
  );
  const boardCandidates = useMemo(() => {
    if (!selectedBoard) return [];
    const existingIds = new Set(selectedBoard.locations.map((location) => location.id));
    return locations.filter((location) => !existingIds.has(location.id));
  }, [locations, selectedBoard]);

  useEffect(() => {
    let cancelled = false;
    void ensureLocalSession()
      .then(async (token) => Promise.all([getSavedLocations(token), getBoards(token)]))
      .then(([savedPlaces, savedBoards]) => {
        if (!cancelled) {
          setLocations(savedPlaces);
          setBoards(savedBoards);
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("Saved places and boards could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function replaceBoard(nextBoard: Board) {
    setBoards((current) => current.map((board) => board.id === nextBoard.id ? nextBoard : board));
  }

  async function removeLocation(location: Location) {
    setWorkingKey(`saved-${location.id}`);
    setStatus("");
    try {
      const token = await ensureLocalSession();
      await removeSavedLocation(location.id, token);
      setLocations((current) => current.filter((item) => item.id !== location.id));
      setBoards((current) => current.map((board) => ({
        ...board,
        locations: board.locations.filter((item) => item.id !== location.id)
      })));
      setStatus(`${location.name} removed from saved places and boards.`);
    } catch {
      setStatus("Could not remove that place. Try again.");
    } finally {
      setWorkingKey("");
    }
  }

  async function submitBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = boardName.trim();
    if (name.length < 2) {
      setStatus("Give the board a name with at least two characters.");
      return;
    }
    setWorkingKey("create-board");
    setStatus("");
    try {
      const token = await ensureLocalSession();
      const board = await createBoard({ name, description: boardDescription.trim() }, token);
      setBoards((current) => [board, ...current]);
      setBoardName("");
      setBoardDescription("");
      setShowCreate(false);
      setSelectedBoardId(board.id);
      setStatus(`${board.name} is ready. Add saved places below.`);
    } catch {
      setStatus("Could not create the board. Try again.");
    } finally {
      setWorkingKey("");
    }
  }

  async function addToBoard(location: Location) {
    if (!selectedBoard) return;
    setWorkingKey(`add-${location.id}`);
    setStatus("");
    try {
      const token = await ensureLocalSession();
      const board = await addLocationToBoard(selectedBoard.id, location.id, token);
      replaceBoard(board);
      setStatus(`${location.name} added to ${board.name}.`);
    } catch {
      setStatus("Could not add that place to the board.");
    } finally {
      setWorkingKey("");
    }
  }

  async function removeFromBoard(location: Location) {
    if (!selectedBoard) return;
    setWorkingKey(`board-${location.id}`);
    setStatus("");
    try {
      const token = await ensureLocalSession();
      const board = await removeLocationFromBoard(selectedBoard.id, location.id, token);
      replaceBoard(board);
      setStatus(`${location.name} removed from ${board.name}.`);
    } catch {
      setStatus("Could not remove that place from the board.");
    } finally {
      setWorkingKey("");
    }
  }

  async function removeBoard() {
    if (!selectedBoard || !window.confirm(`Delete ${selectedBoard.name}? Saved places will stay in your list.`)) return;
    setWorkingKey("delete-board");
    setStatus("");
    try {
      const token = await ensureLocalSession();
      await deleteBoard(selectedBoard.id, token);
      setBoards((current) => current.filter((board) => board.id !== selectedBoard.id));
      setSelectedBoardId(null);
      setStatus("Board deleted. Your saved places were not changed.");
    } catch {
      setStatus("Could not delete the board. Try again.");
    } finally {
      setWorkingKey("");
    }
  }

  function showPlaces() {
    setView("places");
    setSelectedBoardId(null);
    setShowCreate(false);
    setStatus("");
  }

  function showBoards() {
    setView("boards");
    setStatus("");
  }

  return (
    <section className="section saved-locations-page">
      <header className="saved-locations-heading">
        <span className="eyebrow">Field notebook</span>
        <h1>Saved</h1>
        <p>Keep locations close, then group the strongest options for a shoot.</p>
      </header>

      <div className="saved-view-switch" role="tablist" aria-label="Saved content">
        <button type="button" role="tab" aria-selected={view === "places"} onClick={showPlaces}>
          Places <span>{locations.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={view === "boards"} onClick={showBoards}>
          Boards <span>{boards.length}</span>
        </button>
      </div>

      {status ? <p className="status" role="status">{status}</p> : null}
      {loading ? <p className="saved-locations-loading">Loading saved work...</p> : null}

      {!loading && view === "places" ? (
        <>
          {locations.length === 0 ? (
            <div className="saved-locations-empty">
              <h2>No saved places yet</h2>
              <p>Open any location and tap "Save place" to keep it here.</p>
              <Link href="/home" className="button">Explore locations</Link>
            </div>
          ) : null}
          <div className="saved-location-list">
            {locations.map((location) => (
              <article className="saved-location-row" key={location.id}>
                <Link href={`/locations/${location.slug}`} className="saved-location-visual" aria-label={`Open ${location.name}`}>
                  <LocationVisual location={location} />
                </Link>
                <div className="saved-location-copy">
                  <span className="eyebrow">{location.visibility} / {location.city || location.region || "Location"}</span>
                  <Link href={`/locations/${location.slug}`}><h2>{location.name}</h2></Link>
                  <p>{location.description}</p>
                  <div className="pill-row">
                    {location.tags.slice(0, 3).map((tag) => <span className="pill" key={tag.id}>{tag.name}</span>)}
                  </div>
                </div>
                <div className="saved-location-actions">
                  <Link href={`/locations/${location.slug}`} className="button secondary">View</Link>
                  <button type="button" className="text-button" disabled={workingKey === `saved-${location.id}`} onClick={() => void removeLocation(location)}>
                    {workingKey === `saved-${location.id}` ? "Removing..." : "Remove"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}

      {!loading && view === "boards" && !selectedBoard ? (
        <div className="boards-index">
          <div className="boards-toolbar">
            <div>
              <h2>Shoot boards</h2>
              <p>Shortlists for a client, project, or scouting day.</p>
            </div>
            <button type="button" className="button" onClick={() => setShowCreate((current) => !current)}>
              {showCreate ? "Cancel" : "New board"}
            </button>
          </div>

          {showCreate ? (
            <form className="board-create-form" onSubmit={submitBoard}>
              <label>
                Board name
                <input value={boardName} onChange={(event) => setBoardName(event.target.value)} maxLength={120} autoFocus placeholder="Fall campaign" />
              </label>
              <label>
                Note <span>optional</span>
                <textarea value={boardDescription} onChange={(event) => setBoardDescription(event.target.value)} maxLength={500} rows={3} placeholder="Exterior options for the client" />
              </label>
              <button type="submit" className="button" disabled={workingKey === "create-board"}>
                {workingKey === "create-board" ? "Creating..." : "Create board"}
              </button>
            </form>
          ) : null}

          {boards.length === 0 && !showCreate ? (
            <div className="saved-locations-empty">
              <h2>No boards yet</h2>
              <p>Create a board when you want to narrow saved places for a specific shoot.</p>
              <button type="button" className="button" onClick={() => setShowCreate(true)}>Create a board</button>
            </div>
          ) : null}

          <div className="board-list">
            {boards.map((board) => (
              <button type="button" className="board-list-row" key={board.id} onClick={() => setSelectedBoardId(board.id)}>
                <span className="board-preview" aria-hidden="true">
                  {board.locations.slice(0, 3).map((location) => (
                    <span key={location.id}>{location.name.slice(0, 1).toUpperCase()}</span>
                  ))}
                  {board.locations.length === 0 ? <span>+</span> : null}
                </span>
                <span className="board-list-copy">
                  <strong>{board.name}</strong>
                  <small>{board.locations.length} {board.locations.length === 1 ? "place" : "places"}</small>
                  {board.description ? <span>{board.description}</span> : null}
                </span>
                <span className="board-arrow" aria-hidden="true">&gt;</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!loading && view === "boards" && selectedBoard ? (
        <div className="board-detail">
          <button type="button" className="board-back" onClick={() => setSelectedBoardId(null)}>&lt; All boards</button>
          <div className="board-detail-heading">
            <div>
              <span className="eyebrow">Shoot board / {selectedBoard.locations.length} places</span>
              <h2>{selectedBoard.name}</h2>
              {selectedBoard.description ? <p>{selectedBoard.description}</p> : null}
            </div>
            <button type="button" className="text-button danger" disabled={workingKey === "delete-board"} onClick={() => void removeBoard()}>
              {workingKey === "delete-board" ? "Deleting..." : "Delete board"}
            </button>
          </div>

          {selectedBoard.locations.length === 0 ? (
            <div className="board-empty-line">
              <h3>This board is empty</h3>
              <p>Add one of your saved places below.</p>
            </div>
          ) : (
            <div className="saved-location-list board-location-list">
              {selectedBoard.locations.map((location) => (
                <article className="saved-location-row" key={location.id}>
                  <Link href={`/locations/${location.slug}`} className="saved-location-visual" aria-label={`Open ${location.name}`}>
                    <LocationVisual location={location} />
                  </Link>
                  <div className="saved-location-copy">
                    <span className="eyebrow">{location.city || location.region || "Location"}</span>
                    <Link href={`/locations/${location.slug}`}><h2>{location.name}</h2></Link>
                    <p>{location.description}</p>
                  </div>
                  <div className="saved-location-actions">
                    <Link href={`/locations/${location.slug}`} className="button secondary">View</Link>
                    <button type="button" className="text-button" disabled={workingKey === `board-${location.id}`} onClick={() => void removeFromBoard(location)}>
                      {workingKey === `board-${location.id}` ? "Removing..." : "Remove"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <section className="board-add-places">
            <div>
              <span className="eyebrow">From saved places</span>
              <h3>Add locations</h3>
            </div>
            {locations.length === 0 ? (
              <p>Save a location first, then return here to add it.</p>
            ) : boardCandidates.length === 0 ? (
              <p>Every saved place is already on this board.</p>
            ) : (
              <div className="board-candidate-list">
                {boardCandidates.map((location) => (
                  <div className="board-candidate-row" key={location.id}>
                    <span><strong>{location.name}</strong><small>{location.city || location.region || "Location"}</small></span>
                    <button type="button" className="button secondary" disabled={workingKey === `add-${location.id}`} onClick={() => void addToBoard(location)}>
                      {workingKey === `add-${location.id}` ? "Adding..." : "Add"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}
