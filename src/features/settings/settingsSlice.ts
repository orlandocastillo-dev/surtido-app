import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface SettingsState {
  storeName: string;
  /** Pedir confirmación antes de vender a fiado por encima del cupo del cliente. */
  enforceCreditLimit: boolean;
}

const initialState: SettingsState = {
  storeName: "Tienda Doña Rosa",
  enforceCreditLimit: true,
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    settingsUpdated(state, action: PayloadAction<Partial<SettingsState>>) {
      Object.assign(state, action.payload);
    },
  },
});

export const { settingsUpdated } = settingsSlice.actions;
export default settingsSlice.reducer;
