import { useProAccess } from '@/hooks/use-pro-access';
import type { QuestionAllowance } from '@/lib/question-allowance';
import { Button } from './ui/button';
import { PlanComparison, PlanPrices, PlanSummary } from './PlanDetails';

export function YourPlan({ allowance }: { allowance?: QuestionAllowance }) {
  const access = useProAccess();
  return <section id="your-plan" className="your-plan" aria-labelledby="your-plan-heading">
    <PlanSummary access={access} allowance={allowance} />
    <PlanComparison access={access}>
      <PlanPrices monthlyAction={<Button disabled>Purchases coming soon</Button>} annualAction={<Button disabled>Purchases coming soon</Button>} />
    </PlanComparison>
    <p className="plan-purchase-note">Purchases are disabled. No charge or trial starts here.</p>
  </section>;
}
