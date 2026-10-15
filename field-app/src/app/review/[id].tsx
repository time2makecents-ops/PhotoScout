import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";

import { ActionButton, PageHeading, Screen, StatePill } from "@/components/ui";
import { getCapture } from "@/lib/db";
import { getCredential } from "@/lib/pairing";
import { syncCapture } from "@/lib/sync";
import type { FieldCapture } from "@/lib/types";
import { validateCapture } from "@/lib/validation";
import { colors } from "@/theme";

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [capture, setCapture] = useState<FieldCapture | null>(null);
  const [paired, setPaired] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState("");

  const reload = useCallback(async () => {
    if (id) setCapture(await getCapture(db, id));
    setPaired(Boolean(await getCredential()));
  }, [db, id]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  async function sync() {
    if (!capture) return;
    setSyncing(true);
    setStatus("Uploading this package…");
    try {
      const receipt = await syncCapture(db, capture);
      setStatus(`Synced ${receipt.image_count} photo${receipt.image_count === 1 ? "" : "s"}.`);
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sync failed. The package is still queued.");
      await reload();
    } finally { setSyncing(false); }
  }

  if (!capture) return <View style={styles.loading}><ActivityIndicator color={colors.orange} /></View>;
  const errors = validateCapture(capture);
  const place = [capture.city, capture.region, capture.country].filter(Boolean).join(", ");

  return <Screen><PageHeading eyebrow={capture.state === "synced" ? "Sync receipt" : "Final check"} title={capture.name || "Untitled capture"} detail={capture.state === "synced" ? "This package is safely on the PhotoScout server." : "Nothing uploads until you press Sync now."} />
    <View style={styles.stateLine}><StatePill state={capture.state} /><Text style={styles.updated}>{capture.photos.length} photo{capture.photos.length === 1 ? "" : "s"}</Text></View>
    <View style={styles.photoStrip}>{capture.photos.map((photo) => <View key={photo.id} style={styles.photoWrap}><Image source={{ uri: photo.thumbnail_uri }} style={styles.photo} /><Text style={styles.role}>{photo.image_role === "area_image" ? "Area" : "Photo"}</Text></View>)}</View>
    <View style={styles.details}><ReviewLine label="Pin" value={capture.latitude === null ? "Missing" : `${capture.latitude.toFixed(6)}, ${capture.longitude!.toFixed(6)}`} /><ReviewLine label="Place" value={place || "Not specified"} /><ReviewLine label="Visibility" value={capture.visibility} /><ReviewLine label="Tags" value={capture.tags.join(", ") || "Missing"} /><View style={styles.notes}><Text style={styles.label}>Notes</Text><Text style={styles.value}>{capture.notes || "Missing"}</Text></View></View>
    {errors.length && capture.state !== "synced" ? <View style={styles.errors}>{errors.map((error) => <Text key={error} style={styles.error}>• {error}</Text>)}</View> : null}
    {capture.error_message ? <Text style={styles.error}>{capture.error_message}</Text> : null}
    {capture.state === "synced" ? <View style={styles.receipt}><Text style={styles.receiptTitle}>Receipt #{capture.receipt_id}</Text><Text style={styles.receiptCopy}>PhotoScout pin #{capture.location_id} · {capture.slug}</Text><Text style={styles.receiptCopy}>Full upload copies were removed. Thumbnails remain on this phone.</Text></View> : <View style={styles.actions}>{!paired ? <ActionButton onPress={() => router.push("/(tabs)/pair")}>Pair this phone</ActionButton> : <ActionButton onPress={() => void sync()} disabled={syncing || errors.length > 0}>{syncing ? "Syncing…" : capture.state === "failed" ? "Retry sync" : "Sync now"}</ActionButton>}<ActionButton secondary onPress={() => router.back()}>Edit capture</ActionButton></View>}
    {status ? <Text style={styles.status}>{status}</Text> : null}
  </Screen>;
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return <View style={styles.line}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper }, stateLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 16 }, updated: { color: colors.muted, fontSize: 12 }, photoStrip: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }, photoWrap: { position: "relative" }, photo: { width: 92, height: 92, borderRadius: 15 }, role: { position: "absolute", left: 6, bottom: 6, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99, overflow: "hidden", backgroundColor: "rgba(23,63,56,0.9)", color: colors.white, fontSize: 9, fontWeight: "800", textTransform: "uppercase" }, details: { borderTopWidth: 1, borderTopColor: colors.line }, line: { flexDirection: "row", gap: 20, justifyContent: "space-between", paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.line }, notes: { gap: 7, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line }, label: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7 }, value: { flex: 1, color: colors.ink, textAlign: "right", lineHeight: 20 }, errors: { gap: 4, paddingVertical: 16 }, error: { color: colors.danger, lineHeight: 20 }, actions: { gap: 10, marginTop: 22 }, receipt: { gap: 7, marginTop: 22, padding: 18, borderRadius: 18, backgroundColor: "#DDEBE5" }, receiptTitle: { color: colors.evergreen, fontSize: 19, fontWeight: "800" }, receiptCopy: { color: colors.evergreen, lineHeight: 20 }, status: { color: colors.evergreen, marginTop: 16, lineHeight: 20 } });
