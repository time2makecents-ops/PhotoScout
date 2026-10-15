import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { PageHeading, Screen } from "@/components/ui";
import { listCaptures } from "@/lib/db";
import type { FieldCapture } from "@/lib/types";
import { colors } from "@/theme";

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [captures, setCaptures] = useState<FieldCapture[]>([]);
  useFocusEffect(useCallback(() => { void listCaptures(db, ["synced"]).then(setCaptures); }, [db]));
  return <Screen><PageHeading eyebrow="Receipts" title="Sync history" detail="Thumbnails and server receipts stay here; full queued copies are removed after a successful sync." />
    <View style={styles.list}>{captures.map((capture) => <Pressable key={capture.id} style={styles.row} onPress={() => router.push(`/review/${capture.id}`)}>{capture.photos[0] ? <Image source={{ uri: capture.photos[0].thumbnail_uri }} style={styles.thumb} /> : null}<View style={{ flex: 1 }}><Text style={styles.name}>{capture.name}</Text><Text style={styles.meta}>Pin #{capture.location_id} · {capture.photos.length} photo{capture.photos.length === 1 ? "" : "s"}</Text><Text style={styles.slug}>{capture.slug}</Text></View></Pressable>)}</View>
    {!captures.length ? <Text style={styles.empty}>Completed uploads will appear here.</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({ list: { borderTopWidth: 1, borderTopColor: colors.line }, row: { flexDirection: "row", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line }, thumb: { width: 68, height: 68, borderRadius: 14 }, name: { color: colors.ink, fontSize: 17, fontWeight: "800" }, meta: { color: colors.muted, marginTop: 5, fontSize: 12 }, slug: { color: colors.orange, marginTop: 4, fontSize: 12 }, empty: { color: colors.muted, marginTop: 20 } });
