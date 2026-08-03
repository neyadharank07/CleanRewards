import React, { createContext, useContext } from "react";
import { useColorScheme } from "react-native";
import { buildTheme, Theme } from "./theme";

const Ctx = createContext<Theme>(buildTheme(false));

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const t = buildTheme(scheme === "dark");
  return <Ctx.Provider value={t}>{children}</Ctx.Provider>;
}

export function useTheme(): Theme {
  return useContext(Ctx);
}
