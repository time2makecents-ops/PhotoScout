import { Redirect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { createDraft } from "@/lib/db";
import { colors } from "@/theme";

export default function NewCaptureScreen() {
  const db = useSQLiteContext();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => { void createDraft(db).then((capture) => setId(capture.id)); }, [db]);
  if (id) return <Redirect href={`/capture/${id}`} />;
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper }}><ActivityIndicator color={colors.orange} /></View>;
}
