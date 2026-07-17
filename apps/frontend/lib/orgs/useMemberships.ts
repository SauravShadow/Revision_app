'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import type { MembershipSummary } from '@revision-app/shared';
import { fetchMemberships } from '@/lib/orgs/client';

export function useMemberships(): { memberships: MembershipSummary[] | null; isCoach: boolean } {
  const { session } = useAuth();
  const [memberships, setMemberships] = useState<MembershipSummary[] | null>(null);

  useEffect(() => {
    if (!session) {
      setMemberships(null);
      return;
    }
    let cancelled = false;
    fetchMemberships().then((r) => {
      if (!cancelled) setMemberships('error' in r ? [] : r.memberships);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  return {
    memberships,
    isCoach: memberships?.some((m) => m.role === 'admin' || m.role === 'head') ?? false,
  };
}
