import { create } from 'zustand';
import i18n from '../i18n';
import type { ModelOption } from '@clawwork/shared';

type MainView = 'chat' | 'files' | 'archived';

type Theme = 'dark' | 'light';

export type Language = 'en' | 'zh';

export type GatewayConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export interface GatewayInfo {
  id: string;
  name: string;
  color?: string;
}

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

  /** Per-gateway connection status map */
  gatewayStatusMap: Record<string, GatewayConnectionStatus>;
  setGatewayStatusByGateway: (gatewayId: string, status: GatewayConnectionStatus) => void;

  /** Default gateway for new tasks */
  defaultGatewayId: string | null;
  setDefaultGatewayId: (id: string | null) => void;

  /** Cached gateway metadata for display (name, color) */
  gatewayInfoMap: Record<string, GatewayInfo>;
  setGatewayInfoMap: (map: Record<string, GatewayInfo>) => void;

  /** Catalog of models available per gateway */
  modelCatalogMap: Record<string, ModelOption[]>;
  setModelCatalog: (gatewayId: string, catalog: ModelOption[]) => void;

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

  gatewayStatusMap: {},
  setGatewayStatusByGateway: (gatewayId, status) =>
    set((s) => ({
      gatewayStatusMap: { ...s.gatewayStatusMap, [gatewayId]: status },
    })),

  defaultGatewayId: null,
  setDefaultGatewayId: (id) => set({ defaultGatewayId: id }),

  gatewayInfoMap: {},
  setGatewayInfoMap: (map) => set({ gatewayInfoMap: map }),

  modelCatalogMap: {},
  setModelCatalog: (gatewayId, catalog) =>
    set((s) => ({
      modelCatalogMap: { ...s.modelCatalogMap, [gatewayId]: catalog },
    })),

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
