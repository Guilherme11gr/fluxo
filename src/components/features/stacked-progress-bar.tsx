import { cn } from "@/lib/utils";

interface TaskStatus {
    status: string;
    type: string;
}

interface StackedProgressBarProps {
    tasks: TaskStatus[];
    className?: string;
}

export function StackedProgressBar({ tasks, className }: StackedProgressBarProps) {
    if (!tasks || tasks.length === 0) {
        return (
            <div className={cn("h-2 w-full bg-muted/50 rounded-full", className)} />
        );
    }

    const totals = tasks.reduce(
        (acc, task) => {
            // Red: Bugs not done
            if (task.type === "BUG" && task.status !== "DONE") {
                acc.bugs += 1;
                return acc;
            }

            // Green: Done
            if (task.status === "DONE") {
                acc.done += 1;
                return acc;
            }

            // Blue: Doing
            if (task.status === "DOING") {
                acc.doing += 1;
                return acc;
            }

            // Gray: Backlog/Todo
            acc.todo += 1;
            return acc;
        },
        { bugs: 0, done: 0, doing: 0, todo: 0 }
    );

    const total = tasks.length;

    // Calculate percentages
    const percentages = {
        bugs: (totals.bugs / total) * 100,
        done: (totals.done / total) * 100,
        doing: (totals.doing / total) * 100,
        todo: (totals.todo / total) * 100,
    };

    return (
        <div className={cn("h-1.5 w-full flex rounded-full overflow-hidden bg-muted/30", className)}>
            {percentages.done > 0 && (
                <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${percentages.done}%` }}
                    title={`Done: ${totals.done}`}
                />
            )}
            {percentages.doing > 0 && (
                <div
                    className="h-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${percentages.doing}%` }}
                    title={`Doing: ${totals.doing}`}
                />
            )}
            {percentages.todo > 0 && (
                <div
                    className="h-full bg-zinc-600 transition-all duration-500"
                    style={{ width: `${percentages.todo}%` }}
                    title={`Todo: ${totals.todo}`}
                />
            )}
            {percentages.bugs > 0 && (
                <div
                    className="h-full bg-red-500 transition-all duration-500"
                    style={{ width: `${percentages.bugs}%` }}
                    title={`Bugs: ${totals.bugs}`}
                />
            )}
        </div>
    );
}
