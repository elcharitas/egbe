import { createFileRoute } from '@tanstack/react-router';
import { finishSignIn } from '../server/openai';

export const Route = createFileRoute('/auth/openai/callback')({
  server: {
    handlers: {
      GET: ({ request }) => finishSignIn(request),
    },
  },
});
