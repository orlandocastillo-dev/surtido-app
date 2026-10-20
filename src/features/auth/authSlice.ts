import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type Role = "dueño" | "vendedor";

export interface User {
  id: string;
  name: string;
  /** Usuario para entrar: correo o celular, en minúsculas. */
  login: string;
  role: Role;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

export interface AuthState {
  users: User[];
  sessionUserId: string | null;
}

const initialState: AuthState = { users: [], sessionUserId: null };

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    userCreated(state, action: PayloadAction<User>) {
      state.users.push(action.payload);
    },
    userRemoved(state, action: PayloadAction<string>) {
      const user = state.users.find((u) => u.id === action.payload);
      const owners = state.users.filter((u) => u.role === "dueño");
      // Nunca se puede quedar la tienda sin dueño.
      if (!user || (user.role === "dueño" && owners.length === 1)) return;
      state.users = state.users.filter((u) => u.id !== action.payload);
      if (state.sessionUserId === action.payload) state.sessionUserId = null;
    },
    passwordChanged(state, action: PayloadAction<{ id: string; passwordHash: string; salt: string }>) {
      const user = state.users.find((u) => u.id === action.payload.id);
      if (user) Object.assign(user, { passwordHash: action.payload.passwordHash, salt: action.payload.salt });
    },
    loggedIn(state, action: PayloadAction<string>) {
      if (state.users.some((u) => u.id === action.payload)) state.sessionUserId = action.payload;
    },
    loggedOut(state) {
      state.sessionUserId = null;
    },
  },
});

export const { userCreated, userRemoved, passwordChanged, loggedIn, loggedOut } = authSlice.actions;
export default authSlice.reducer;
