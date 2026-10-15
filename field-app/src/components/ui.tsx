import type { ReactNode } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View, type PressableProps } from "react-native";

import { colors } from "@/theme";

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const content = <View style={styles.content}>{children}</View>;
  return <SafeAreaView style={styles.safe}>{scroll ? <ScrollView contentContainerStyle={styles.scroll}>{content}</ScrollView> : content}</SafeAreaView>;
}

export function PageHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) {
  return <View style={styles.heading}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text>{detail ? <Text style={styles.detail}>{detail}</Text> : null}</View>;
}

export function ActionButton({ children, secondary, danger, style, ...props }: PressableProps & { children: ReactNode; secondary?: boolean; danger?: boolean }) {
  return <Pressable {...props} style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, danger && styles.buttonDanger, pressed && styles.buttonPressed, typeof style === "function" ? style({ pressed }) : style]}><Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{children}</Text></Pressable>;
}

export function StatePill({ state }: { state: string }) {
  return <View style={[styles.pill, state === "synced" && styles.pillSynced, state === "failed" && styles.pillFailed]}><Text style={styles.pillText}>{state}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: { flexGrow: 1 },
  content: { flex: 1, padding: 20, paddingBottom: 42 },
  heading: { gap: 5, marginBottom: 24 },
  eyebrow: { color: colors.orange, fontSize: 12, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  title: { color: colors.ink, fontSize: 34, lineHeight: 38, fontWeight: "800", letterSpacing: -1.2 },
  detail: { color: colors.muted, fontSize: 15, lineHeight: 22, maxWidth: 560 },
  button: { minHeight: 50, paddingHorizontal: 20, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: colors.evergreen },
  buttonSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.line },
  buttonDanger: { backgroundColor: colors.danger },
  buttonPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  buttonSecondaryText: { color: colors.ink },
  pill: { alignSelf: "flex-start", borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: "#E8DED2" },
  pillSynced: { backgroundColor: "#D8EBE3" },
  pillFailed: { backgroundColor: "#F2D9D3" },
  pillText: { color: colors.ink, fontSize: 10, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
});
