import { PersonalBoard } from '@/components/features/personal-board/personal-board';
import { WeeklyGoalsWidget } from '@/components/features/weekly-goals/weekly-goals-widget';
import { QuickCapture } from '@/components/features/personal-notes/quick-capture';
import { PersonalNotesWidget } from '@/components/features/personal-notes/personal-notes-widget';

export const dynamic = 'force-dynamic';

export default function BoardPage() {
  return (
    <div className="flex flex-col gap-6">
      <QuickCapture />
      <WeeklyGoalsWidget />
      <PersonalNotesWidget />
      <PersonalBoard />
    </div>
  );
}
