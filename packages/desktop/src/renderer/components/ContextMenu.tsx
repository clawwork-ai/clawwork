import { useState, useCallback, type MouseEvent } from 'react';
import type { TaskStatus } from '@clawwork/shared';

export interface MenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
}

interface MenuState {
  isOpen: boolean;
  taskId: string;
  taskStatus: TaskStatus;
}

const INITIAL_STATE: MenuState = {
  isOpen: false,
  taskId: '',
  taskStatus: 'active',
};

export function useTaskContextMenu(
  updateStatus: (id: string, status: TaskStatus) => void,
) {
  const [state, setState] = useState<MenuState>(INITIAL_STATE);

  const openMenu = useCallback(
    (e: MouseEvent, taskId: string, taskStatus: TaskStatus) => {
      e.preventDefault();
      setState({ isOpen: true, taskId, taskStatus });
    },
    [],
  );

  const closeMenu = useCallback(() => {
    setState((s) => ({ ...s, isOpen: false }));
  }, []);

  const items: MenuItem[] = [];

  if (state.taskStatus === 'active') {
    items.push({
      label: '\u6807\u8BB0\u5B8C\u6210',
      action: () => updateStatus(state.taskId, 'completed'),
    });
    items.push({
      label: '\u5F52\u6863',
      action: () => updateStatus(state.taskId, 'archived'),
      danger: true,
    });
  } else if (state.taskStatus === 'completed') {
    items.push({
      label: '\u91CD\u65B0\u6FC0\u6D3B',
      action: () => updateStatus(state.taskId, 'active'),
    });
    items.push({
      label: '\u5F52\u6863',
      action: () => updateStatus(state.taskId, 'archived'),
      danger: true,
    });
  }

  return {
    items,
    taskId: state.taskId,
    taskStatus: state.taskStatus,
    isOpen: state.isOpen,
    openMenu,
    closeMenu,
  };
}
