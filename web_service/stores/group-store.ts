// stores/group-store.ts
// Knowledge 页面共享 group 选择状态 —— 跨子页面持久化（sessionStorage）

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface GroupState {
  /** 当前选中的 group id，'all' 表示显示全部 */
  selectedGroupId: string;
  /** 切换选中 group */
  setSelectedGroup: (id: string) => void;
  /** group 被删除或失效时回退到 'all' */
  resetToAll: () => void;
}

export const useGroupStore = create<GroupState>()(
  persist(
    (set) => ({
      selectedGroupId: 'all',
      setSelectedGroup: (id) => set({ selectedGroupId: id }),
      resetToAll: () => set({ selectedGroupId: 'all' }),
    }),
    {
      name: 'graphiti-knowledge-group',
      storage: createJSONStorage(
        () => (typeof window !== 'undefined' ? sessionStorage : ({} as Storage)),
      ),
    },
  ),
);
