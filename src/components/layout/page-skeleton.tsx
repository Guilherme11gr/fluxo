import { Skeleton } from "@/components/ui/skeleton";

export function PageHeaderSkeleton({ withAction = true }: { withAction?: boolean }) {
    return (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div>
                <Skeleton className="h-8 w-48 md:w-64 mb-2" />
                <Skeleton className="h-4 w-64 md:w-96" />
            </div>
            {withAction && (
                <div className="flex gap-2">
                    <Skeleton className="h-10 w-10 md:w-28" />
                </div>
            )}
        </div>
    );
}

export function CardsSkeleton({ count = 3 }: { count?: number }) {
    return (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="rounded-xl border bg-card text-card-foreground shadow space-y-4 p-6 h-[200px]">
                    <div className="flex justify-between items-start">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-4 w-12" />
                    </div>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                </div>
            ))}
        </div>
    );
}

export function SingleColumnSkeleton() {
    return (
        <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
        </div>
    );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="rounded-md border">
            <div className="h-12 border-b bg-muted/40 px-4 flex items-center gap-4">
                <Skeleton className="h-4 w-[200px]" /> {/* Feature Header */}
                <Skeleton className="h-4 w-[120px] ml-auto hidden sm:block" /> {/* Status */}
                <Skeleton className="h-4 w-[180px] hidden md:block" /> {/* Health */}
                <Skeleton className="h-4 w-[200px] hidden lg:block" /> {/* Progress */}
                <Skeleton className="h-4 w-[100px] hidden lg:block" /> {/* Activity */}
                <Skeleton className="h-4 w-[50px]" /> {/* Actions */}
            </div>
            <div className="divide-y">
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4">
                        <div className="flex-1 flex flex-col gap-2">
                            <Skeleton className="h-4 w-[60%]" /> {/* Feature Title */}
                            <Skeleton className="h-3 w-[100px] sm:hidden" /> {/* Mobile extras */}
                        </div>
                        <Skeleton className="h-6 w-[100px] rounded-full hidden sm:block" /> {/* Status Badge */}
                        <Skeleton className="h-6 w-[140px] rounded-full hidden md:block" /> {/* Health Badge */}
                        <div className="w-[200px] hidden lg:block space-y-1"> {/* Progress Column */}
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-2 w-full rounded-full" />
                        </div>
                        <div className="w-[100px] flex -space-x-2 hidden lg:flex"> {/* Activity Avatars */}
                            <Skeleton className="h-8 w-8 rounded-full border-2 border-background" />
                            <Skeleton className="h-8 w-8 rounded-full border-2 border-background" />
                        </div>
                        <Skeleton className="h-8 w-8 rounded-md" /> {/* Action Button */}
                    </div>
                ))}
            </div>
        </div>
    );
}
