import { useCallback, useEffect, useRef, useState } from 'react';
import { readJSON, writeJSON } from './storage';

export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readJSON<T>(key, initial));
  const keyRef = useRef(key);
  keyRef.current = key;

  const set = useCallback((updater: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next =
        typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
      writeJSON(keyRef.current, next);
      return next;
    });
  }, []);

  return [value, set] as const;
}

interface AsyncState<T> {
  data?: T;
  error?: string;
  loading: boolean;
}

/** Ejecuta una promesa con cancelación al desmontar. */
export function useAsync<T>(factory: () => Promise<T>, deps: unknown[]): AsyncState<T> & {
  reload: () => void;
} {
  const [state, setState] = useState<AsyncState<T>>({ loading: true });
  const [nonce, setNonce] = useState(0);
  const factoryRef = useRef(factory);
  factoryRef.current = factory;

  useEffect(() => {
    let alive = true;
    setState((prev) => ({ data: prev.data, loading: true }));
    factoryRef
      .current()
      .then((data) => {
        if (alive) setState({ data, loading: false });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ error: message, loading: false });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { ...state, reload };
}
