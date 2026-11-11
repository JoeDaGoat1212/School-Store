import { useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { type Restock, type RestockState, restockPhoto, skipRestock } from "./api";
import { formatTime } from "./format";
import { radius, score, type Colors } from "./theme";

const STEPS = ["Drinks", "Snacks (right half)", "Snacks (left half)", "Spicy chips", "Regular chips", "Ramen"];

/** "Snacks (right half)" → "right half of the snacks"; "Spicy chips" → "spicy chips". */
export function areaPhrase(area: string) {
  const m = area.match(/^(.+?)\s*\((.+)\)$/);
  return (m ? `${m[2]} of the ${m[1]}` : area).toLowerCase();
}
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** The Restock tab: what's on the list, and the button that starts the photos. */
export function RestockTab({ info, c, busy, error, onStart }: { info: RestockState; c: Colors; busy: boolean; error: string | null; onStart: () => void }) {
  if (info.state === "done") {
    return (
      <View style={[styles.card, { backgroundColor: c.tealDeep, borderColor: "rgba(47,208,194,0.35)", alignItems: "center", paddingVertical: 36 }]}>
        <View style={[styles.check, { backgroundColor: c.teal }]}>
          <Text style={{ fontSize: 26, fontWeight: "900", color: "#000" }}>✓</Text>
        </View>
        <Text style={[score, { fontSize: 40, lineHeight: 42, color: c.ink }]}>Restock done</Text>
        <Text style={{ color: c.muted, textAlign: "center", fontSize: 15 }}>
          Photos sent at {formatTime(info.at)}
          {info.period ? `, stamped ${info.period}` : ""}. The manager will check them.
        </Text>
      </View>
    );
  }
  if (info.state === "skipped") {
    return (
      <View style={[styles.card, { backgroundColor: c.paper, borderColor: c.rule }]}>
        <Text style={{ color: c.ink, fontSize: 17, fontWeight: "700" }}>Restock check skipped</Text>
        <Text style={{ color: c.muted, fontSize: 15 }}>You told the manager: “{info.note}”</Text>
      </View>
    );
  }
  const due = info.state === "due";
  return (
    <View style={[styles.card, { backgroundColor: c.paper, borderColor: c.rule }]}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <Text style={[score, { flex: 1, fontSize: 40, lineHeight: 42, color: c.ink }]}>Restock check</Text>
        {due && (
          <View style={{ backgroundColor: c.orange, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: "#000", fontWeight: "800", fontSize: 12 }}>To do</Text>
          </View>
        )}
      </View>
      <Text style={{ color: c.muted, fontSize: 15, lineHeight: 21 }}>
        {due
          ? `Fill each spot, then take a picture of it. The photos go to the manager together${info.period ? `, stamped ${info.period}` : ""}.`
          : "Nothing to check right now. This opens when you're clocked in, and stays open for 45 minutes after you clock out."}
      </Text>
      <View style={{ gap: 6 }}>
        {STEPS.map((a, i) => (
          <View key={a} style={[styles.step, { backgroundColor: "rgba(255,255,255,0.03)" }]}>
            <View style={[styles.num, { backgroundColor: "rgba(255,255,255,0.07)" }]}>
              <Text style={[score, { fontSize: 16, color: c.ink }]}>{i + 1}</Text>
            </View>
            <Text style={{ color: c.ink, fontSize: 15 }}>{capital(areaPhrase(a))}</Text>
          </View>
        ))}
      </View>
      {error && <Text style={{ color: c.red, fontWeight: "600" }}>{error}</Text>}
      {due && (
        <Pressable onPress={onStart} disabled={busy} style={({ pressed }) => [styles.button, { backgroundColor: c.orange, height: 58, opacity: busy ? 0.6 : pressed ? 0.9 : 1 }]}>
          {busy ? <ActivityIndicator color="#000" /> : <Text style={[styles.buttonText, { color: "#000" }]}>Start the restock check</Text>}
        </Pressable>
      )}
    </View>
  );
}

/*
 * The restock check: one area at a time ("2 of 6 · Snacks (right half)"), take a photo of
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
              <Text style={[styles.sub, { textAlign: "center" }]}>
                Thanks, {session.name.split(" ")[0]}. {session.areas.length} photos sent{session.period ? ` and stamped ${session.period}` : ""}. The manager will check them.
              </Text>
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
                <Text style={[styles.sub, { marginTop: 6 }]}>Fill it all the way, then take a picture of the {areaPhrase(area)}.</Text>
              </View>
              {preview && <Image source={{ uri: preview }} style={styles.preview} />}
              {error && <Text style={{ color: "#ff6b57", fontWeight: "600" }}>{error}</Text>}
              <Pressable onPress={snap} disabled={busy} style={({ pressed }) => [styles.button, { backgroundColor: c.orange, height: 64, opacity: busy ? 0.6 : pressed ? 0.9 : 1 }]}>
                {busy ? <ActivityIndicator color="#000" /> : <Text style={[styles.buttonText, { color: "#000", fontSize: 19 }]}>{error ? "Try again" : `Photo of the ${areaPhrase(area)}`}</Text>}
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
  card: { borderWidth: 1, borderRadius: radius.sheet, padding: 20, gap: 14 },
  check: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  step: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  num: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
