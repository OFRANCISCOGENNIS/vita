'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from './api';

/** Estado padrão de dados: loading (skeleton), erro (com retry) e sucesso. */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : 'Falha de conexão com a API'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => load(), [load]);

  return { data, loading, error, retry: load, setData };
}
