import { createFileRoute } from '@tanstack/react-router';
import { authResponse, startGoogle } from '../server/google';

export const Route = createFileRoute('/auth/google')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await startGoogle(request);
        } catch {
          return authResponse(new URL(request.url), 'failure');
        }
      },
    },
  },
});
