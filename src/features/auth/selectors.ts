import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "../../app/store";

export const selectUsers = (s: RootState) => s.auth.users;

export const selectCurrentUser = createSelector([(s: RootState) => s.auth], (auth) =>
  auth.sessionUserId ? (auth.users.find((u) => u.id === auth.sessionUserId) ?? null) : null,
);

export const selectHasAccount = (s: RootState) => s.auth.users.length > 0;

/** Lo que puede hacer cada rol. El vendedor atiende; el dueño además administra. */
export type Permission = "reportes" | "ajustes" | "editarProductos" | "anularVentas" | "usuarios";

const OWNER_ONLY: Permission[] = ["reportes", "ajustes", "editarProductos", "anularVentas", "usuarios"];

export const selectCan = createSelector([selectCurrentUser], (user) => (permission: Permission) =>
  user ? user.role === "dueño" || !OWNER_ONLY.includes(permission) : false,
);
