import { useGsdHookFeed } from '../hooks/useGsdHookFeed.js';

// ─────────────────────────────────────────────────────────────────────────────
// HooksTab — hook event feed table
// ─────────────────────────────────────────────────────────────────────────────

export function HooksTab() {
  const { hookEvents } = useGsdHookFeed();

  return (
    <div>
      {hookEvents.length === 0 ? (
        <p className="text-sm text-warden-text-dim">No hook events yet. Events appear as agents trigger lifecycle hooks.</p>
      ) : (
        <table className="w-full text-sm border-collapse font-mono">
          <thead>
            <tr className="text-warden-text-dim border-b border-warden-border">
              <th className="text-left py-2 pr-4 font-normal">Time</th>
              <th className="text-left py-2 pr-4 font-normal">Hook</th>
              <th className="text-left py-2 pr-4 font-normal">Event</th>
              <th className="text-left py-2 pr-4 font-normal">Agent</th>
              <th className="text-left py-2 pr-4 font-normal">Session</th>
              <th className="text-left py-2 font-normal">State</th>
            </tr>
          </thead>
          <tbody>
            {hookEvents.map((event, index) => {
              let displayTime = event.timestamp;
              try {
                const date = new Date(event.timestamp);
                displayTime = date.toTimeString().slice(0, 8);
              } catch {
                // Keep raw timestamp if parse fails
              }
              const hookName = event.hookScript.replace(/\.sh$/, '');

              return (
                <tr key={index} className="border-b border-warden-border/30 hover:bg-warden-panel/50">
                  <td className="py-1.5 pr-4 text-warden-text-dim">{displayTime}</td>
                  <td className="py-1.5 pr-4">{hookName}</td>
                  <td className="py-1.5 pr-4 text-warden-accent">{event.hookEventName || '\u2014'}</td>
                  <td className="py-1.5 pr-4 text-warden-text-dim">{event.agentId ?? '\u2014'}</td>
                  <td className="py-1.5 pr-4 text-warden-text-dim">{event.tmuxSession ?? '\u2014'}</td>
                  <td className="py-1.5 text-warden-text-dim">{event.state ?? '\u2014'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
