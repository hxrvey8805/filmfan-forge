import type { CompanionMessage } from '@/hooks/use-companion';

export function CompanionAnswer({ message }: { message: CompanionMessage }) {
  return <div className="space-y-2">
    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{message.answer}</p>
    {message.answer_status === 'insufficient_evidence' && <p className="text-xs text-muted-foreground">No question or coins used.</p>}
    {Array.isArray(message.evidence) && message.evidence.length > 0 && <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">Caption sources</summary>
      <ul className="mt-2 space-y-1">{message.evidence.map(item => <li key={item.id}>{item.label}</li>)}</ul>
    </details>}
  </div>;
}
