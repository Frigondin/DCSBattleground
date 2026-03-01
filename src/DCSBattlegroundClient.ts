import { RawEntityData } from "./types/entity";
import { Geometry } from "./stores/GeometryStore";
import { Player } from "./stores/ServerStore";

export type DCSBattlegroundRadarSnapshotEvent = {
  e: "SESSION_RADAR_SNAPSHOT";
  d: {
    offset: number;
    created: Array<RawEntityData>;
    updated: Array<RawEntityData>;
    deleted: Array<number>;
  };
};

export type DCSBattlegroundInitialStateEvent = {
  e: "SESSION_STATE";
  d: {
    session_id: string;
    offset: number;
    objects?: Array<RawEntityData>;
  };
};

export type DCSBattlegroundInitialSharedGeometryEvent = {
  e: "SESSION_SHARED_GEOMETRY";
  d: {
    Add: Array<Geometry>;
    Recon: Array<Geometry>;
    Delete?: Array<number>;
  };
};

export type DCSBattlegroundInitialDeletedGeometryEvent = {
  e: "SESSION_DELETED_GEOMETRY";
  d: {
    Add: Array<Geometry>;
    Delete: Array<number>;
  };
};

export type DCSBattlegroundPlayerInSlotEvent = {
  e: "SESSION_PLAYERS_IN_SLOT";
  d: {
    Inflight: Array<Player>;
  };
};

export type DCSBattlegroundSessionEvent =
  | DCSBattlegroundRadarSnapshotEvent
  | DCSBattlegroundInitialStateEvent
  | DCSBattlegroundInitialSharedGeometryEvent
  | DCSBattlegroundPlayerInSlotEvent;

export class DCSBattlegroundClient {
  private url: string;
  private eventSource: EventSource | null;

  constructor(url: string) {
    this.url = url;
    this.eventSource = null;
  }

  close() {
    this.eventSource?.close();
  }

  run(
    onEvent: (event: DCSBattlegroundSessionEvent) => void,
    callbacks?: {
      onOpen?: () => void;
      onError?: () => void;
    }
  ) {
	
    this.eventSource = new EventSource(this.url);
    this.eventSource.onopen = () => {
      callbacks?.onOpen?.();
    };
    this.eventSource.onmessage = (event) => {
      const dcsbattlegroundEvent = JSON.parse(event.data) as DCSBattlegroundSessionEvent;
      onEvent(dcsbattlegroundEvent);
    };
    this.eventSource.onerror = () => {
      console.error(
        "[DCSBattlegroundClient] event source error",
      );
      callbacks?.onError?.();
    };
  }
}
