import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Shift } from "../../types";

export interface CashState {
  shifts: Shift[];
  currentShiftId: string | null;
}

const initialState: CashState = { shifts: [], currentShiftId: null };

const cashSlice = createSlice({
  name: "cash",
  initialState,
  reducers: {
    shiftOpened(state, action: PayloadAction<{ id: string; openingCash: number; openedAt: string }>) {
      if (state.currentShiftId) return;
      state.shifts.push({ ...action.payload });
      state.currentShiftId = action.payload.id;
    },
    shiftClosed(state, action: PayloadAction<{ countedCash: number; expectedCash: number; closedAt: string }>) {
      const shift = state.shifts.find((s) => s.id === state.currentShiftId);
      if (!shift) return;
      Object.assign(shift, action.payload);
      state.currentShiftId = null;
    },
  },
});

export const { shiftOpened, shiftClosed } = cashSlice.actions;
export default cashSlice.reducer;
