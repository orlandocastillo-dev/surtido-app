import { createAction } from "@reduxjs/toolkit";
import type { Sale } from "../../types";

// Acciones compartidas: una venta afecta a varios slices a la vez (inventario, ventas, carrito y fiado)
export const saleRecorded = createAction<Sale>("sales/recorded");
export const saleVoided = createAction<Sale>("sales/voided");
