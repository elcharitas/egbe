import { getRequest } from '@tanstack/react-start/server';

export function secureOrigin(url: URL) {
  if (url.protocol === 'https:') return true;
  if (
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  ) {
    return false;
  }
  throw new Error('HTTPS is required outside local development.');
}

export function requireSameOrigin() {
  const request = getRequest();
  const origin = new URL(request.url).origin;
  if (
    request.headers.get('origin') !== origin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    throw new Error('This action must come from this site.');
  }
}
