import { create } from 'zustand';
import type { Place, UserInfo } from '@bubbles/shared';

interface PlaceState {
  currentPlace: Place | null;
  places: Place[];
  onlineUsers: UserInfo[];
  mySessionId: string | null;
  setCurrentPlace: (place: Place | null) => void;
  setPlaces: (places: Place[]) => void;
  setMySessionId: (id: string) => void;
  setOnlineUsers: (users: UserInfo[]) => void;
  addOnlineUser: (user: UserInfo) => void;
  removeOnlineUser: (sessionId: string) => void;
  renameOnlineUser: (sessionId: string, displayName: string) => void;
}

export const usePlaceStore = create<PlaceState>((set) => ({
  currentPlace: null,
  places: [],
  onlineUsers: [],
  mySessionId: null,

  setCurrentPlace: (place: Place | null) => set({ currentPlace: place }),

  setPlaces: (places: Place[]) => set({ places }),

  setMySessionId: (id: string) => set({ mySessionId: id }),

  setOnlineUsers: (users: UserInfo[]) => set({ onlineUsers: users }),

  addOnlineUser: (user: UserInfo) =>
    set((state) => {
      if (state.onlineUsers.some((u) => u.sessionId === user.sessionId)) {
        return state;
      }
      return { onlineUsers: [...state.onlineUsers, user] };
    }),

  removeOnlineUser: (sessionId: string) =>
    set((state) => ({
      onlineUsers: state.onlineUsers.filter((u) => u.sessionId !== sessionId),
    })),

  renameOnlineUser: (sessionId: string, displayName: string) =>
    set((state) => ({
      onlineUsers: state.onlineUsers.map((u) =>
        u.sessionId === sessionId ? { ...u, displayName } : u,
      ),
    })),
}));
