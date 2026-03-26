import build from "pino-abstract-transport";
import pretty from "pino-pretty";

const DEFAULT_PRETTY_OPTIONS = {
  colorize: true,
  errorLikeObjectKeys: ["err", "error"],
  ignore: "pid,hostname",
  translateTime: "HH:MM:ss.l",
} satisfies NonNullable<Parameters<typeof pretty>[0]>;

// Keep this transport self-contained so Pino's worker can load it under `tsx watch`
// without depending on TypeScript-only sibling imports.
const LISTEN_MESSAGE_PREFIXES = [
  "Server listening at ",
  "Listening on ",
] as const;

function shouldDropListenLog(
  entry: Record<string, unknown>,
  hasSeenListenMessage: boolean,
): boolean {
  const message = entry.msg;
  if (
    typeof message !== "string" ||
    !LISTEN_MESSAGE_PREFIXES.some((prefix) => message.startsWith(prefix))
  ) {
    return false;
  }

  return hasSeenListenMessage;
}

export default async function createDevPrettyTransport(
  options: NonNullable<Parameters<typeof pretty>[0]> = {},
) {
  return build(async function (source) {
    let hasSeenListenMessage = false;
    const prettyStream = pretty({
      ...DEFAULT_PRETTY_OPTIONS,
      ...options,
    });

    for await (const entry of source) {
      if (
        shouldDropListenLog(
          entry as Record<string, unknown>,
          hasSeenListenMessage,
        )
      ) {
        continue;
      }

      if (
        typeof (entry as Record<string, unknown>).msg === "string" &&
        LISTEN_MESSAGE_PREFIXES.some((prefix) =>
          ((entry as Record<string, unknown>).msg as string).startsWith(prefix),
        )
      ) {
        hasSeenListenMessage = true;
      }

      prettyStream.write(`${JSON.stringify(entry)}\n`);
    }

    prettyStream.end();
  });
}
