import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { StyleSheet, View, Animated, Easing } from "react-native";
import { Txt } from "./Txt";
import { useTheme } from "../theme-context";
import { radius, spacing } from "../theme";

type Toast = { id: number; message: string; kind: "info" | "success" | "error" };
type Ctx = { show: (message: string, kind?: Toast["kind"]) => void };
const ToastCtx = createContext<Ctx>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<any>(null);

  const show = useCallback((message: string, kind: Toast["kind"] = "info") => {
    setToast({ id: Date.now(), message, kind });
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.ease) }).start();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setToast(null));
    }, 2400);
  }, [opacity]);

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {toast && (
        <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]}>
          <ToastCard toast={toast} />
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const t = useTheme();
  const bg = toast.kind === "success" ? t.brand : toast.kind === "error" ? t.error : "#1C1C1E";
  const fg = toast.kind === "success" ? t.onBrand : "#FFFFFF";
  return (
    <View style={[styles.card, { backgroundColor: bg }]}>
      <Txt color={fg} weight="medium" testID="toast-message">{toast.message}</Txt>
    </View>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
  },
  card: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    maxWidth: "90%",
  },
});
