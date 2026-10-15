import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";

import { ActionButton, PageHeading, Screen } from "@/components/ui";
import { clearCredential, getCredential, pairWithPayload } from "@/lib/pairing";
import type { PairingCredential } from "@/lib/types";
import { colors } from "@/theme";

export default function PairScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [credential, setCredential] = useState<PairingCredential | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [manual, setManual] = useState("");
  const [deviceName, setDeviceName] = useState(`${Platform.OS === "ios" ? "iPhone" : "Android"} field phone`);
  const [status, setStatus] = useState("");
  useFocusEffect(useCallback(() => { void getCredential().then(setCredential); }, []));

  async function pair(raw: string) {
    if (scanned) return;
    setScanned(true);
    setStatus("Pairing…");
    try {
      const next = await pairWithPayload(raw.trim(), deviceName);
      setCredential(next);
      setScanning(false);
      setStatus("Phone paired. Queued captures can now sync.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Pairing failed.");
      setScanned(false);
    }
  }

  async function openScanner() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) { setStatus("Camera access is needed to scan the QR code. You can paste the code instead."); return; }
    }
    setScanned(false);
    setScanning(true);
  }

  if (scanning) {
    return <View style={styles.cameraPage}><CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={scanned ? undefined : ({ data }) => void pair(data)} /><View style={styles.scanFrame} /><View style={styles.scanCopy}><Text style={styles.scanTitle}>Scan PhotoScout QR</Text><Text style={styles.scanDetail}>Profile → PhotoScout Field → Pair a phone</Text><ActionButton secondary onPress={() => setScanning(false)}>Cancel</ActionButton></View></View>;
  }

  return <Screen><PageHeading eyebrow="Connection" title={credential ? "Phone paired" : "Pair this phone"} detail="Pair once while PhotoScout is reachable. Capturing remains available when the server is not." />
    {credential ? <View style={styles.connected}><Text style={styles.connectedMark}>✓</Text><View style={{ flex: 1 }}><Text style={styles.connectedTitle}>Ready to sync</Text><Text style={styles.server}>{credential.api_base_url}</Text></View></View> : null}
    {!credential ? <View style={styles.form}><Text style={styles.label}>Device name</Text><TextInput style={styles.input} value={deviceName} onChangeText={setDeviceName} placeholder="My field phone" /><ActionButton onPress={() => void openScanner()}>Scan pairing QR</ActionButton><Text style={styles.or}>or paste the pairing payload</Text><TextInput style={[styles.input, styles.payload]} value={manual} onChangeText={setManual} multiline autoCapitalize="none" autoCorrect={false} placeholder='{"version":1,…}' /><ActionButton secondary onPress={() => void pair(manual)} disabled={!manual.trim()}>Pair with pasted code</ActionButton></View> : <ActionButton secondary onPress={() => void clearCredential().then(() => { setCredential(null); setStatus("This phone is no longer paired locally."); })}>Forget this server</ActionButton>}
    {status ? <Text style={styles.status}>{status}</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({ cameraPage: { flex: 1, backgroundColor: "#000" }, scanFrame: { position: "absolute", left: "12%", right: "12%", top: "20%", aspectRatio: 1, borderWidth: 3, borderColor: colors.orange, borderRadius: 28 }, scanCopy: { position: "absolute", left: 20, right: 20, bottom: 36, gap: 12, padding: 20, borderRadius: 24, backgroundColor: "rgba(247,242,232,0.95)" }, scanTitle: { color: colors.ink, fontSize: 24, fontWeight: "800" }, scanDetail: { color: colors.muted, lineHeight: 20 }, form: { gap: 12 }, label: { color: colors.ink, fontWeight: "800" }, input: { minHeight: 50, paddingHorizontal: 15, borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.paperStrong, color: colors.ink }, payload: { minHeight: 110, paddingTop: 14, textAlignVertical: "top" }, or: { color: colors.muted, textAlign: "center", fontSize: 12 }, connected: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 18, marginBottom: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }, connectedMark: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.success, color: colors.white, textAlign: "center", textAlignVertical: "center", fontSize: 24, fontWeight: "800" }, connectedTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" }, server: { color: colors.muted, marginTop: 3, fontSize: 12 }, status: { color: colors.evergreen, marginTop: 18, lineHeight: 20 } });
