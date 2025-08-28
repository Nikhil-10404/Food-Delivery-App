// lib/useUPILink.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPaymentLink, type CreatePaymentLinkParams } from '@/lib/payments';

type UseUPILinkOpts = {
  referenceId: string;
  amount: number;
  name?: string;
  callbackUrl?: string;
  // if true, begin prefetch immediately on mount
  auto?: boolean;
};

export function useUPILink({ referenceId, amount, name, callbackUrl, auto }: UseUPILinkOpts) {
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inflight = useRef<Promise<string | null> | null>(null);
  const lastParams = useRef<string>("");

  const ensure = useCallback(async () => {
    const key = JSON.stringify({ referenceId, amount, name, callbackUrl });
    if (inflight.current && lastParams.current === key) return inflight.current;

    lastParams.current = key;
    setLoading(true);

    inflight.current = (async () => {
      try {
        const link = await createPaymentLink({
          referenceId,
          amount: Number(amount),
          name,
          callbackUrl,
        } as CreatePaymentLinkParams);
        const url = link?.short_url || null;
        setShortUrl(url);
        return url;
      } finally {
        setLoading(false);
      }
    })();

    return inflight.current;
  }, [referenceId, amount, name, callbackUrl]);

  // optional auto prefetch
  useEffect(() => {
    if (auto) void ensure();
  }, [auto, ensure]);

  // reset if referenceId changes
  useEffect(() => {
    setShortUrl(null);
    inflight.current = null;
  }, [referenceId]);

  return { shortUrl, loading, ensure };
}
