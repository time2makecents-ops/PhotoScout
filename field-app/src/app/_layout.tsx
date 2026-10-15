import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";

import { migrateDb } from "@/lib/db";
import { colors } from "@/theme";

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="photoscout-field.db" onInit={migrateDb}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: colors.paper }, headerTintColor: colors.evergreen, headerShadowVisible: false, contentStyle: { backgroundColor: colors.paper } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="capture/[id]" options={{ title: "Capture details", presentation: "card" }} />
        <Stack.Screen name="review/[id]" options={{ title: "Review & sync", presentation: "card" }} />
      </Stack>
    </SQLiteProvider>
  );
}
