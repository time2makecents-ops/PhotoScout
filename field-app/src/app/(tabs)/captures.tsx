import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { ActionButton, PageHeading, Screen, StatePill } from "@/components/ui";
import { listCaptures } from "@/lib/db";
import type { FieldCapture } from "@/lib/types";
import { colors } from "@/theme";

export default function CapturesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [captures, setCaptures] = useState<FieldCapture[]>([]);

  useFocusEffect(useCallback(() => {
    void listCaptures(db, ["draft", "ready", "failed", "syncing"]).then(setCaptures);
  }, [db]));

  return (
    <Screen>
      <PageHeading eyebrow="Offline outbox" title="Field captures" detail="Everything here is stored on this phone. Sync only happens when you choose it." />
      {captures.length ? (
        <View style={styles.list}>
          {captures.map((capture) => (
            <Pressable key={capture.id} style={styles.row} onPress={() => router.push(`/capture/${capture.id}`)}>
              {capture.photos[0] ? <Image source={{ uri: capture.photos[0].thumbnail_uri }} style={styles.thumb} /> : <View style={styles.noPhoto}><Text style={styles.pin}>⌖</Text></View>}
              <View style={styles.copy}>
                <View style={styles.topline}><Text style={styles.name}>{capture.name || "Untitled capture"}</Text><StatePill state={capture.state} /></View>
                <Text style={styles.meta}>{capture.latitude === null ? "GPS needed" : `${capture.latitude.toFixed(5)}, ${capture.longitude!.toFixed(5)}`} · {capture.photos.length} photo{capture.photos.length === 1 ? "" : "s"}</Text>
                {capture.error_message ? <Text style={styles.error} numberOfLines={2}>{capture.error_message}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.empty}><Text style={styles.emptyTitle}>Ready when the signal isn’t.</Text><Text style={styles.emptyCopy}>Start a capture, record GPS and notes, then keep moving. The server can wait.</Text><ActionButton onPress={() => router.push("/(tabs)/new")}>Start first capture</ActionButton></View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { borderTopWidth: 1, borderTopColor: colors.line },
  row: { flexDirection: "row", gap: 14, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.line },
  thumb: { width: 84, height: 84, borderRadius: 16, backgroundColor: colors.evergreen },
  noPhoto: { width: 84, height: 84, borderRadius: 16, backgroundColor: colors.evergreen, alignItems: "center", justifyContent: "center" },
  pin: { color: colors.white, fontSize: 32 },
  copy: { flex: 1, gap: 7, paddingVertical: 3 },
  topline: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  name: { flex: 1, color: colors.ink, fontSize: 18, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17 },
  empty: { flex: 1, justifyContent: "center", gap: 14, minHeight: 420 },
  emptyTitle: { color: colors.ink, fontSize: 27, fontWeight: "800", letterSpacing: -0.7 },
  emptyCopy: { color: colors.muted, fontSize: 16, lineHeight: 23, marginBottom: 6 },
});
