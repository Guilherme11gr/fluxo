export interface PersonalBoardItem {
  id: string;
  columnId: string;
  title: string;
  description?: string | null;
  priority: 'none' | 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string | null;
  order: number;
  createdAt?: string;
  updatedAt?: string;
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
