export interface GroupConfig {
  id: number;
  name: string;
  color: string;
}

export const GROUPS: GroupConfig[] = [
  { id: 1, name: "Group 1", color: "bg-rose-500" },
  { id: 2, name: "Group 2", color: "bg-blue-500" },
  { id: 3, name: "Group 3", color: "bg-emerald-500" },
  { id: 4, name: "Group 4", color: "bg-amber-500" },
  { id: 5, name: "Group 5", color: "bg-violet-500" },
  { id: 6, name: "Group 6", color: "bg-cyan-500" },
];

export const COOLDOWN_GAP = 3;
