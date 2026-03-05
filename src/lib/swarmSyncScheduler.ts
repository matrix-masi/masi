import type { MatrixClient } from "matrix-js-sdk";

interface SchedulerEntry {
  client: MatrixClient;
  accountId: string;
  timer: ReturnType<typeof setInterval> | null;
  frequent: boolean;
  lastEventCounts: Map<string, number>;
}

export class SwarmSyncScheduler {
  private entries = new Map<string, SchedulerEntry>();
  private intervalMinutes: number;
  private missedThreshold: number;
  private getVisitedRooms: () => Set<string>;

  constructor(
    intervalMinutes: number,
    missedThreshold: number,
    getVisitedRooms: () => Set<string>,
  ) {
    this.intervalMinutes = intervalMinutes;
    this.missedThreshold = missedThreshold;
    this.getVisitedRooms = getVisitedRooms;
  }

  updateSettings(intervalMinutes: number, missedThreshold: number) {
    const changed = this.intervalMinutes !== intervalMinutes;
    this.intervalMinutes = intervalMinutes;
    this.missedThreshold = missedThreshold;
    if (changed) {
      for (const entry of this.entries.values()) {
        if (!entry.frequent) {
          this.restartSlowSync(entry);
        }
      }
    }
  }

  addSecondaryClient(accountId: string, client: MatrixClient) {
    if (this.entries.has(accountId)) return;
    const entry: SchedulerEntry = {
      client,
      accountId,
      timer: null,
      frequent: false,
      lastEventCounts: new Map(),
    };
    this.entries.set(accountId, entry);
    this.snapshotEventCounts(entry);
    this.startSlowSync(entry);
  }

  removeClient(accountId: string) {
    const entry = this.entries.get(accountId);
    if (!entry) return;
    if (entry.timer) clearInterval(entry.timer);
    try {
      entry.client.stopClient();
    } catch {}
    this.entries.delete(accountId);
  }

  destroy() {
    for (const [id] of this.entries) {
      this.removeClient(id);
    }
  }

  private startSlowSync(entry: SchedulerEntry) {
    entry.client.stopClient();
    entry.frequent = false;
    const ms = this.intervalMinutes * 60_000;
    entry.timer = setInterval(() => this.doSlowCheck(entry), ms);
  }

  private restartSlowSync(entry: SchedulerEntry) {
    if (entry.timer) clearInterval(entry.timer);
    this.startSlowSync(entry);
  }

  private async doSlowCheck(entry: SchedulerEntry) {
    try {
      await entry.client.startClient({ initialSyncLimit: 10 });
      await new Promise((r) => setTimeout(r, 5000));

      const missed = this.countMissedInVisitedRooms(entry);
      if (missed >= this.missedThreshold) {
        this.switchToFrequent(entry);
      } else {
        this.snapshotEventCounts(entry);
        entry.client.stopClient();
      }
    } catch (err) {
      console.warn(
        `Slow sync check failed for ${entry.accountId}:`,
        err,
      );
    }
  }

  private switchToFrequent(entry: SchedulerEntry) {
    if (entry.timer) clearInterval(entry.timer);
    entry.frequent = true;
    const checkInterval = setInterval(() => {
      const missed = this.countMissedInVisitedRooms(entry);
      if (missed < this.missedThreshold) {
        this.snapshotEventCounts(entry);
        clearInterval(checkInterval);
        entry.client.stopClient();
        this.startSlowSync(entry);
      }
    }, 15_000);
    entry.timer = checkInterval;
  }

  private snapshotEventCounts(entry: SchedulerEntry) {
    entry.lastEventCounts.clear();
    const rooms = entry.client.getRooms() || [];
    for (const room of rooms) {
      const events = room.getLiveTimeline().getEvents();
      entry.lastEventCounts.set(room.roomId, events.length);
    }
  }

  private countMissedInVisitedRooms(entry: SchedulerEntry): number {
    const visited = this.getVisitedRooms();
    const rooms = entry.client.getRooms() || [];
    let total = 0;
    for (const room of rooms) {
      if (!visited.has(room.roomId)) continue;
      const events = room.getLiveTimeline().getEvents();
      const prev = entry.lastEventCounts.get(room.roomId) ?? 0;
      const diff = events.length - prev;
      if (diff > 0) total += diff;
    }
    return total;
  }
}
