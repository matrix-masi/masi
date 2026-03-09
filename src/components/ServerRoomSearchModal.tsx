import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Plus } from "lucide-react";
import { useMatrix } from "../contexts/MatrixContext";
import { useSettings } from "../contexts/SettingsContext";
import { joinRoomWithSwarm } from "../lib/swarmRoomJoin";
import {
  fetchJoinMatrixServers,
  fetchPublicRoomsDirect,
  parseRoomLink,
  isNsfwRoom,
  type RoomSearchServer,
} from "../lib/roomSearchServers";
import { Visibility, Preset } from "matrix-js-sdk";

interface PublicRoomEntry {
  room_id: string;
  name?: string;
  topic?: string;
  num_joined_members?: number;
  canonical_alias?: string;
  aliases?: string[];
}

interface ServerRoomSearchModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ServerRoomSearchModal({
  open,
  onClose,
}: ServerRoomSearchModalProps) {
  const { client, allSwarmClients, setCurrentRoomId } = useMatrix();
  const {
    customRoomSearchServers,
    setCustomRoomSearchServers,
    allowNsfwRooms,
  } = useSettings();

  const [joinByLinkInput, setJoinByLinkInput] = useState("");
  const [joinByLinkError, setJoinByLinkError] = useState<string | null>(null);
  const [joinByLinkLoading, setJoinByLinkLoading] = useState(false);

  const [serverList, setServerList] = useState<RoomSearchServer[]>([]);
  const [serversLoading, setServersLoading] = useState(false);
  const [serversError, setServersError] = useState<string | null>(null);
  const [selectedServerHosts, setSelectedServerHosts] = useState<Set<string>>(
    new Set(),
  );
  const [serverSearchQuery, setServerSearchQuery] = useState("");
  const [customServerInput, setCustomServerInput] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<
    (PublicRoomEntry & { _serverHost: string })[]
  >([]);
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(
    new Set(),
  );
  const [joinSelectedLoading, setJoinSelectedLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [createRoomName, setCreateRoomName] = useState("");
  const [createRoomLoading, setCreateRoomLoading] = useState(false);
  const [createRoomError, setCreateRoomError] = useState<string | null>(null);

  const searchResultsRef = useRef<HTMLDivElement>(null);
  const searchGenerationRef = useRef(0);

  const loadServers = useCallback(async () => {
    setServersLoading(true);
    setServersError(null);
    try {
      const list = await fetchJoinMatrixServers();
      setServerList(list);
    } catch (err) {
      setServersError(
        err instanceof Error ? err.message : "Failed to load server list",
      );
    } finally {
      setServersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadServers();
  }, [open, loadServers]);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose]);

  const handleJoinByLink = async () => {
    if (!client || allSwarmClients.length === 0) {
      setJoinByLinkError("Not logged in.");
      return;
    }
    const parsed = parseRoomLink(joinByLinkInput);
    if (!parsed) {
      setJoinByLinkError(
        "Enter a matrix.to link or a room ID (!...) or alias (#...).",
      );
      return;
    }
    setJoinByLinkError(null);
    setJoinByLinkLoading(true);
    try {
      const results = await joinRoomWithSwarm(parsed, allSwarmClients);
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        setJoinByLinkError(failed[0].error ?? "Failed to join room.");
      } else {
        setJoinByLinkInput("");
        setToast("Joined room.");
        setTimeout(() => setToast(null), 2000);
        if (parsed.startsWith("!")) setCurrentRoomId(parsed);
        onClose();
      }
    } catch (err) {
      setJoinByLinkError(
        err instanceof Error ? err.message : "Failed to join room.",
      );
    } finally {
      setJoinByLinkLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!client) {
      setCreateRoomError("Not logged in.");
      return;
    }
    const name = createRoomName.trim();
    if (!name) {
      setCreateRoomError("Enter a room name.");
      return;
    }
    setCreateRoomError(null);
    setCreateRoomLoading(true);
    try {
      const resp = await client.createRoom({
        name,
        visibility: Visibility.Private,
        preset: Preset.PrivateChat,
        invite: [],
      });
      setCreateRoomName("");
      setToast("Room created.");
      setTimeout(() => setToast(null), 2000);
      setCurrentRoomId(resp.room_id);
      onClose();
    } catch (err) {
      setCreateRoomError(
        err instanceof Error ? err.message : "Failed to create room.",
      );
    } finally {
      setCreateRoomLoading(false);
    }
  };

  const toggleServer = (host: string) => {
    setSelectedServerHosts((prev) => {
      const next = new Set(prev);
      if (next.has(host)) next.delete(host);
      else next.add(host);
      return next;
    });
  };

  const addCustomServer = () => {
    const host = customServerInput.trim().toLowerCase();
    if (!host) return;
    if (customRoomSearchServers.includes(host)) {
      setCustomServerInput("");
      return;
    }
    setCustomRoomSearchServers([...customRoomSearchServers, host]);
    setSelectedServerHosts((prev) => new Set(prev).add(host));
    setCustomServerInput("");
  };

  const removeCustomServer = (host: string) => {
    setCustomRoomSearchServers(customRoomSearchServers.filter((h) => h !== host));
    setSelectedServerHosts((prev) => {
      const next = new Set(prev);
      next.delete(host);
      return next;
    });
  };

  /**
   * Fetch public rooms for a single server.
   * Strategy: query the server directly (bypasses federation issues),
   * fall back to SDK `client.publicRooms({ server })` if direct fails.
   */
  const fetchPublicRoomsForServer = async (
    server: string,
    searchTerm: string | undefined,
    limit: number,
  ): Promise<PublicRoomEntry[]> => {
    let rooms: PublicRoomEntry[] | null = null;

    try {
      const data = await fetchPublicRoomsDirect(server, limit);
      rooms = (data.chunk ?? []) as unknown as PublicRoomEntry[];
    } catch { /* direct failed – try via SDK */ }

    if (rooms === null && client) {
      try {
        const filter = searchTerm
          ? { generic_search_term: searchTerm }
          : undefined;
        const opts = filter
          ? { limit, filter, server }
          : { limit, server };
        const res = await client.publicRooms(
          opts as Parameters<typeof client.publicRooms>[0],
        );
        rooms = (res?.chunk ?? []) as PublicRoomEntry[];
      } catch { /* sdk also failed */ }
    }

    if (!rooms) return [];

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      rooms = rooms.filter(
        (r) =>
          r.name?.toLowerCase().includes(q) ||
          r.topic?.toLowerCase().includes(q) ||
          r.canonical_alias?.toLowerCase().includes(q) ||
          r.aliases?.some((a) => a.toLowerCase().includes(q)),
      );
    }

    return rooms;
  };

  const runSearch = async () => {
    if (!client) return;
    const hosts = Array.from(selectedServerHosts);
    if (hosts.length === 0) {
      setSearchError("Select at least one server.");
      return;
    }
    setSearchError(null);
    setSearchLoading(true);
    setSearchResults([]);
    setSelectedRoomIds(new Set());
    const generation = ++searchGenerationRef.current;
    const term = searchQuery.trim() || undefined;

    const mergeResults = (host: string, rooms: PublicRoomEntry[]) => {
      if (searchGenerationRef.current !== generation) return;
      const withServer: (PublicRoomEntry & { _serverHost: string })[] = rooms.map(
        (r) => ({ ...r, _serverHost: host }),
      );
      const toAdd = allowNsfwRooms
        ? withServer
        : withServer.filter((r) => !isNsfwRoom(r));
      if (toAdd.length === 0) return;
      setSearchResults((prev) => {
        if (searchGenerationRef.current !== generation) return prev;
        const seen = new Set(prev.map((r) => r.room_id));
        const added = toAdd.filter((r) => !seen.has(r.room_id));
        return added.length ? [...prev, ...added] : prev;
      });
    };

    const promises = hosts.map((server) =>
      fetchPublicRoomsForServer(server, term, 50),
    );
    hosts.forEach((host, i) => {
      promises[i]
        .then((rooms) => mergeResults(host, rooms))
        .catch(() => {});
    });

    try {
      await Promise.allSettled(promises);
    } finally {
      if (searchGenerationRef.current === generation) {
        setSearchLoading(false);
      }
    }
  };

  const prevResultsLengthRef = useRef(0);
  useEffect(() => {
    const n = searchResults.length;
    if (n > 0 && prevResultsLengthRef.current === 0) {
      searchResultsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
    prevResultsLengthRef.current = n;
  }, [searchResults.length]);

  const toggleRoom = (roomId: string) => {
    setSelectedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  const joinSelectedRooms = async () => {
    if (allSwarmClients.length === 0) return;
    const ids = Array.from(selectedRoomIds);
    if (ids.length === 0) return;
    setJoinSelectedLoading(true);
    setToast(null);
    try {
      for (let i = 0; i < ids.length; i++) {
        const roomId = ids[i];
        setToast(`Joining ${i + 1}/${ids.length}…`);
        await joinRoomWithSwarm(roomId, allSwarmClients);
      }
      setToast(`Joined ${ids.length} room(s).`);
      setTimeout(() => setToast(null), 2000);
      setSelectedRoomIds(new Set());
      setSearchResults((prev) => prev.filter((r) => !ids.includes(r.room_id)));
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Join failed.");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setJoinSelectedLoading(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  const serverListHosts = new Set(serverList.map((s) => s.host));
  const customOnly = customRoomSearchServers.filter(
    (host) => !serverListHosts.has(host),
  );
  const allServers: RoomSearchServer[] = [
    ...serverList,
    ...customOnly.map((host) => ({ id: host, name: host, host })),
  ];
  const serverSearchLower = serverSearchQuery.trim().toLowerCase();
  const filteredServers = serverSearchLower
    ? allServers.filter(
        (s) =>
          s.name.toLowerCase().includes(serverSearchLower) ||
          s.host.toLowerCase().includes(serverSearchLower),
      )
    : allServers;
  const customSet = new Set(customRoomSearchServers);

  const selectTop50Servers = () => {
    const top50 = filteredServers.slice(0, 50).map((s) => s.host);
    setSelectedServerHosts(new Set(top50));
  };

  function latencyPill(ms: number | undefined) {
    const label =
      ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
    const color =
      ms == null
        ? "bg-red-500/20 text-red-600 dark:text-red-400"
        : ms < 200
          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
          : ms < 500
            ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
            : "bg-red-500/20 text-red-600 dark:text-red-400";
    return (
      <span
        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[0.7rem] font-medium ${color}`}
        title={ms == null ? "Unknown / timeout" : `${ms}ms latency`}
      >
        {label}
      </span>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-100 bg-surface">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-[1.1rem] font-semibold">Discover rooms</h2>
          <button
            onClick={onClose}
            title="Close"
            className="rounded-sm p-1.5 text-muted transition-colors hover:text-foreground"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {!client ? (
            <p className="text-[0.9rem] text-muted">
              Log in to search and join rooms.
            </p>
          ) : (
            <>
              <section>
                <h3 className="text-[0.85rem] font-semibold uppercase tracking-wide text-muted mb-2">
                  Join by link
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Paste matrix.to link or room ID / alias"
                    value={joinByLinkInput}
                    onChange={(e) => {
                      setJoinByLinkInput(e.target.value);
                      setJoinByLinkError(null);
                    }}
                    className="flex-1 min-w-0 rounded-sm border border-border bg-background px-3 py-2 text-[0.9rem] text-foreground outline-none focus:border-accent"
                  />
                  <button
                    onClick={handleJoinByLink}
                    disabled={joinByLinkLoading}
                    className="shrink-0 rounded-sm bg-accent px-4 py-2 text-[0.9rem] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                  >
                    {joinByLinkLoading ? "…" : "Join"}
                  </button>
                </div>
                {joinByLinkError && (
                  <p className="mt-1.5 text-[0.8rem] text-danger">
                    {joinByLinkError}
                  </p>
                )}
              </section>

              <section>
                <h3 className="text-[0.85rem] font-semibold uppercase tracking-wide text-muted mb-2">
                  Create new room
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Room name"
                    value={createRoomName}
                    onChange={(e) => {
                      setCreateRoomName(e.target.value);
                      setCreateRoomError(null);
                    }}
                    onKeyDown={(e) =>
                      e.key === "Enter" && (e.preventDefault(), handleCreateRoom())
                    }
                    className="flex-1 min-w-0 rounded-sm border border-border bg-background px-3 py-2 text-[0.9rem] text-foreground outline-none focus:border-accent"
                  />
                  <button
                    onClick={handleCreateRoom}
                    disabled={createRoomLoading || !createRoomName.trim()}
                    className="shrink-0 rounded-sm bg-accent px-4 py-2 text-[0.9rem] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                  >
                    {createRoomLoading ? "…" : "Create"}
                  </button>
                </div>
                {createRoomError && (
                  <p className="mt-1.5 text-[0.8rem] text-danger">
                    {createRoomError}
                  </p>
                )}
              </section>

              <section>
                <h3 className="text-[0.85rem] font-semibold uppercase tracking-wide text-muted mb-2">
                  Servers to search
                </h3>
                {serversLoading ? (
                  <p className="text-[0.85rem] text-muted">Loading servers…</p>
                ) : serversError ? (
                  <p className="text-[0.85rem] text-danger">{serversError}</p>
                ) : (
                  <>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        placeholder="Search servers by name or host"
                        value={serverSearchQuery}
                        onChange={(e) => setServerSearchQuery(e.target.value)}
                        className="flex-1 min-w-0 rounded-sm border border-border bg-background px-3 py-2 text-[0.85rem] text-foreground outline-none focus:border-accent"
                      />
                      <button
                        type="button"
                        onClick={selectTop50Servers}
                        className="shrink-0 rounded-sm border border-border px-3 py-2 text-[0.85rem] transition-colors hover:bg-surface2"
                      >
                        Select top 50
                      </button>
                    </div>
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-surface2 p-2 space-y-1">
                      {filteredServers.map((srv) => (
                        <label
                          key={srv.id}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedServerHosts.has(srv.host)}
                            onChange={() => toggleServer(srv.host)}
                            className="rounded border-border"
                          />
                          {latencyPill(srv.responseTimeMs)}
                          <span className="text-[0.85rem] truncate min-w-0">
                            {srv.name}
                          </span>
                          {customSet.has(srv.host) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                removeCustomServer(srv.host);
                              }}
                              className="ml-auto text-[0.75rem] text-muted hover:text-foreground shrink-0"
                            >
                              Remove
                            </button>
                          )}
                        </label>
                      ))}
                    </div>
                  </>
                )}
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    placeholder="Add custom server (hostname)"
                    value={customServerInput}
                    onChange={(e) => setCustomServerInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCustomServer()}
                    className="flex-1 min-w-0 rounded-sm border border-border bg-background px-3 py-2 text-[0.85rem] text-foreground outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={addCustomServer}
                    className="shrink-0 rounded-sm border border-border px-3 py-2 text-[0.85rem] transition-colors hover:bg-surface2"
                  >
                    <Plus size={16} className="inline" /> Add
                  </button>
                </div>
              </section>

              <section>
                <h3 className="text-[0.85rem] font-semibold uppercase tracking-wide text-muted mb-2">
                  Search directory
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Search term (leave blank to list rooms)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runSearch()}
                    className="flex-1 min-w-0 rounded-sm border border-border bg-background px-3 py-2 text-[0.9rem] text-foreground outline-none focus:border-accent"
                  />
                  <button
                    onClick={runSearch}
                    disabled={searchLoading || selectedServerHosts.size === 0}
                    className="shrink-0 rounded-sm bg-accent px-4 py-2 text-[0.9rem] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                  >
                    {searchLoading ? "…" : "Search"}
                  </button>
                </div>
                {searchError && (
                  <p className="mt-1.5 text-[0.8rem] text-danger">
                    {searchError}
                  </p>
                )}

                {searchResults.length > 0 && (
                  <div ref={searchResultsRef} className="mt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[0.8rem] text-muted">
                        {searchResults.length} room(s)
                      </span>
                      <button
                        onClick={joinSelectedRooms}
                        disabled={
                          joinSelectedLoading ||
                          selectedRoomIds.size === 0
                        }
                        className="rounded-sm bg-accent px-3 py-1.5 text-[0.8rem] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                      >
                        {joinSelectedLoading
                          ? "…"
                          : `Join selected (${selectedRoomIds.size})`}
                      </button>
                    </div>
                    <ul className="max-h-60 overflow-y-auto rounded-lg border border-border bg-surface2 divide-y divide-border">
                      {searchResults.map((room) => (
                        <li key={room.room_id} className="flex items-start gap-2 p-2">
                          <input
                            type="checkbox"
                            checked={selectedRoomIds.has(room.room_id)}
                            onChange={() => toggleRoom(room.room_id)}
                            className="mt-0.5 rounded border-border"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-[0.9rem] font-medium truncate">
                              {room.name || room.canonical_alias || room.room_id}
                            </div>
                            {room.topic && (
                              <div className="text-[0.75rem] text-muted line-clamp-2">
                                {room.topic}
                              </div>
                            )}
                            <div className="text-[0.7rem] text-muted">
                              {room.num_joined_members ?? 0} members ·{" "}
                              {room._serverHost}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            </>
          )}

          {toast && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-surface2 border border-border px-4 py-2 text-[0.85rem] shadow-lg">
              {toast}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
