import { useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { type Restock, restockPhoto, skipRestock } from "./api";
import { radius, type Colors } from "./theme";

/*
 * After clocking out: one area at a time ("2 of 4 · Snacks"), take a photo of
 * it fully stocked, it uploads, next area. The manager checks them on the
 * website (Team → Restock checks).
 */
export function RestockFlow({ session, c, onClose }: { session: Restock; c: Colors; onClose: () => void }) {
  const [done, setDone] = useState<string[]>(session.done);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [why, setWhy] = useState("");

  const remaining = session.areas.filter((a) => !done.includes(a));
  const area = remaining[0];
  const step = session.areas.length - remaining.length + 1;

  const snap = async () => {
    if (!area) return;
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError("Allow the camera so you can take the restock photos.");
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.4, base64: true, exif: false });
    if (shot.canceled || !shot.assets[0]?.base64) return;
    const a = shot.assets[0];
    setPreview(a.uri);
    setBusy(true);
    try {
      await restockPhoto(session, area, a.base64!, a.mimeType ?? "image/jpeg");
      setDone((d) => [...d, area]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That photo didn't upload. Try again.");
    } finally {
      setBusy(false);
      setPreview(null);
    }
  };

  const skip = async () => {
    setBusy(true);
    await skipRestock(session, why).catch(() => undefined);
    setBusy(false);
    onClose();
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={() => setSkipping(true)}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: c.dark }]}>
          <View style={styles.progress}>
            {session.areas.map((a) => (
              <View key={a} style={[styles.seg, { backgroundColor: done.includes(a) ? "#3dd68c" : a === area ? c.orange : "rgba(255,255,255,0.15)" }]} />
            ))}
          </View>

          {!area ? (
            <View style={{ alignItems: "center", gap: 10, paddingVertical: 12 }}>
              <Text style={styles.big}>Restock photos sent</Text>
              <Text style={styles.sub}>Thanks, {session.name.split(" ")[0]}. The manager will check them.</Text>
              <Pressable onPress={onClose} style={[styles.button, { backgroundColor: "#fff", alignSelf: "stretch" }]}>
                <Text style={[styles.buttonText, { color: "#000" }]}>Done</Text>
              </Pressable>
            </View>
          ) : skipping ? (
            <View style={{ gap: 12 }}>
              <Text style={styles.title}>Why can't you finish?</Text>
              <Text style={styles.sub}>The manager will see this instead of the photos.</Text>
              <TextInput
                value={why}
                onChangeText={setWhy}
                maxLength={200}
                multiline
                placeholder="Out of ramen, nothing to restock with"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.input}
              />
              <Pressable onPress={skip} disabled={busy} style={[styles.button, { backgroundColor: "#fff" }]}>
                {busy ? <ActivityIndicator color="#000" /> : <Text style={[styles.buttonText, { color: "#000" }]}>Send</Text>}
              </Pressable>
              <Pressable onPress={() => setSkipping(false)} style={{ alignItems: "center", padding: 8 }}>
                <Text style={styles.sub}>Back</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              <View>
                <Text style={styles.sub}>
                  Restock check, {step} of {session.areas.length}
                </Text>
                <Text style={styles.big}>{area}</Text>
                <Text style={[styles.sub, { marginTop: 6 }]}>Fill it all the way, then take a photo that shows the whole {area.toLowerCase()}.</Text>
              </View>
              {preview && <Image source={{ uri: preview }} style={styles.preview} />}
              {error && <Text style={{ color: "#ff6b57", fontWeight: "600" }}>{error}</Text>}
              <Pressable onPress={snap} disabled={busy} style={({ pressed }) => [styles.button, { backgroundColor: c.orange, height: 64, opacity: busy ? 0.6 : pressed ? 0.9 : 1 }]}>
                {busy ? <ActivityIndicator color="#000" /> : <Text style={[styles.buttonText, { color: "#000", fontSize: 19 }]}>{error ? "Try again" : `Photo of the ${area.toLowerCase()}`}</Text>}
              </Pressable>
              <Pressable onPress={() => setSkipping(true)} style={{ alignItems: "center", padding: 6 }}>
                <Text style={[styles.sub, { textDecorationLine: "underline" }]}>Can't finish the restock?</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: radius.sheet * 1.5, borderTopRightRadius: radius.sheet * 1.5, padding: 24, paddingBottom: 40, gap: 20 },
  progress: { flexDirection: "row", gap: 6 },
  seg: { flex: 1, height: 4, borderRadius: 2 },
  title: { color: "#fff", fontSize: 22, fontWeight: "700" },
  big: { color: "#fff", fontSize: 34, fontWeight: "700", marginTop: 2 },
  sub: { color: "rgba(255,255,255,0.65)", fontSize: 15, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", borderRadius: radius.control, color: "#fff", padding: 12, minHeight: 80, fontSize: 16, textAlignVertical: "top" },
  button: { height: 54, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  buttonText: { fontSize: 17, fontWeight: "700" },
  preview: { height: 180, borderRadius: radius.control, opacity: 0.7 },
});
