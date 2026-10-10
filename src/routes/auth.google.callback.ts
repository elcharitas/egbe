import { createFileRoute } from '@tanstack/react-router';
import { authResponse, finishGoogle } from '../server/google';

export const Route = createFileRoute('/auth/google/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await finishGoogle(request);
        } catch {
          return authResponse(new URL(request.url), 'failure', true);
        }
      },
    },
  },
});
