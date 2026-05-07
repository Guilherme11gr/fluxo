export interface PersonalBoardTagInfo {
  id: string;
  name: string;
  color: string;
}

export interface PersonalBoardItem {
  id: string;
  columnId: string;
  title: string;
  description?: string | null;
  priority?: 'none' | 'low' | 'medium' | 'high' | 'urgent' | null;
  dueDate?: string | null;
  linkedTaskId?: string | null;
  order: number;
  createdAt?: string;
  updatedAt?: string;
  tags?: PersonalBoardTagInfo[];
  tagAssignments?: { tag: PersonalBoardTagInfo }[];
}

export interface PersonalBoardColumn {
  id: string;
  title: string;
  color: string;
  order: number;
  items: PersonalBoardItem[];
  createdAt?: string;
  updatedAt?: string;
}
