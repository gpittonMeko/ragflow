import { Authorization } from '@/constants/authorization';
import { IKnowledge } from '@/interfaces/database/knowledge';
import api from '@/utils/api';
import { getAuthorization } from '@/utils/authorization-util';
import request from '@/utils/request';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

/** Stesso criterio di `getRagflowToken` in shared-hooks + `getAuthorization` (query ?auth=). */
function pickAuthHeader(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const fromUtil = getAuthorization();
  if (fromUtil) return fromUtil;
  try {
    const access = localStorage.getItem('access_token');
    if (access) return access;
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Mappa id → nome da POST /v1/kb/list; header esplicito perché `getAuthorization()` non legge sempre `access_token`. */
export function useKbDisplayNames(kbIds: string[]): Map<string, string> {
  const sortedKey = useMemo(() => [...kbIds].sort().join(','), [kbIds]);
  const authKey = pickAuthHeader() ?? '';

  const { data } = useQuery({
    queryKey: ['directChatKbDisplayNames', sortedKey, authKey],
    enabled: kbIds.length > 0 && !!authKey,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const hdr = pickAuthHeader();
      if (!hdr) return new Map<string, string>();
      try {
        const { data: res } = await request.post(api.kb_list, {
          data: {},
          params: { page: 1, page_size: 500 },
          headers: { [Authorization]: hdr },
          /** Evita removeAll + redirectToLogin: kb/list è solo arricchimento UI su embed. */
          silentAuthFailure: true,
        });
        const kbs = (res?.data?.kbs ?? []) as IKnowledge[];
        const map = new Map<string, string>();
        for (const kb of kbs) {
          if (kb?.id && kb?.name) map.set(kb.id, kb.name);
        }
        return map;
      } catch {
        return new Map<string, string>();
      }
    },
  });

  return data ?? new Map<string, string>();
}
