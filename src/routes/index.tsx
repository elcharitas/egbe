import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({ component: Home });

function Home() {
  return (
    <main className="foundation">
      <span className="wordmark">
        egbe<span>●</span>
      </span>
      <p className="eyebrow">YOUR STUDY CIRCLE</p>
      <h1>
        Learn a little.
        <br />
        Go together.
      </h1>
      <p>Small steps. A circle behind you. Room to begin again.</p>
      <p className="notice">
        Foundation preview. Your learning space is being built.
      </p>
    </main>
  );
}
