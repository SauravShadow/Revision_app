'use client';
import { useCallback, useEffect, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import type { MembershipSummary } from '@revision-app/shared';
import {
  fetchMemberships, createOrganisation, joinWithCode, createGroup,
  listGroups, createInviteCode, assignHead, leaveGroup,
} from '@/lib/orgs/client';

// Role pill using the semantic palette — admin=accent, head=annotation, member=muted.
function RoleBadge({ role }: { role: string }) {
  const cls = role === 'admin'
    ? 'border-accent/50 bg-accent/10 text-accent'
    : role === 'head'
      ? 'border-annotation/50 bg-annotation/10 text-annotation'
      : 'border-line text-ink-dim';
  return <span className={`dim-chip capitalize ${cls}`}>{role}</span>;
}

// Invite code shown as a copy-to-clipboard chip.
function CopyChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy invite code"
      className="dim-chip flex items-center gap-1.5 text-accent transition hover:border-accent/50"
    >
      <span className="font-mono">{code}</span>
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function AdminPanel({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [groupName, setGroupName] = useState('');
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [headNames, setHeadNames] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    listGroups(orgId).then((r) => { if (!('error' in r)) setGroups(r.groups); });
  }, [orgId]);
  useEffect(refresh, [refresh]);

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const r = await createGroup(orgId, groupName.trim());
    if ('error' in r) setError(r.error);
    else { setGroupName(''); refresh(); }
  }

  async function handleInvite(groupId: string) {
    const r = await createInviteCode(groupId);
    if ('error' in r) setError(r.error);
    else setCodes((c) => ({ ...c, [groupId]: r.code }));
  }

  async function handleAssignHead(e: React.FormEvent, groupId: string) {
    e.preventDefault();
    setError('');
    setNotice('');
    const r = await assignHead(groupId, (headNames[groupId] ?? '').trim());
    if ('error' in r) setError(r.error);
    else setNotice(r.message);
  }

  return (
    <div className="auth-field">
      <span className="auth-label">Manage {orgName}</span>
      <form onSubmit={handleCreateGroup} className="flex gap-2">
        <input
          aria-label={`New group in ${orgName}`}
          className="auth-input"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="New group name"
        />
        <button type="submit" className="auth-btn-ghost" disabled={!groupName.trim()}>Create group</button>
      </form>
      <ul className="mt-2 divide-y divide-line">
        {groups.map((g) => (
          <li key={g.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-ink">{g.name}</span>
              <div className="flex items-center gap-2">
                {codes[g.id] && <CopyChip code={codes[g.id]} />}
                <button type="button" className="auth-btn-ghost !px-2.5 !py-1 text-xs" onClick={() => handleInvite(g.id)}>New invite code</button>
              </div>
            </div>
            <form onSubmit={(e) => handleAssignHead(e, g.id)} className="mt-2 flex gap-2">
              <input
                aria-label={`Head username for ${g.name}`}
                className="auth-input !py-1.5 text-sm"
                value={headNames[g.id] ?? ''}
                onChange={(e) => setHeadNames((h) => ({ ...h, [g.id]: e.target.value }))}
                placeholder="Username to make head"
              />
              <button type="submit" className="auth-btn-ghost !px-2.5 !py-1.5 text-xs" disabled={!(headNames[g.id] ?? '').trim()}>Assign head</button>
            </form>
          </li>
        ))}
      </ul>
      {notice && <p className="auth-subtitle">{notice}</p>}
      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}

export function OrganisationCard() {
  const { session } = useAuth();
  const [memberships, setMemberships] = useState<MembershipSummary[] | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(() => {
    fetchMemberships().then((r) => setMemberships('error' in r ? [] : r.memberships));
  }, []);
  useEffect(refresh, [refresh]);

  if (!session) return null;

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    const r = await joinWithCode(joinCode.trim().toUpperCase());
    if ('error' in r) setError(r.error);
    else {
      setNotice(`Joined ${r.membership.orgName} / ${r.membership.groupName}`);
      setJoinCode('');
      refresh();
    }
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    const r = await createOrganisation(orgName.trim());
    if ('error' in r) setError(r.error);
    else {
      setNotice(`Created ${r.name} — you are its admin`);
      setOrgName('');
      refresh();
    }
  }

  async function handleLeave(groupId: string) {
    if (!session) return;
    const r = await leaveGroup(groupId, session.userId);
    if ('error' in r) setError(r.error);
    else refresh();
  }

  const admins = memberships?.filter((m) => m.role === 'admin' && m.groupId === null) ?? [];

  return (
    <div className="auth-card">
      <h2 className="auth-title">Organisation</h2>
      {memberships === null ? (
        <p className="auth-subtitle">Loading…</p>
      ) : (
        <>
          {memberships.length > 0 && (
            <ul className="mb-4 divide-y divide-line">
              {memberships.map((m) => (
                <li key={`${m.orgId}:${m.groupId ?? 'org'}`} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0 truncate text-sm text-ink">{m.orgName} / {m.groupName ?? 'Organisation'}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <RoleBadge role={m.role} />
                    {m.groupId && m.role === 'member' && (
                      <button type="button" className="auth-btn-ghost !px-2.5 !py-1 text-xs" onClick={() => handleLeave(m.groupId!)}>Leave</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleJoin} className="auth-field">
            <label className="auth-label" htmlFor="org-join-code">Join with code</label>
            <input
              id="org-join-code"
              className="auth-input"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="e.g. BATCHA-7F3K"
            />
            <button type="submit" className="auth-btn" disabled={!joinCode.trim()}>Join</button>
          </form>
          <form onSubmit={handleCreateOrg} className="auth-field">
            <label className="auth-label" htmlFor="org-create-name">Create organisation</label>
            <input
              id="org-create-name"
              className="auth-input"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Organisation name"
            />
            <button type="submit" className="auth-btn" disabled={orgName.trim().length < 3}>Create</button>
          </form>
          {admins.map((m) => <AdminPanel key={m.orgId} orgId={m.orgId} orgName={m.orgName} />)}
        </>
      )}
      {notice && <p className="auth-subtitle">{notice}</p>}
      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
