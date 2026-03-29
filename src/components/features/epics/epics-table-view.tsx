"use client";

import Link from "next/link";
import { MoreHorizontal, Pencil, PlayCircle, Trash2, Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EpicRiskBadge } from "@/components/features/epics/epic-risk-badge";
import { cn } from "@/lib/utils";
import { useUpdateEpic } from "@/lib/query";
import { formatRelativeTime } from "@/shared/utils/formatters";
import { normalizeEpicStatus, type ProjectEpicListItem } from "./epics-view-model";

interface EpicsTableViewProps {
  epics: ProjectEpicListItem[];
  projectId: string;
  onEdit: (epic: ProjectEpicListItem) => void;
  onDelete: (epic: ProjectEpicListItem) => void;
}

export function EpicsTableView({
  epics,
  projectId,
  onEdit,
  onDelete,
}: EpicsTableViewProps) {
  const updateEpic = useUpdateEpic();

  if (epics.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 py-10 text-center text-muted-foreground">
        Nenhuma epic encontrada neste filtro.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 transition-colors">
            <th className="h-10 px-4 text-left font-medium text-muted-foreground">Epic</th>
            <th className="h-10 w-[132px] px-4 text-left font-medium text-muted-foreground">Status</th>
            <th className="h-10 w-[160px] px-4 text-left font-medium text-muted-foreground">Risco</th>
            <th className="h-10 w-[120px] px-4 text-left font-medium text-muted-foreground">Features</th>
            <th className="h-10 w-[140px] px-4 text-left font-medium text-muted-foreground">Atualizada</th>
            <th className="h-10 w-[56px] px-4 text-right" />
          </tr>
        </thead>
        <tbody>
          {epics.map((epic) => {
            const normalizedStatus = normalizeEpicStatus(epic.status);
            const isOpen = normalizedStatus === "OPEN";
            const featureCount = epic._count?.features ?? 0;

            return (
              <tr
                key={epic.id}
                className={cn(
                  "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
                  !isOpen && "opacity-80"
                )}
              >
                <td className="p-4 align-middle font-medium">
                  <div className="flex flex-col gap-1">
                    <Link
                      href={`/projects/${projectId}/epics/${epic.id}`}
                      className="flex items-center gap-2 hover:underline"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        E-{epic.id.slice(0, 4)}
                      </span>
                      <span>{epic.title}</span>
                    </Link>
                    <div className="flex items-center gap-2">
                      {isOpen ? (
                        <span className="flex items-center gap-1.5 text-[10px] font-medium text-primary">
                          <PlayCircle className="h-3 w-3" />
                          Aberta
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                          <Archive className="h-3 w-3" />
                          Encerrada
                        </span>
                      )}
                    </div>
                    {epic.description ? (
                      <p className="line-clamp-2 max-w-[60ch] text-xs text-muted-foreground">
                        {epic.description}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="p-4 align-middle">
                  <Select
                    value={normalizedStatus}
                    onValueChange={(newStatus) => {
                      updateEpic.mutate({
                        id: epic.id,
                        data: { status: newStatus as "OPEN" | "CLOSED" },
                      });
                    }}
                    disabled={updateEpic.isPending}
                  >
                    <SelectTrigger className="h-7 w-[112px] text-xs font-normal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN">Aberta</SelectItem>
                      <SelectItem value="CLOSED">Fechada</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-4 align-middle">
                  {epic.risk ? (
                    <EpicRiskBadge
                      risk={epic.risk}
                      riskReason={epic.riskReason}
                      riskUpdatedAt={epic.riskUpdatedAt}
                      showLabel
                      size="sm"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">Sem análise</span>
                  )}
                </td>
                <td className="p-4 align-middle">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="min-w-9 justify-center">
                      {featureCount}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {featureCount === 1 ? "feature" : "features"}
                    </span>
                  </div>
                </td>
                <td className="p-4 align-middle text-xs text-muted-foreground">
                  {epic.updatedAt ? formatRelativeTime(epic.updatedAt) : "Agora há pouco"}
                </td>
                <td className="p-4 align-middle text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Abrir menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(epic)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDelete(epic)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
