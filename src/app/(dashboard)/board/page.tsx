import { PersonalBoard } from '@/components/features/personal-board/personal-board';
import { WeeklyGoalsWidget } from '@/components/features/weekly-goals/weekly-goals-widget';

export const dynamic = 'force-dynamic';

export default function BoardPage() {
  return (
    <div className="flex flex-col gap-6">
      <WeeklyGoalsWidget />
      <PersonalBoard />
    </div>
  );
}
