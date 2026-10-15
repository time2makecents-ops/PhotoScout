import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";

import { colors } from "@/theme";

function TabIcon({ symbol, color }: { symbol: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 18, fontWeight: "800" }}>{symbol}</Text>;
}

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.orange, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.paperStrong, borderTopColor: colors.line, height: 72, paddingBottom: 12, paddingTop: 7 }, tabBarLabelStyle: { fontSize: 11, fontWeight: "700" } }}>
      <Tabs.Screen name="captures" options={{ title: "Captures", tabBarIcon: ({ color }) => <TabIcon symbol="◎" color={color} /> }} />
      <Tabs.Screen name="new" options={{ title: "New", tabBarIcon: ({ color }) => <TabIcon symbol="＋" color={color} /> }} />
      <Tabs.Screen name="history" options={{ title: "History", tabBarIcon: ({ color }) => <TabIcon symbol="✓" color={color} /> }} />
      <Tabs.Screen name="pair" options={{ title: "Pair", tabBarIcon: ({ color }) => <TabIcon symbol="⌁" color={color} /> }} />
    </Tabs>
  );
}
