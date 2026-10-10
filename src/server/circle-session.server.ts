import { getRequest, setResponseHeader } from '@tanstack/react-start/server';
import { currentAccount, optionalAccount } from './google';
import { requireSameOrigin, secureOrigin } from './request-security';

export function circleRequestSecurity() {
  setResponseHeader('Cache-Control', 'private, no-store');
  const request = getRequest();
  if (request.method === 'POST') requireSameOrigin();
  return secureOrigin(new URL(request.url));
}

export async function optionalOwner() {
  return (await optionalAccount())?.id ?? null;
}

export async function currentOwner() {
  return (await currentAccount()).id;
}

export function participant(owner: string) {
  return owner.slice(0, 16);
}

export function alias(owner: string) {
  return `Learner ${owner.slice(0, 6)}`;
}
