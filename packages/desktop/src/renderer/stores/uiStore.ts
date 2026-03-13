import { create } from 'zustand';
import i18n from '../i18n';

type MainView = 'chat' | 'files' | 'archived';

type Theme = 'dark' | 'light';

export type Language = 'en' | 'zh';

type GatewayConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface UiState {
  rightPanelOpen: boolean;
  toggleRightPanel: () => void;
  setRightPanelOpen: (open: boolean) => void;

  mainView: MainView;
  setMainView: (view: MainView) => void;

  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;

  theme: Theme;
  setTheme: (theme: Theme) => void;

  language: Language;
  setLanguage: (lang: Language) => void;

  gatewayStatus: GatewayConnectionStatus;
  setGatewayStatus: (status: GatewayConnectionStatus) => void;

  /** taskIds with unread messages (background tasks that received new content) */
  unreadTaskIds: Set<string>;
  markUnread: (taskId: string) => void;
  clearUnread: (taskId: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  rightPanelOpen: false,
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),

  mainView: 'chat',
  setMainView: (view) => set({ mainView: view, settingsOpen: false }),

  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  theme: 'dark',
  setTheme: (theme) => set({ theme }),

  language: 'en',
  setLanguage: (lang) => {
    i18n.changeLanguage(lang);
    set({ language: lang });
    window.clawwork.updateSettings({ language: lang });
  },

  gatewayStatus: 'connecting',
  setGatewayStatus: (status) => set({ gatewayStatus: status }),

  unreadTaskIds: new Set(),
  markUnread: (taskId) =>
    set((s) => {
      const next = new Set(s.unreadTaskIds);
      next.add(taskId);
      return { unreadTaskIds: next };
    }),
  clearUnread: (taskId) =>
    set((s) => {
      const next = new Set(s.unreadTaskIds);
      next.delete(taskId);
      return { unreadTaskIds: next };
    }),
}));
