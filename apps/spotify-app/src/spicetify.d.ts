// The parts of the Spicetify global this app uses. Spicetify has no
// published types for these, so add fields here as they're needed.

declare namespace Spicetify {
  const React: typeof import("react");
  function showNotification(
    message: string,
    isError?: boolean,
    ms?: number,
  ): void;

  namespace Player {
    function playUri(uri: string): Promise<void>;
    function pause(): Promise<void>;
  }

  namespace LocalStorage {
    function get(key: string): string | null;
    function set(key: string, value: string): void;
  }

  namespace URI {
    function fromString(uri: string): { type: string };
    const Type: { PLAYLIST: string; PLAYLIST_V2: string };
  }

  namespace ContextMenu {
    class Item {
      constructor(
        name: string,
        onClick: (uris: string[]) => void,
        shouldAdd?: (uris: string[]) => boolean,
        icon?: string,
      );
      register(): void;
    }
  }

  namespace Platform {
    const History: { push(path: string): void };

    type Image = { url: string; width?: number | null };

    type RootlistItem =
      | {
          type: "playlist";
          uri: string;
          name: string;
          images?: Image[];
          owner?: { name?: string; displayName?: string };
          totalLength?: number;
        }
      | { type: "folder"; name: string; items?: RootlistItem[] }
      | { type: string; [key: string]: unknown };

    const RootlistAPI: {
      getContents(): Promise<{ items?: RootlistItem[] }>;
    };

    type PlaylistItem = {
      uri?: string;
      name?: string;
      type?: string;
      isLocal?: boolean;
      artists?: Array<{ name?: string }>;
      album?: { name?: string; images?: Image[] };
      duration?: { milliseconds?: number };
    };

    const PlaylistAPI: {
      getMetadata(uri: string): Promise<{ name?: string; images?: Image[] }>;
      getContents(
        uri: string,
        options?: { limit?: number; offset?: number },
      ): Promise<{ items?: PlaylistItem[]; totalLength?: number }>;
    };
  }
}
