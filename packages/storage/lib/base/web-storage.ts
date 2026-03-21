import { StorageEnum } from './enums.js';
import type { BaseStorageType, StorageConfigType, ValueOrUpdateType } from './types.js';

const PREFIX = 'handsoff.ext.storage';

export function webStorageKey(storageEnum: StorageEnum, key: string): string {
  return `${PREFIX}:${storageEnum}:${key}`;
}

/**
 * True when chrome.storage has the given area (extension context).
 */
export function isChromeStorageAreaAvailable(storageEnum: StorageEnum): boolean {
  const c = globalThis.chrome as typeof chrome | undefined;
  if (!c?.storage) return false;
  const area = (c.storage as Record<string, { get?: unknown }>)[storageEnum];
  return !!area && typeof area.get === 'function';
}

const updateCache = async <D>(valueOrUpdate: ValueOrUpdateType<D>, cache: D | null): Promise<D> => {
  const isFunction = <T>(value: ValueOrUpdateType<T>): value is (prev: T) => T | Promise<T> =>
    typeof value === 'function';
  const returnsPromise = <T>(func: (prev: T) => T | Promise<T>): func is (prev: T) => Promise<T> =>
    (func as (prev: T) => Promise<T>) instanceof Promise;
  if (isFunction(valueOrUpdate)) {
    if (returnsPromise(valueOrUpdate)) {
      return valueOrUpdate(cache as D);
    }
    return valueOrUpdate(cache as D);
  }
  return valueOrUpdate;
};

/**
 * localStorage-backed storage matching BaseStorageType (for standalone web / tests).
 */
export function createWebStorage<D>(key: string, fallback: D, config?: StorageConfigType<D>): BaseStorageType<D> {
  const storageEnum = config?.storageEnum ?? StorageEnum.Local;
  const liveUpdate = config?.liveUpdate ?? false;
  const wKey = webStorageKey(storageEnum, key);

  const serializeToString = (value: D): string => {
    if (config?.serialization?.serialize) {
      return config.serialization.serialize(value);
    }
    return JSON.stringify(value);
  };

  const deserializeFromString = (raw: string): D => {
    if (config?.serialization?.deserialize) {
      return config.serialization.deserialize(raw);
    }
    return JSON.parse(raw) as D;
  };

  let cache: D | null = null;
  let initialCache = false;
  let listeners: Array<() => void> = [];

  const readRaw = (): D => {
    if (typeof localStorage === 'undefined') return fallback;
    try {
      const raw = localStorage.getItem(wKey);
      if (raw == null) return fallback;
      return deserializeFromString(raw);
    } catch {
      return fallback;
    }
  };

  const writeRaw = (value: D): void => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(wKey, serializeToString(value));
    } catch (e) {
      console.error('[createWebStorage] Failed to write', wKey, e);
    }
  };

  const _emitChange = () => {
    listeners.forEach(l => l());
  };

  const get = async (): Promise<D> => readRaw();

  const set = async (valueOrUpdate: ValueOrUpdateType<D>) => {
    if (!initialCache) {
      cache = await get();
    }
    cache = await updateCache(valueOrUpdate, cache);
    writeRaw(cache as D);
    _emitChange();
  };

  const subscribe = (listener: () => void) => {
    listeners = [...listeners, listener];
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  };

  const getSnapshot = () => cache;

  void get().then(data => {
    cache = data;
    initialCache = true;
    _emitChange();
  });

  if (liveUpdate && typeof window !== 'undefined') {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== wKey || e.newValue == null) return;
      try {
        const next = deserializeFromString(e.newValue);
        if (JSON.stringify(next) !== JSON.stringify(cache)) {
          cache = next;
          _emitChange();
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('storage', onStorage);
  }

  return { get, set, getSnapshot, subscribe };
}

/** Used for legacy chrome.storage.local blobs like copilot-chat-messages */
export async function getChromeOrWebLocalJsonRecord(key: string): Promise<Record<string, unknown>> {
  const chromeApi = globalThis.chrome as typeof globalThis.chrome | undefined;
  if (isChromeStorageAreaAvailable(StorageEnum.Local)) {
    const r = await chromeApi!.storage!.local.get([key]);
    const v = r[key];
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  }
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(webStorageKey(StorageEnum.Local, key));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function setChromeOrWebLocalJsonRecord(key: string, data: Record<string, unknown>): Promise<void> {
  const chromeApi = globalThis.chrome as typeof globalThis.chrome | undefined;
  if (isChromeStorageAreaAvailable(StorageEnum.Local)) {
    await chromeApi!.storage!.local.set({ [key]: data });
    return;
  }
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(webStorageKey(StorageEnum.Local, key), JSON.stringify(data));
  } catch (e) {
    console.error('[setChromeOrWebLocalJsonRecord] Failed', key, e);
  }
}
