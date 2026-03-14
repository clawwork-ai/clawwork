import { create } from 'zustand';
import { buildSessionKey } from '@clawwork/shared';
import type { Task, TaskStatus, TaskRuntimeInfo } from '@clawwork/shared';
import { useUiStore } from './uiStore';

interface TaskState {
  tasks: Task[];
  activeTaskId: string | null;
  hydrated: boolean;
  taskRuntimes: Record<string, TaskRuntimeInfo>;

  createTask: (gatewayId?: string) => Task;
  setActiveTask: (id: string | null) => void;
  updateTaskTitle: (id: string, title: string) => void;
  updateTaskStatus: (id: string, status: TaskStatus) => void;
  setTaskRuntime: (taskId: string, runtime: TaskRuntimeInfo) => void;
  hydrate: () => Promise<void>;
  adoptTasks: (discovered: {
    taskId: string;
    sessionKey: string;
    title: string;
    updatedAt: string;
    gatewayId: string;
  }[]) => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  activeTaskId: null,
  hydrated: false,
  taskRuntimes: {},

  createTask: (gatewayId?) => {
    const resolvedGatewayId = gatewayId ?? useUiStore.getState().defaultGatewayId ?? '';
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const task: Task = {
      id,
      sessionKey: buildSessionKey(id),
      sessionId: '',
      title: '',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      tags: [],
      artifactDir: '',
      gatewayId: resolvedGatewayId,
    };
    set((s) => ({ tasks: [task, ...s.tasks], activeTaskId: id }));
    window.clawwork.persistTask(task).catch(() => {});
    return task;
  },

  setActiveTask: (id) => set({ activeTaskId: id }),

  updateTaskTitle: (id, title) => {
    const now = new Date().toISOString();
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, title, updatedAt: now } : t)),
    }));
    window.clawwork.persistTaskUpdate({ id, title, updatedAt: now }).catch(() => {});
  },

  updateTaskStatus: (id, status) => {
    const now = new Date().toISOString();
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, status, updatedAt: now } : t)),
    }));
    window.clawwork.persistTaskUpdate({ id, status, updatedAt: now }).catch(() => {});
  },

  setTaskRuntime: (taskId, runtime) => {
    set((s) => ({
      taskRuntimes: { ...s.taskRuntimes, [taskId]: runtime },
    }));
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const res = await window.clawwork.loadTasks();
      if (res.ok && res.rows) {
        set({
          tasks: res.rows.map((r) => ({
            ...r,
            status: r.status as TaskStatus,
          })),
          hydrated: true,
        });
      }
    } catch {
      console.warn('[taskStore] hydrate failed');
    }
  },

  adoptTasks: (discovered) => {
    const toPersist: Task[] = [];
    set((s) => {
      const existing = new Set(s.tasks.map((t) => t.id));
      const newTasks: Task[] = [];
      for (const d of discovered) {
        if (existing.has(d.taskId)) continue;
        const task: Task = {
          id: d.taskId,
          sessionKey: d.sessionKey,
          sessionId: '',
          title: d.title,
          status: 'active',
          createdAt: d.updatedAt,
          updatedAt: d.updatedAt,
          tags: [],
          artifactDir: '',
          gatewayId: d.gatewayId,
        };
        newTasks.push(task);
      }
      if (newTasks.length === 0) return s;
      toPersist.push(...newTasks);
      return { tasks: [...newTasks, ...s.tasks] };
    });
    for (const task of toPersist) {
      window.clawwork.persistTask(task).catch(() => {});
    }
  },
}));
