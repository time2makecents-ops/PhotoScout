import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { ActionButton, PageHeading, Screen } from "@/components/ui";
import { addPhoto, getCapture, removePhoto, updateCapture, updatePhoto } from "@/lib/db";
import { deleteFileIfPresent, preparePhoto } from "@/lib/photos";
import type { FieldCapture, FieldPhoto } from "@/lib/types";
import { parseTags, validateCapture } from "@/lib/validation";
import { colors } from "@/theme";

export default function CaptureEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [capture, setCapture] = useState<FieldCapture | null>(null);
  const [locating, setLocating] = useState(false);
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [status, setStatus] = useState("");

  const reload = useCallback(async () => {
    if (id) setCapture(await getCapture(db, id));
  }, [db, id]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  useEffect(() => {
    if (!capture || capture.state === "synced") return;
    const timer = setTimeout(() => {
      void updateCapture(db, capture.id, {
        name: capture.name, notes: capture.notes, tags: capture.tags, visibility: capture.visibility,
        latitude: capture.latitude, longitude: capture.longitude, accuracy_meters: capture.accuracy_meters,
        heading_degrees: capture.heading_degrees, city: capture.city, region: capture.region,
        country: capture.country, zip_code: capture.zip_code, state: "draft", error_message: null,
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [capture, db]);

  function patch(values: Partial<FieldCapture>) {
    setCapture((current) => current ? { ...current, ...values } : current);
  }

  async function captureCurrentLocation() {
    setLocating(true);
    setStatus("Finding your position…");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Location permission was denied. Enter coordinates manually below.");
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      let heading: number | null = null;
      try {
        const result = await Location.getHeadingAsync();
        heading = result.trueHeading >= 0 ? result.trueHeading : result.magHeading;
      } catch { heading = null; }
      patch({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy_meters: position.coords.accuracy, heading_degrees: heading });
      setStatus(`GPS saved · ±${Math.round(position.coords.accuracy || 0)} m`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "GPS is unavailable.");
    } finally { setLocating(false); }
  }

  async function addAssets(assets: ImagePicker.ImagePickerAsset[], saveOriginal: boolean) {
    if (!capture) return;
    setAddingPhoto(true);
    try {
      const room = Math.max(0, 12 - capture.photos.length);
      for (const asset of assets.slice(0, room)) {
        const photo = await preparePhoto(asset, capture.id, capture.photos.length, saveOriginal);
        photo.heading_degrees = capture.heading_degrees;
        await addPhoto(db, photo);
        capture.photos.push(photo);
      }
      setCapture({ ...capture, photos: [...capture.photos] });
      setStatus(`${Math.min(assets.length, room)} photo${Math.min(assets.length, room) === 1 ? "" : "s"} saved offline.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The photo could not be prepared.");
    } finally { setAddingPhoto(false); }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { setStatus("Camera permission was denied."); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, exif: true });
    if (!result.canceled) await addAssets(result.assets, true);
  }

  async function choosePhotos() {
    if (!capture) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 12 - capture.photos.length, quality: 1, exif: true });
    if (!result.canceled) await addAssets(result.assets, false);
  }

  async function changePhoto(photo: FieldPhoto, values: Partial<FieldPhoto>) {
    const next = { ...photo, ...values };
    await updatePhoto(db, photo.id, next.title, next.image_role);
    await reload();
  }

  async function deletePhoto(photo: FieldPhoto) {
    deleteFileIfPresent(photo.local_uri);
    deleteFileIfPresent(photo.thumbnail_uri);
    await removePhoto(db, photo.id);
    await reload();
  }

  async function review() {
    if (!capture) return;
    await updateCapture(db, capture.id, { state: "ready" });
    router.push(`/review/${capture.id}`);
  }

  if (!capture) return <View style={styles.loading}><ActivityIndicator color={colors.orange} /></View>;
  const errors = validateCapture(capture);

  return <Screen><PageHeading eyebrow="Autosaved on this phone" title={capture.name || "New field capture"} detail="Record the pin first, then add the few details that make it useful." />
    <View style={styles.section}><View style={styles.sectionTitle}><Text style={styles.step}>1</Text><View><Text style={styles.h2}>Location pin</Text><Text style={styles.help}>GPS works without the PhotoScout server.</Text></View></View><ActionButton onPress={() => void captureCurrentLocation()}>{locating ? "Locating…" : capture.latitude === null ? "Use current location" : "Refresh GPS"}</ActionButton>
      {capture.latitude !== null ? <View style={styles.coordinate}><Text style={styles.coordinateValue}>{capture.latitude.toFixed(6)}, {capture.longitude!.toFixed(6)}</Text><Text style={styles.help}>{capture.accuracy_meters === null ? "Accuracy unavailable" : `Accuracy ±${Math.round(capture.accuracy_meters)} m`}</Text></View> : null}
      <View style={styles.twoCols}><Field label="Latitude" value={capture.latitude?.toString() || ""} keyboardType="numbers-and-punctuation" onChangeText={(value) => patch({ latitude: value.trim() ? Number(value) : null })} /><Field label="Longitude" value={capture.longitude?.toString() || ""} keyboardType="numbers-and-punctuation" onChangeText={(value) => patch({ longitude: value.trim() ? Number(value) : null })} /></View>
    </View>

    <View style={styles.section}><View style={styles.sectionTitle}><Text style={styles.step}>2</Text><View><Text style={styles.h2}>Photos</Text><Text style={styles.help}>Optional · up to 12 · JPEG copies are optimized for sync.</Text></View></View><View style={styles.actions}><ActionButton onPress={() => void takePhoto()} disabled={addingPhoto || capture.photos.length >= 12}>{addingPhoto ? "Preparing…" : "Take photo"}</ActionButton><ActionButton secondary onPress={() => void choosePhotos()} disabled={addingPhoto || capture.photos.length >= 12}>Choose photos</ActionButton></View>
      <View style={styles.photos}>{capture.photos.map((photo) => <View key={photo.id} style={styles.photoRow}><Image source={{ uri: photo.thumbnail_uri }} style={styles.photo} /><View style={styles.photoCopy}><TextInput style={styles.photoTitle} value={photo.title} onChangeText={(title) => setCapture((current) => current ? { ...current, photos: current.photos.map((item) => item.id === photo.id ? { ...item, title } : item) } : current)} onEndEditing={() => void changePhoto(capture.photos.find((item) => item.id === photo.id)!, { title: capture.photos.find((item) => item.id === photo.id)!.title })} /><Pressable style={styles.roleButton} onPress={() => void changePhoto(photo, { image_role: photo.image_role === "area_image" ? "location_photo" : "area_image" })}><Text style={styles.roleText}>{photo.image_role === "area_image" ? "Area shot" : "Location photo"}</Text></Pressable><Pressable onPress={() => void deletePhoto(photo)}><Text style={styles.remove}>Remove</Text></Pressable></View></View>)}</View>
    </View>

    <View style={styles.section}><View style={styles.sectionTitle}><Text style={styles.step}>3</Text><View><Text style={styles.h2}>Pin details</Text><Text style={styles.help}>Only four fields are required: title, notes, tags, and pin.</Text></View></View><Field label="Title" value={capture.name} onChangeText={(name) => patch({ name })} placeholder="West-facing warehouse" /><Field label="Notes" value={capture.notes} onChangeText={(notes) => patch({ notes })} placeholder="Access, light, sound, parking, contacts…" multiline /><Field label="Tags" value={capture.tags.join(", ")} onChangeText={(value) => patch({ tags: parseTags(value) })} placeholder="industrial, sunset, loading dock" />
      <View style={styles.visibility}><View><Text style={styles.label}>Private pin</Text><Text style={styles.help}>Only you and admins can see exact coordinates.</Text></View><Switch value={capture.visibility === "private"} onValueChange={(value) => patch({ visibility: value ? "private" : "public" })} trackColor={{ true: colors.orange }} /></View>
      <View style={styles.twoCols}><Field label="City" value={capture.city} onChangeText={(city) => patch({ city })} /><Field label="Region" value={capture.region} onChangeText={(region) => patch({ region })} /><Field label="Country" value={capture.country} onChangeText={(country) => patch({ country })} /><Field label="ZIP" value={capture.zip_code} onChangeText={(zip_code) => patch({ zip_code })} /></View>
    </View>
    {status ? <Text style={styles.status}>{status}</Text> : null}
    {errors.length ? <View style={styles.errors}>{errors.map((error) => <Text key={error} style={styles.error}>• {error}</Text>)}</View> : null}
    <View style={styles.footer}><ActionButton secondary onPress={() => router.back()}>Back to outbox</ActionButton><ActionButton onPress={() => void review()}>Review capture</ActionButton></View>
  </Screen>;
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, multiline, ...inputProps } = props;
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...inputProps} multiline={multiline} style={[styles.input, multiline && styles.textarea]} placeholderTextColor="#9B968B" /></View>;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper }, section: { gap: 13, paddingVertical: 20, borderTopWidth: 1, borderTopColor: colors.line }, sectionTitle: { flexDirection: "row", alignItems: "flex-start", gap: 12 }, step: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.orange, color: colors.white, textAlign: "center", textAlignVertical: "center", fontWeight: "800" }, h2: { color: colors.ink, fontSize: 21, fontWeight: "800" }, help: { color: colors.muted, fontSize: 12, lineHeight: 17 }, coordinate: { padding: 14, borderRadius: 16, backgroundColor: "#E5ECE8" }, coordinateValue: { color: colors.evergreen, fontWeight: "800" }, actions: { gap: 9 }, twoCols: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, field: { flexGrow: 1, flexBasis: 145, gap: 6 }, label: { color: colors.ink, fontSize: 13, fontWeight: "800" }, input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 15, backgroundColor: colors.paperStrong, color: colors.ink }, textarea: { minHeight: 116, paddingTop: 13, textAlignVertical: "top" }, visibility: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingVertical: 6 }, photos: { gap: 12 }, photoRow: { flexDirection: "row", gap: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line }, photo: { width: 96, height: 96, borderRadius: 16 }, photoCopy: { flex: 1, gap: 7 }, photoTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 4 }, roleButton: { alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, backgroundColor: "#EBDDD1" }, roleText: { color: colors.orange, fontSize: 11, fontWeight: "800" }, remove: { color: colors.danger, fontSize: 12 }, status: { color: colors.evergreen, lineHeight: 20, marginVertical: 10 }, errors: { gap: 5, marginVertical: 10 }, error: { color: colors.danger, lineHeight: 20 }, footer: { gap: 10, marginTop: 14 } });
