import { create } from 'zustand';

interface AppState {
  user: any | null;
  wsConnected: boolean;
  setAuth: (user: any | null) => void;
  setWsConnected: (connected: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  wsConnected: false,
  setAuth: (user) => set({ user }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
}));
