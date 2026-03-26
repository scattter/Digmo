export interface DevLogFilterState {
  hasSeenListenMessage: boolean;
}

export interface DevLogEntry {
  msg?: unknown;
  [key: string]: unknown;
}

const LISTEN_MESSAGE_PREFIXES = [
  "Server listening at ",
  "Listening on ",
] as const;

export function createDevLogFilterState(): DevLogFilterState {
  return {
    hasSeenListenMessage: false,
  };
}

function isListenMessage(message: unknown): boolean {
  return (
    typeof message === "string" &&
    LISTEN_MESSAGE_PREFIXES.some((prefix) => message.startsWith(prefix))
  );
}

export function shouldDropDevLogEntry(
  entry: DevLogEntry,
  state: DevLogFilterState,
): boolean {
  if (!isListenMessage(entry.msg)) {
    return false;
  }

  if (state.hasSeenListenMessage) {
    return true;
  }

  state.hasSeenListenMessage = true;
  return false;
}
