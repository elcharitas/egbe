import { createFileRoute } from '@tanstack/react-router';
import { startSignIn } from '../server/openai';

export const Route = createFileRoute('/auth/openai')({
  server: {
    handlers: {
      GET: ({ request }) => startSignIn(request),
    },
  },
});
