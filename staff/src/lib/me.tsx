"use client";
import { createContext, useContext } from "react";
import type { Staff } from "./sb";
export const MeCtx = createContext<Staff | null>(null);
export const useMe = () => useContext(MeCtx)!;
